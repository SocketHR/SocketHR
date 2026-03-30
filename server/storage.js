import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = process.env.SOCKETHR_DATA_DIR || path.join(REPO_ROOT, "data", "jobs");

/** Match job folder names (UUID) and reject path traversal. */
const JOB_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TITLE_INDEX_FILE = "title-index.json";

/**
 * Normalize job title for uniqueness: trim, lowercase, collapse internal whitespace.
 * @param {string} title
 */
export function normalizeJobTitle(title) {
  return String(title || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sanitizeSegment(value) {
  return String(value || "unknown")
    .trim()
    .replace(/[^a-zA-Z0-9@._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function uploaderRoot(uploaderId) {
  return path.join(DATA_ROOT, sanitizeSegment(uploaderId));
}

function titleIndexPath(uploaderId) {
  return path.join(uploaderRoot(uploaderId), TITLE_INDEX_FILE);
}

/**
 * Resolve job directory for uploader; returns absolute path or null if invalid jobId.
 * @param {string} uploaderId
 * @param {string} jobId
 */
export function resolveJobDir(uploaderId, jobId) {
  const id = String(jobId || "").trim();
  if (!JOB_ID_UUID_RE.test(id)) return null;
  const safeUploader = sanitizeSegment(uploaderId);
  const userRoot = path.resolve(path.join(DATA_ROOT, safeUploader));
  const jobDir = path.resolve(path.join(userRoot, id));
  if (!jobDir.startsWith(userRoot + path.sep)) return null;
  return jobDir;
}

async function readJsonFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readTitleIndex(uploaderId) {
  const data = await readJsonFile(titleIndexPath(uploaderId));
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (typeof k === "string" && typeof v === "string" && JOB_ID_UUID_RE.test(v)) out[k] = v;
  }
  return out;
}

async function writeTitleIndex(uploaderId, index) {
  const root = uploaderRoot(uploaderId);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(titleIndexPath(uploaderId), JSON.stringify(index, null, 2), "utf8");
}

/**
 * Scan disk for job folders and fill missing title-index entries (keeps newest job per normalized title).
 * @param {string} uploaderId
 */
export async function ensureTitleIndexMigrated(uploaderId) {
  const root = uploaderRoot(uploaderId);
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  /** @type {Map<string, { jobId: string, savedAt: string }>} */
  const bestByNorm = new Map();
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const jobId = ent.name;
    if (!JOB_ID_UUID_RE.test(jobId)) continue;
    const jobPath = path.join(root, jobId, "job.json");
    const job = await readJsonFile(jobPath);
    if (!job || typeof job.title !== "string") continue;
    const norm = normalizeJobTitle(job.title);
    if (!norm) continue;
    const savedAt = String(job.savedAt || "");
    const prev = bestByNorm.get(norm);
    if (!prev || savedAt > prev.savedAt) bestByNorm.set(norm, { jobId, savedAt });
  }

  const index = await readTitleIndex(uploaderId);
  let changed = false;
  for (const [norm, { jobId }] of bestByNorm) {
    if (!index[norm]) {
      index[norm] = jobId;
      changed = true;
    }
  }
  if (changed) await writeTitleIndex(uploaderId, index);
}

/**
 * @param {string} uploaderId
 * @param {string} normalizedTitle
 * @param {string} jobId
 */
export async function registerTitle(uploaderId, normalizedTitle, jobId) {
  if (!normalizedTitle || !JOB_ID_UUID_RE.test(jobId)) return;
  const index = await readTitleIndex(uploaderId);
  index[normalizedTitle] = jobId;
  await writeTitleIndex(uploaderId, index);
}

/**
 * @param {string} uploaderId
 * @param {string} normalizedTitle
 * @returns {Promise<string | null>}
 */
export async function getJobIdForNormalizedTitle(uploaderId, normalizedTitle) {
  await ensureTitleIndexMigrated(uploaderId);
  const index = await readTitleIndex(uploaderId);
  const id = index[normalizedTitle];
  return JOB_ID_UUID_RE.test(String(id || "")) ? id : null;
}

/**
 * @param {string} uploaderId
 * @returns {Promise<Array<{ jobId: string, title: string, candidateCount: number, updatedAt: string }>>}
 */
export async function listJobsForUser(uploaderId) {
  await ensureTitleIndexMigrated(uploaderId);
  const index = await readTitleIndex(uploaderId);
  const jobs = [];
  const seen = new Set();
  for (const jobId of Object.values(index)) {
    if (seen.has(jobId)) continue;
    seen.add(jobId);
    const bundle = await loadJobBundle(uploaderId, jobId);
    if (!bundle) continue;
    jobs.push({
      jobId,
      title: bundle.job.title || "",
      candidateCount: bundle.candidates.length,
      updatedAt: bundle.updatedAt,
    });
  }
  jobs.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return jobs;
}

/**
 * @param {string} uploaderId
 * @param {string} jobId
 * @returns {Promise<{ job: object, candidates: object[], updatedAt: string } | null>}
 */
export async function loadJobBundle(uploaderId, jobId) {
  const jobDir = resolveJobDir(uploaderId, jobId);
  if (!jobDir) return null;
  const job = await readJsonFile(path.join(jobDir, "job.json"));
  const results = await readJsonFile(path.join(jobDir, "results.json"));
  if (!job) return null;
  const candidates = Array.isArray(results?.candidates) ? results.candidates : [];
  const updatedAt = String(results?.savedAt || job.savedAt || "");
  return { job, candidates, updatedAt };
}

/**
 * @param {string} jobId
 * @param {string} uploaderId
 * @param {object} job
 * @param {Array<{ name: string, base64: string, type?: string }>} resumes
 */
export async function saveJobSubmission(jobId, uploaderId, job, resumes) {
  const safeUploader = sanitizeSegment(uploaderId);
  const jobDir = path.join(DATA_ROOT, safeUploader, jobId);
  await fs.mkdir(jobDir, { recursive: true });

  await fs.writeFile(
    path.join(jobDir, "job.json"),
    JSON.stringify(
      {
        ...job,
        jobId,
        uploaderId: safeUploader,
        submittedResumeCount: resumes.length,
        savedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8",
  );

  return jobDir;
}

/**
 * @param {string} jobId
 * @param {string} uploaderId
 * @param {Array<{ name: string, base64: string }>} resumes
 * @param {Array<{ email?: string }>} extracted
 */
export async function saveStoredResumes(jobId, uploaderId, resumes, extracted) {
  const safeUploader = sanitizeSegment(uploaderId);
  const jobDir = path.join(DATA_ROOT, safeUploader, jobId);
  const resumesDir = path.join(jobDir, "resumes");
  await fs.mkdir(resumesDir, { recursive: true });

  const storedByIndex = {};
  const skippedByIndex = {};
  const skipped = [];
  let storedCount = 0;

  for (let i = 0; i < resumes.length; i++) {
    const resume = resumes[i];
    const applicantEmail = normalizeEmail(extracted[i]?.email);
    if (!applicantEmail) {
      storedByIndex[i] = false;
      skippedByIndex[i] = "Missing applicant email in resume";
      skipped.push({ index: i, fileName: resume.name, reason: "Missing applicant email in resume" });
      continue;
    }

    const safeApplicantEmail = sanitizeSegment(applicantEmail);
    const safeName = path.basename(resume.name).replace(/[^a-zA-Z0-9._-]/g, "_");
    const applicantDir = path.join(resumesDir, safeApplicantEmail);
    await fs.mkdir(applicantDir, { recursive: true });
    await fs.writeFile(path.join(applicantDir, safeName), Buffer.from(resume.base64, "base64"));
    storedByIndex[i] = true;
    storedCount += 1;
  }

  return {
    storedByIndex,
    skippedByIndex,
    storedCount,
    skippedCount: skipped.length,
    skipped,
  };
}

/**
 * @param {string} jobId
 * @param {string} uploaderId
 * @param {object} results
 */
export async function saveResults(jobId, uploaderId, results) {
  const safeUploader = sanitizeSegment(uploaderId);
  const jobDir = path.join(DATA_ROOT, safeUploader, jobId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(
    path.join(jobDir, "results.json"),
    JSON.stringify({ ...results, savedAt: new Date().toISOString() }, null, 2),
    "utf8",
  );
}
