import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { jwtVerify } from "jose";
import { chatCompletion } from "./lmstudio.js";
import {
  saveJobSubmission,
  saveResults,
  saveStoredResumes,
  normalizeJobTitle,
  getJobIdForNormalizedTitle,
  registerTitle,
  listJobsForUser,
  loadJobBundle,
  resolveJobDir,
  updateCandidateInJob,
  saveSimulationInvite,
  loadSimulationInvite,
  updateSimulationInvite,
} from "./storage.js";
import { resumeToText } from "./resumeText.js";
import {
  isWaitlistSmtpConfigured,
  validateWaitlistPayload,
  sendWaitlistEmail,
} from "./waitlistMail.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const AUTH_SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
const AUTH_SECRET_BYTES = new TextEncoder().encode(AUTH_SECRET);
const AUTH_ISSUER = "sockethr-next";
const AUTH_AUDIENCE = "sockethr-mac-api";
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || "https://sockethr.com,http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean),
);

function safeParseJSON(raw) {
  if (!raw || typeof raw !== "string") throw new Error("Empty model response");
  const clean = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(clean);
  } catch {
    const arrayMatch = clean.match(/\[[\s\S]*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]);
    const objectMatch = clean.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);
    throw new Error("Model response was not valid JSON");
  }
}

/** @param {unknown} parsed */
function normalizeScoredArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const o = /** @type {Record<string, unknown>} */ (parsed);
    if (Array.isArray(o.candidates)) return o.candidates;
    if (Array.isArray(o.scores)) return o.scores;
    if ("index" in o) return [o];
  }
  return [];
}

function maxCandidateId(candidates) {
  let m = -1;
  for (const c of candidates) {
    const id = c?.id;
    if (typeof id === "number" && Number.isFinite(id)) m = Math.max(m, id);
  }
  return m;
}

function safeScore(value, fallback = 5) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(10, Math.round(n))) : fallback;
}

function safeStringArray(value) {
  if (Array.isArray(value)) return value.map((x) => String(x || "")).filter(Boolean);
  if (typeof value === "string") return value.split("\n").map((x) => x.trim()).filter(Boolean);
  return [];
}

/** @param {Array<{ name: string, base64: string, type?: string }>} resumes */
async function extractResumeFields(resumes) {
  const extracted = [];
  for (let i = 0; i < resumes.length; i++) {
    const f = resumes[i];
    const resumeText = await resumeToText(f.base64, f.type || "", f.name);

    const userPrompt = `Extract the following fields from this resume text as a single JSON object. Respond ONLY with raw JSON, no markdown.

Resume text:
${resumeText}

Fields:
- name (string, "Unknown Candidate ${i + 1}" if missing)
- email (string, "" if missing)
- phone (string, "" if missing)
- years_experience (number, estimate)
- skills (array of strings, top 8)
- education (string, highest degree + institution)
- recent_role (string, most recent title + company)
- raw_summary (2-3 sentence background narrative)`;

    const raw = await chatCompletion([{ role: "user", content: userPrompt }], {
      maxTokens: 1500,
      temperature: 0.2,
    });
    extracted.push(safeParseJSON(raw));
  }
  return extracted;
}

/**
 * @param {object} job
 * @param {unknown[]} extracted
 */
async function scoreExtractedForJob(job, extracted) {
  const scoringPrompt = `You are an expert recruiter. Score each candidate for the following job. Return ONLY a raw JSON array, no markdown.

JOB TITLE: ${job.title}
JOB DESCRIPTION: ${job.description}
REQUIREMENTS: ${job.requirements}
CULTURE & FIT: ${job.culture || ""}

CANDIDATES:
${extracted.map((c, i) => `Candidate ${i} (index ${i}): ${JSON.stringify(c)}`).join("\n")}

For each candidate return:
- index (0-based, matching input order)
- score (integer 1-10, be discriminating — use the full range)
- score_rationale (1 sentence explaining the score)
- strengths (array of 3-5 specific bullets grounded in the resume)
- weaknesses (array of 2-3 specific bullets grounded in the resume)
- fit_summary (1 concise sentence on overall fit for THIS role)`;

  const scoredRaw = await chatCompletion([{ role: "user", content: scoringPrompt }], {
    maxTokens: 4096,
    temperature: 0.3,
  });
  return normalizeScoredArray(safeParseJSON(scoredRaw));
}

