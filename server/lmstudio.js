/**
 * OpenAI-compatible client for LM Studio (default http://localhost:1234/v1)
 */

const DEFAULT_BASE = process.env.LM_STUDIO_BASE_URL || "http://127.0.0.1:1234/v1";
const MODEL = process.env.LM_STUDIO_MODEL || "openai/gpt-oss-20b";

/**
 * @param {Array<{ role: string, content: string }>} messages
 * @param {{ maxTokens?: number, temperature?: number }} opts
 */
export async function chatCompletion(messages, opts = {}) {
  const { maxTokens = 2000, temperature = 0.3 } = opts;

  const url = `${DEFAULT_BASE.replace(/\/$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.message ||
      `LM Studio error ${res.status}: ${JSON.stringify(data)}`;
    throw new Error(msg);
  }

  const choice = data.choices?.[0];
  const text = choice?.message?.content ?? choice?.text ?? "";
  return typeof text === "string" ? text.trim() : String(text).trim();
}
