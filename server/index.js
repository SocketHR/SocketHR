import express from "express";
import cors from "cors";
import { randomUUID } from "crypto";
import { chatCompletion } from "./lmstudio.js";
import { saveJobSubmission, saveResults } from "./storage.js";
import { resumeToText } from "./resumeText.js";
import {
  isWaitlistSmtpConfigured,
  validateWaitlistPayload,
  sendWaitlistEmail,
} from "./waitlistMail.js";

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

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

const app = express();
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "sockethr-server" });
});

/**
 * POST /api/waitlist
 * body: { firstName, lastName, company?, email, phone? }
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
 * POST /api/analyze
 * body: { job: { title, description, requirements, culture }, resumes: [{ name, base64, type }] }
 */
app.post("/api/analyze", async (req, res) => {
  try {
    const { job, resumes } = req.body || {};
    if (!job || !resumes?.length) {
      return res.status(400).json({ error: "Missing job or resumes" });
    }

    const jobId = randomUUID();
    await saveJobSubmission(jobId, job, resumes);

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
    const scored = normalizeScoredArray(safeParseJSON(scoredRaw));

    const candidates = extracted
      .map((c, i) => {
        const s = scored.find((x) => x.index === i) || scored[i] || {};
        return {
          id: i,
          ...c,
          fileName: resumes[i].name,
          score: s.score ?? 5,
          score_rationale: s.score_rationale || "",
          strengths: s.strengths || [],
          weaknesses: s.weaknesses || [],
          fit_summary: s.fit_summary || "",
        };
      })
      .sort((a, b) => b.score - a.score);

    await saveResults(jobId, { job, candidates });

    res.json({ jobId, candidates });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Analysis failed" });
  }
});

/**
 * POST /api/chat
 * body: { job, selected, messages: [{ role, content }] }
 */
app.post("/api/chat", async (req, res) => {
  try {
    const { job, selected, messages } = req.body || {};
    if (!job || !selected || !messages?.length) {
      return res.status(400).json({ error: "Missing job, selected, or messages" });
    }

    const system = `You are a hiring assistant. A recruiter is asking about a specific candidate for a job opening. Answer accurately using only information from the candidate's resume data. Be concise and specific.

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
    res.status(500).json({ error: e.message || "Chat failed" });
  }
});

/**
 * POST /api/email
 * body: { job, selected }
 */
app.post("/api/email", async (req, res) => {
  try {
    const { job, selected } = req.body || {};
    if (!job || !selected) {
      return res.status(400).json({ error: "Missing job or selected candidate" });
    }

    const prompt = `Write a professional, warm, and concise interview invitation email to ${selected.name} for the position of ${job.title}.

Mention 1-2 specific things from their background that impressed the team: ${(selected.strengths || []).slice(0, 2).join("; ")}.

Ask them to reply to schedule a 30-minute intro call. Sign off as "The Hiring Team at [Company]".

Write only the email body, no subject line.`;

    const draft = await chatCompletion([{ role: "user", content: prompt }], {
      maxTokens: 800,
      temperature: 0.5,
    });
    res.json({ draft });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || "Email generation failed" });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`SocketHR server http://${HOST === "0.0.0.0" ? "127.0.0.1" : HOST}:${PORT}`);
  console.log(`LM Studio: ${process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234/v1"}`);
  console.log(`Model: ${process.env.LM_STUDIO_MODEL || "openai/gpt-oss-20b"}`);
});