/**
 * @param {unknown[]} extracted
 * @param {unknown[]} scored
 * @param {Array<{ name: string }>} resumes
 * @param {number} idOffset — first candidate id for index 0
 */
function buildCandidatesFromExtracted(extracted, scored, resumes, idOffset) {
  const rows = extracted.map((c, i) => {
    const s = scored.find((x) => x.index === i) || scored[i] || {};
    return {
      id: idOffset + i,
      ...c,
      fileName: resumes[i].name,
      resumeScore: safeScore(s.score),
      score: safeScore(s.score),
      score_rationale: s.score_rationale || "",
      strengths: s.strengths || [],
      weaknesses: s.weaknesses || [],
      fit_summary: s.fit_summary || "",
      testStatus: "pending",
      hireStatus: "none",
      simulationScore: null,
      assessmentStrengths: [],
      assessmentGaps: [],
      assessmentSummary: "",
      coachingNote: "",
      generatedQuestions: [],
      questionBreakdown: [],
      simulationReport: null,
      manualRank: null,
      interviewNotes: "",
      interviewDate: "",
      interviewTime: "",
      interviewSummary: "",
      integrityFlag: false,
      storedLocally: false,
      storageWarning: "",
    };
  });
  return rows.sort((a, b) => b.score - a.score);
}

function normalizeQuestionArray(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.questions)) return parsed.questions;
  return [];
}

async function generateSimulationQuestions(job, candidate) {
  const prompt = `Generate 5 job simulation questions for this candidate and role.

ROLE: ${job.title}
DESCRIPTION: ${job.description}
REQUIREMENTS: ${job.requirements}
CANDIDATE: ${JSON.stringify(candidate)}

Generate exactly:
1. Two "case_unfolding" questions with phase1_situation, phase1_question, phase2_reveal, phase2_question.
2. One "prioritization" question with exactly 5 items.
3. One "short_answer" question asking for a realistic artifact.
4. One "multiple_choice" judgment question with exactly 4 options.

Make everything specific to the role. Return ONLY a raw JSON array:
[
  {"type":"case_unfolding","scenario":"...","phase1_situation":"...","phase1_question":"...","phase2_reveal":"...","phase2_question":"..."},
  {"type":"prioritization","scenario":"...","question":"...","items":["...","...","...","...","..."]},
  {"type":"multiple_choice","scenario":"...","question":"...","options":["A) ...","B) ...","C) ...","D) ..."]},
  {"type":"short_answer","scenario":"...","question":"..."},
  {"type":"case_unfolding","scenario":"...","phase1_situation":"...","phase1_question":"...","phase2_reveal":"...","phase2_question":"..."}
]`;
  const raw = await chatCompletion([{ role: "user", content: prompt }], { maxTokens: 3000, temperature: 0.45 });
  return normalizeQuestionArray(safeParseJSON(raw));
}

/** Strip common Markdown so interview drafts work in plain-text email clients. */
function plainTextEmailDraft(raw) {
  if (!raw || typeof raw !== "string") return "";
  let s = raw.replace(/\r\n/g, "\n");
  s = s.replace(/```[\w]*\n?([\s\S]*?)```/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/__([^_]+)__/g, "$1");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/~~([^~]+)~~/g, "$1");
  s = s.replace(/\*([^*\n]+)\*/g, "$1");
  s = s.replace(/(^|\s)_([^_\n]+)_(\s|$|[.,;:!?])/g, "$1$2$3");
  return s.trim();
}

const app = express();
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || ALLOWED_ORIGINS.has(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "50mb" }));

async function getAuthFromRequest(req) {
  if (!AUTH_SECRET) {
    const err = new Error(
      "Missing AUTH_SECRET on API server. In server/.env set AUTH_SECRET to the same value as NEXTAUTH_SECRET on Vercel, then restart (npm run server)."
    );
    err.statusCode = 500;
    throw err;
  }
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (!token) {
    const err = new Error("Missing bearer token");
    err.statusCode = 401;
    throw err;
  }
  const verified = await jwtVerify(token, AUTH_SECRET_BYTES, {
    issuer: AUTH_ISSUER,
    audience: AUTH_AUDIENCE,
  });
  const uploaderEmail = String(verified.payload.email || verified.payload.sub || "").trim().toLowerCase();
  if (!uploaderEmail) {
    const err = new Error("Invalid token subject");
    err.statusCode = 401;
    throw err;
  }
  return { email: uploaderEmail, name: String(verified.payload.name || "") };
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sockethr-server",
    authConfigured: Boolean(AUTH_SECRET),
  });
});

