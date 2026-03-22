import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DATA_ROOT = process.env.SOCKETHR_DATA_DIR || path.join(REPO_ROOT, "data", "jobs");

/**
 * @param {string} jobId
 * @param {object} job
 * @param {Array<{ name: string, base64: string, type?: string }>} resumes
 */
export async function saveJobSubmission(jobId, job, resumes) {
  const jobDir = path.join(DATA_ROOT, jobId);
  const resumesDir = path.join(jobDir, "resumes");
  await fs.mkdir(resumesDir, { recursive: true });

  await fs.writeFile(
    path.join(jobDir, "job.json"),
    JSON.stringify({ ...job, jobId, savedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );

  for (const f of resumes) {
    const safeName = path.basename(f.name).replace(/[^a-zA-Z0-9._-]/g, "_");
    const buf = Buffer.from(f.base64, "base64");
    await fs.writeFile(path.join(resumesDir, safeName), buf);
  }

  return jobDir;
}

/**
 * @param {string} jobId
 * @param {object} results
 */
export async function saveResults(jobId, results) {
  const jobDir = path.join(DATA_ROOT, jobId);
  await fs.mkdir(jobDir, { recursive: true });
  await fs.writeFile(
    path.join(jobDir, "results.json"),
    JSON.stringify({ ...results, savedAt: new Date().toISOString() }, null, 2),
    "utf8"
  );
}
