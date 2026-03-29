import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = process.env.SOCKETHR_DATA_DIR || path.join(REPO_ROOT, "data", "jobs");

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