/**
 * POST /api/waitlist
 * body: { firstName, lastName, company?, email, phone?, notes? }
 * Sends notification via Gmail (or other SMTP) when WAITLIST_SMTP_* env vars are set.
 */
app.post("/api/waitlist", async (req, res) => {
  if (!isWaitlistSmtpConfigured()) {
    console.error("POST /api/waitlist: set WAITLIST_SMTP_USER and WAITLIST_SMTP_PASS");
    return res.status(503).json({ error: "Waitlist email is not configured" });
  }
  const parsed = validateWaitlistPayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ error: parsed.error });
  }
  try {
    await sendWaitlistEmail(parsed.data);
    res.json({ ok: true });
  } catch (e) {
    console.error("POST /api/waitlist send failed", e);
    res.status(500).json({ error: "Failed to send message" });
  }
});

/**
 * GET /api/jobs — list saved job listings for this uploader (by title index).
 */
app.get("/api/jobs", async (req, res) => {
  try {
    const auth = await getAuthFromRequest(req);
    const jobs = await listJobsForUser(auth.email);
    res.json({ jobs });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Failed to list jobs" });
  }
});

/**
 * GET /api/jobs/:jobId — load job + candidates for results UI.
 */
app.get("/api/jobs/:jobId", async (req, res) => {
  try {
    const auth = await getAuthFromRequest(req);
    const bundle = await loadJobBundle(auth.email, req.params.jobId);
    if (!bundle) {
      return res.status(404).json({ error: "Job not found" });
    }
    const j = bundle.job;
    res.json({
      jobId: req.params.jobId,
      job: {
        title: j.title ?? "",
        description: j.description ?? "",
        requirements: j.requirements ?? "",
        culture: j.culture ?? "",
      },
      candidates: bundle.candidates,
    });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Failed to load job" });
  }
});

/**
 * POST /api/analyze
 * body: { job: { title, description, requirements, culture }, resumes: [{ name, base64, type }], existingJobId?: string }
 */
app.post("/api/analyze", async (req, res) => {
  try {
    const auth = await getAuthFromRequest(req);
    const uploaderId = auth.email;

    const { job, resumes, existingJobId } = req.body || {};
    if (!job || !resumes?.length) {
      return res.status(400).json({ error: "Missing job or resumes" });
    }

    const existingId = typeof existingJobId === "string" ? existingJobId.trim() : "";

    if (existingId) {
      if (!resolveJobDir(uploaderId, existingId)) {
        return res.status(400).json({ error: "Invalid job id" });
      }
      const bundle = await loadJobBundle(uploaderId, existingId);
      if (!bundle) {
        return res.status(404).json({ error: "Job not found" });
      }

      const normStored = normalizeJobTitle(bundle.job.title);
      const canonicalId = await getJobIdForNormalizedTitle(uploaderId, normStored);
      if (canonicalId !== existingId) {
        return res.status(403).json({ error: "Job does not match your listings" });
      }

      const jobOnDisk = {
        title: bundle.job.title ?? "",
        description: bundle.job.description ?? "",
        requirements: bundle.job.requirements ?? "",
        culture: bundle.job.culture ?? "",
      };

      const extracted = await extractResumeFields(resumes);
      const scored = await scoreExtractedForJob(jobOnDisk, extracted);
      const startId = maxCandidateId(bundle.candidates) + 1;
      const newCandidates = buildCandidatesFromExtracted(extracted, scored, resumes, startId);

      const storage = await saveStoredResumes(existingId, uploaderId, resumes, extracted);
      const newWithStorage = newCandidates.map((candidate) => {
        const batchIndex = candidate.id - startId;
        return {
          ...candidate,
          storedLocally: Boolean(storage.storedByIndex[batchIndex]),
          storageWarning: storage.skippedByIndex[batchIndex] || "",
        };
      });

      const merged = [...bundle.candidates, ...newWithStorage].sort((a, b) => b.score - a.score);

      await saveResults(existingId, uploaderId, { job: jobOnDisk, candidates: merged, storage });

      return res.json({ jobId: existingId, candidates: merged, storage });
    }

    const norm = normalizeJobTitle(job.title);
    if (!norm) {
      return res.status(400).json({ error: "Job title is required" });
    }

    const duplicateId = await getJobIdForNormalizedTitle(uploaderId, norm);
    if (duplicateId) {
      return res.status(409).json({
        error:
          "You already have a listing for this title. Open it from the home screen to add résumés.",
        code: "DUPLICATE_TITLE",
        existingJobId: duplicateId,
      });
    }

    const jobId = randomUUID();
    await saveJobSubmission(jobId, uploaderId, job, resumes);

    const extracted = await extractResumeFields(resumes);
    const scored = await scoreExtractedForJob(job, extracted);
    const candidates = buildCandidatesFromExtracted(extracted, scored, resumes, 0);

    const storage = await saveStoredResumes(jobId, uploaderId, resumes, extracted);
    const candidatesWithStorage = candidates.map((candidate) => ({
      ...candidate,
      storedLocally: Boolean(storage.storedByIndex[candidate.id]),
      storageWarning: storage.skippedByIndex[candidate.id] || "",
    }));

    await saveResults(jobId, uploaderId, { job, candidates: candidatesWithStorage, storage });
    await registerTitle(uploaderId, norm, jobId);

    res.json({ jobId, candidates: candidatesWithStorage, storage });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Analysis failed" });
  }
});

