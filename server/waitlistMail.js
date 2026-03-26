import nodemailer from "nodemailer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = 500;

export function isWaitlistSmtpConfigured() {
  const user = process.env.WAITLIST_SMTP_USER?.trim();
  const pass = process.env.WAITLIST_SMTP_PASS?.trim();
  return Boolean(user && pass);
}

/** @param {unknown} v */
function trimStr(v, field) {
  if (v == null) return "";
  if (typeof v !== "string") throw new Error(`Invalid ${field}`);
  const t = v.trim();
  if (t.length > MAX_LEN) throw new Error(`${field} too long`);
  return t;
}

/**
 * @param {unknown} body
 * @returns {{ ok: true, data: { firstName: string, lastName: string, company: string, email: string, phone: string } } | { ok: false, error: string }}
 */
export function validateWaitlistPayload(body) {
  if (!body || typeof body !== "object") {
    return { ok: false, error: "Invalid body" };
  }
  const o = /** @type {Record<string, unknown>} */ (body);
  try {
    const firstName = trimStr(o.firstName, "firstName");
    const lastName = trimStr(o.lastName, "lastName");
    const emailRaw = trimStr(o.email, "email");
    if (!firstName) return { ok: false, error: "firstName required" };
    if (!lastName) return { ok: false, error: "lastName required" };
    if (!emailRaw) return { ok: false, error: "email required" };
    if (!EMAIL_RE.test(emailRaw)) return { ok: false, error: "Invalid email" };
    const company = trimStr(o.company, "company");
    const phone = trimStr(o.phone, "phone");
    return {
      ok: true,
      data: { firstName, lastName, company, email: emailRaw, phone },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Validation failed";
    return { ok: false, error: msg };
  }
}

/**
 * @param {{ firstName: string, lastName: string, company: string, email: string, phone: string }} data
 */
export async function sendWaitlistEmail(data) {
  const host = process.env.WAITLIST_SMTP_HOST?.trim() || "smtp.gmail.com";
  const port = Number(process.env.WAITLIST_SMTP_PORT) || 587;
  const user = process.env.WAITLIST_SMTP_USER?.trim();
  const pass = process.env.WAITLIST_SMTP_PASS?.trim();
  const from = process.env.WAITLIST_MAIL_FROM?.trim() || user;
  const to = process.env.WAITLIST_MAIL_TO?.trim() || "contact@sockethr.com";
  if (!user || !pass || !from) {
    throw new Error("SMTP not configured");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const { firstName, lastName, company, email, phone } = data;
  const subject = `[SocketAI waitlist] ${firstName} ${lastName} <${email}>`;
  const text = [
    "New waitlist submission:",
    "",
    `First name: ${firstName}`,
    `Last name: ${lastName}`,
    `Company: ${company || "(not provided)"}`,
    `Email: ${email}`,
    `Phone: ${phone || "(not provided)"}`,
  ].join("\n");

  await transporter.sendMail({
    from,
    to,
    replyTo: email,
    subject,
    text,
  });
}
