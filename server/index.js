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
  return JSON.parse(clean);
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
      score: s.score ?? 5,
      score_rationale: s.score_rationale || "",
      strengths: s.strengths || [],
      weaknesses: s.weaknesses || [],
      fit_summary: s.fit_summary || "",
      storedLocally: false,
      storageWarning: "",
    };
  });
  return rows.sort((a, b) => b.score - a.score);
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