/**
 * POST /api/candidates/update
 * body: { jobId, candidateId, candidate }
 */
app.post("/api/candidates/update", async (req, res) => {
  try {
    const auth = await getAuthFromRequest(req);
    const { jobId, candidateId, candidate } = req.body || {};
    if (!jobId || candidateId == null || !candidate) {
      return res.status(400).json({ error: "Missing jobId, candidateId, or candidate" });
    }
    const updated = await updateCandidateInJob(jobId, auth.email, candidateId, candidate);
    if (!updated) return res.status(404).json({ error: "Candidate not found" });
    res.json({ candidate: updated.candidate, candidates: updated.candidates });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Candidate update failed" });
  }
});

/**
 * POST /api/interview/score
 * body: { jobId, candidateId, job, candidate, notes, date, time }
 */
app.post("/api/interview/score", async (req, res) => {
  try {
    const auth = await getAuthFromRequest(req);
    const { jobId, candidateId, job, candidate, notes, date, time } = req.body || {};
    if (!jobId || candidateId == null || !job || !candidate || !notes) {
      return res.status(400).json({ error: "Missing interview scoring fields" });
    }

    const prompt = `Score these interview notes for the candidate against the role.

JOB: ${JSON.stringify(job)}
CANDIDATE: ${JSON.stringify(candidate)}
NOTES: ${notes}

Return ONLY raw JSON:
{"updatedScore":7,"interviewSummary":"one sentence","interviewStrengths":["s1"],"interviewGaps":["g1"]}`;
    const raw = await chatCompletion([{ role: "user", content: prompt }], { maxTokens: 900, temperature: 0.25 });
    const parsed = safeParseJSON(raw);
    const updatedCandidate = {
      ...candidate,
      score: safeScore(parsed.updatedScore, candidate.score || candidate.resumeScore || 5),
      interviewNotes: String(notes || ""),
      interviewDate: String(date || ""),
      interviewTime: String(time || ""),
      interviewSummary: String(parsed.interviewSummary || ""),
      assessmentStrengths: [...safeStringArray(candidate.assessmentStrengths), ...safeStringArray(parsed.interviewStrengths)],
      assessmentGaps: [...safeStringArray(candidate.assessmentGaps), ...safeStringArray(parsed.interviewGaps)],
    };
    const updated = await updateCandidateInJob(jobId, auth.email, candidateId, updatedCandidate);
    if (!updated) return res.status(404).json({ error: "Candidate not found" });
    res.json({ candidate: updated.candidate, candidates: updated.candidates });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Interview scoring failed" });
  }
});

/**
 * POST /api/simulations/generate
 * body: { job, candidate }
 */
app.post("/api/simulations/generate", async (req, res) => {
  try {
    await getAuthFromRequest(req);
    const { job, candidate } = req.body || {};
    if (!job || !candidate) return res.status(400).json({ error: "Missing job or candidate" });
    const questions = await generateSimulationQuestions(job, candidate);
    res.json({ questions });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Simulation generation failed" });
  }
});

