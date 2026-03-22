import pdfParse from "pdf-parse";

/**
 * @param {string} base64
 * @param {string} mimeType
 * @param {string} fileName
 * @returns {Promise<string>}
 */
export async function resumeToText(base64, mimeType, fileName) {
  const buf = Buffer.from(base64, "base64");
  const lower = (fileName || "").toLowerCase();

  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const data = await pdfParse(buf);
    const text = (data.text || "").trim();
    if (!text) {
      throw new Error(
        `Could not extract text from PDF "${fileName}". Try exporting as text or a different PDF.`
      );
    }
    return text;
  }

  if (
    mimeType === "text/plain" ||
    lower.endsWith(".txt") ||
    mimeType === "text/plain;charset=utf-8"
  ) {
    return buf.toString("utf8");
  }

  // Best-effort for other uploads (e.g. .doc is binary; .docx needs mammoth)
  const asUtf8 = buf.toString("utf8");
  if (asUtf8.length > 50 && /^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]+$/.test(asUtf8.slice(0, 500))) {
    return asUtf8;
  }

  throw new Error(
    `Unsupported or binary file "${fileName}". Use PDF or plain text (.txt) for local analysis.`
  );
}