/**
 * POST /api/simulations/reprompt
 * body: { job, candidate, question, instruction }
 */
app.post("/api/simulations/reprompt", async (req, res) => {
  try {
    await getAuthFromRequest(req);
    const { job, candidate, question, instruction } = req.body || {};
    if (!job || !candidate || !question || !instruction) {
      return res.status(400).json({ error: "Missing reprompt fields" });
    }
    const prompt = `Rewrite this simulation question using the instruction, keeping the same question type and JSON shape.

ROLE: ${job.title}
CANDIDATE: ${JSON.stringify(candidate)}
ORIGINAL QUESTION: ${JSON.stringify(question)}
INSTRUCTION: ${instruction}

Return ONLY one raw JSON object.`;
    const raw = await chatCompletion([{ role: "user", content: prompt }], { maxTokens: 1200, temperature: 0.45 });
    res.json({ question: safeParseJSON(raw) });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Question reprompt failed" });
  }
});

/**
 * POST /api/simulations/invite
 * body: { jobId, candidateId, questions }
 */
app.post("/api/simulations/invite", async (req, res) => {
  try {
    const auth = await getAuthFromRequest(req);
    const { jobId, candidateId, questions } = req.body || {};
    if (!jobId || candidateId == null || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "Missing invite fields" });
    }
    const bundle = await loadJobBundle(auth.email, jobId);
    if (!bundle) return res.status(404).json({ error: "Job not found" });
    const candidate = bundle.candidates.find((row) => String(row?.id) === String(candidateId));
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const updatedCandidate = { ...candidate, testStatus: "invited", generatedQuestions: questions, inviteToken: token };
    const updated = await updateCandidateInJob(jobId, auth.email, candidateId, updatedCandidate);
    await saveSimulationInvite(token, {
      uploaderId: auth.email,
      jobId,
      candidateId,
      candidateName: candidate.name || "Candidate",
      jobTitle: bundle.job.title || "",
      jobDescription: bundle.job.description || "",
      jobRequirements: bundle.job.requirements || "",
      questions,
      answered: false,
    });
    res.json({ token, candidate: updated?.candidate || updatedCandidate, candidates: updated?.candidates || bundle.candidates });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Simulation invite failed" });
  }
});

/**
 * GET /api/simulations/invite/:token
 */
app.get("/api/simulations/invite/:token", async (req, res) => {
  try {
    const invite = await loadSimulationInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: "Invite not found" });
    res.json({
      candidateName: invite.candidateName,
      jobTitle: invite.jobTitle,
      questions: invite.questions,
      answered: Boolean(invite.answered),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Invite load failed" });
  }
});

/**
 * POST /api/simulations/invite/:token/submit
 * body: { answers }
 */
app.post("/api/simulations/invite/:token/submit", async (req, res) => {
  try {
    const invite = await loadSimulationInvite(req.params.token);
    if (!invite) return res.status(404).json({ error: "Invite not found" });
    if (invite.answered) return res.json({ ok: true, alreadyAnswered: true });

    const answers = req.body?.answers || {};
    const answerText = (invite.questions || []).map((q, i) => {
      const question = q.phase1_question || q.question || q.scenario || `Question ${i + 1}`;
      return `Q${i + 1} [${q.type}]: ${question}\nAnswer:\n${answers[i] || "(no answer)"}`;
    }).join("\n\n");

    const prompt = `Score this job simulation.

CANDIDATE: ${invite.candidateName}
ROLE: ${invite.jobTitle}
REQUIREMENTS: ${invite.jobRequirements}
QUESTIONS AND ANSWERS:
${answerText}

Evaluate communication, situational judgment, adaptability, prioritization, ethics, customer empathy, and role fit.
Return ONLY raw JSON:
{"simulationScore":7,"combinedScore":7,"newStrengths":["s1"],"newGaps":["g1"],"assessmentSummary":"one sentence","coachingNote":"tip","integrityFlag":false,"detailedReport":{"communicationScore":7,"communicationNotes":"note","salesAcumenScore":7,"salesAcumenNotes":"note","situationalJudgmentScore":7,"situationalJudgmentNotes":"note","customerEmpathyScore":7,"customerEmpathyNotes":"note","ethicsScore":7,"ethicsNotes":"note","roleFitScore":7,"roleFitNotes":"note"},"questionBreakdown":[{"questionId":1,"score":7,"feedback":"feedback"}]}`;
    const raw = await chatCompletion([{ role: "user", content: prompt }], { maxTokens: 2200, temperature: 0.25 });
    const result = safeParseJSON(raw);

    const bundle = await loadJobBundle(invite.uploaderId, invite.jobId);
    if (!bundle) return res.status(404).json({ error: "Job not found" });
    const candidate = bundle.candidates.find((row) => String(row?.id) === String(invite.candidateId));
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    const updatedCandidate = {
      ...candidate,
      score: safeScore(result.combinedScore, candidate.score || candidate.resumeScore || 5),
      simulationScore: safeScore(result.simulationScore),
      testStatus: "completed",
      assessmentStrengths: safeStringArray(result.newStrengths),
      assessmentGaps: safeStringArray(result.newGaps),
      assessmentSummary: String(result.assessmentSummary || ""),
      coachingNote: String(result.coachingNote || ""),
      integrityFlag: Boolean(result.integrityFlag),
      simulationReport: result.detailedReport || null,
      questionBreakdown: Array.isArray(result.questionBreakdown) ? result.questionBreakdown : [],
    };
    await updateCandidateInJob(invite.jobId, invite.uploaderId, invite.candidateId, updatedCandidate);
    await updateSimulationInvite(req.params.token, { ...invite, answered: true, answers, result });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Simulation submit failed" });
  }
});

/**
 * POST /api/chat
 * body: { job, selected, messages: [{ role, content }] }
 */
app.post("/api/chat", async (req, res) => {
  try {
    await getAuthFromRequest(req);
    const { job, selected, messages } = req.body || {};
    if (!job || !selected || !messages?.length) {
      return res.status(400).json({ error: "Missing job, selected, or messages" });
    }

    const system = `You are a hiring assistant. A recruiter is asking about a specific candidate for a job opening. Answer accurately using only information from the candidate's resume data. Be concise and specific.

You may use light Markdown in your replies for readability: **bold**, *italic*, and bullet or numbered lists. The recruiter's UI will render it.

JOB: ${job.title}
JOB DESCRIPTION: ${job.description}
REQUIREMENTS: ${job.requirements}

CANDIDATE DATA:
${JSON.stringify(selected, null, 2)}`;

    const openAiMessages = [
      { role: "system", content: system },
      ...messages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
    ];

    const reply = await chatCompletion(openAiMessages, {
      maxTokens: 1024,
      temperature: 0.4,
    });
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Chat failed" });
  }
});

/**
 * POST /api/email
 * body: { job, selected }
 */
app.post("/api/email", async (req, res) => {
  try {
    await getAuthFromRequest(req);
    const { job, selected } = req.body || {};
    if (!job || !selected) {
      return res.status(400).json({ error: "Missing job or selected candidate" });
    }

    const prompt = `Write a professional, warm, and concise interview invitation email to ${selected.name} for the position of ${job.title}.

Mention 1-2 specific things from their background that impressed the team: ${(selected.strengths || []).slice(0, 2).join("; ")}.

Ask them to reply to schedule a 30-minute intro call. Sign off as "The Hiring Team at [Company]".

Write only the email body, no subject line.

IMPORTANT: The recruiter will paste this into a plain-text email (mailto). Email clients will NOT render Markdown or HTML. Output PLAIN TEXT only:
- Do not use **asterisks**, _underscores_, # headings, backticks, bullet markdown (- or * at line starts as markup), or [link](url) syntax.
- Use normal paragraphs, line breaks, and capitalization for emphasis instead.`;

    const rawDraft = await chatCompletion([{ role: "user", content: prompt }], {
      maxTokens: 800,
      temperature: 0.5,
    });
    const draft = plainTextEmailDraft(rawDraft);
    res.json({ draft });
  } catch (e) {
    console.error(e);
    res.status(e.statusCode || 500).json({ error: e.message || "Email generation failed" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`SocketHR server http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`);
  console.log(`LM Studio: ${process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234/v1"}`);
  console.log(`Model: ${process.env.LM_STUDIO_MODEL || "openai/gpt-oss-20b"}`);
  if (!AUTH_SECRET) {
    console.warn(
      "[sockethr-server] AUTH_SECRET is unset. Add AUTH_SECRET=<same as Vercel NEXTAUTH_SECRET> to server/.env and restart, or POST /api/analyze will fail."
    );
  }
});
