import nodemailer from "nodemailer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LEN = 500;
const WAITLIST_PAGE_URL = "https://sockethr.com/advertising#waitlist";

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
 * @returns {{ ok: true, data: { firstName: string, lastName: string, company: string, email: string, phone: string, notes: string } } | { ok: false, error: string }}
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
    const notes = trimStr(o.notes, "notes");
    return {
      ok: true,
      data: { firstName, lastName, company, email: emailRaw, phone, notes },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Validation failed";
    return { ok: false, error: msg };
  }
}

/** @param {string} input */
function escapeHtml(input) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {{ firstName: string, lastName: string, company: string, email: string, phone: string, notes: string }} data
 */
function buildInternalWaitlistEmail(data) {
  const { firstName, lastName, company, email, phone, notes } = data;
  return {
    subject: `[SocketHR waitlist] ${firstName} ${lastName} <${email}>`,
    text: [
      "New waitlist submission:",
      "",
      `First name: ${firstName}`,
      `Last name: ${lastName}`,
      `Company: ${company || "(not provided)"}`,
      `Email: ${email}`,
      `Phone: ${phone || "(not provided)"}`,
      `Notes: ${notes || "(not provided)"}`,
    ].join("\n"),
  };
}

/**
 * @param {{ firstName: string, lastName: string, company: string, email: string, phone: string, notes: string }} data
 */
function buildClientWaitlistEmail(data) {
  const safeFirstName = escapeHtml(data.firstName);
  const safeCompany = escapeHtml(data.company || "");
  const brand = process.env.WAITLIST_BRAND_NAME?.trim() || "SocketHR";
  const fromTeam = process.env.WAITLIST_TEAM_NAME?.trim() || "The SocketHR Team";
  const subject = `Welcome to the ${brand} waitlist`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b0f19;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#e5e7eb;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#0b0f19;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 20px 28px;border-bottom:1px solid #1f2937;background:linear-gradient(135deg,#0f172a,#111827);">
                <div style="font-size:12px;letter-spacing:1.6px;font-weight:700;text-transform:uppercase;color:#22d3ee;">${escapeHtml(brand)}</div>
                <h1 style="margin:10px 0 0 0;font-size:26px;line-height:1.25;color:#ffffff;">You are officially on the waitlist</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;color:#e5e7eb;">Hi ${safeFirstName},</p>
                <p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;color:#d1d5db;">
                  Thanks for joining${safeCompany ? ` from <strong style="color:#ffffff;">${safeCompany}</strong>` : ""}. Your early-access request is confirmed.
                </p>
                <p style="margin:0 0 14px 0;font-size:16px;line-height:1.6;color:#d1d5db;">
                  We will email you as soon as new spots open. Launch partners receive a lifetime discount on the Pro plan.
                </p>
                <a href="${WAITLIST_PAGE_URL}" style="display:inline-block;margin-top:4px;background:linear-gradient(135deg,#06b6d4,#2563eb);color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 18px;border-radius:10px;">
                  Explore plans and details
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px 28px 28px;border-top:1px solid #1f2937;">
                <p style="margin:0;font-size:14px;line-height:1.5;color:#9ca3af;">
                  ${escapeHtml(fromTeam)}<br />
                  <a href="${WAITLIST_PAGE_URL}" style="color:#22d3ee;text-decoration:none;">sockethr.com/advertising#waitlist</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `Hi ${data.firstName},`,
    "",
    "Thanks for joining the SocketHR waitlist.",
    data.company ? `We received your request from ${data.company}.` : "We received your request.",
    "We will email you as soon as early access opens.",
    "Launch partners receive a lifetime discount on the Pro plan.",
    "",
    `Waitlist details: ${WAITLIST_PAGE_URL}`,
    "",
    fromTeam,
  ].join("\n");

  return { subject, html, text };
}

/**
 * @param {{ firstName: string, lastName: string, company: string, email: string, phone: string, notes: string }} data
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

  const internal = buildInternalWaitlistEmail(data);
  const client = buildClientWaitlistEmail(data);

  try {
    await transporter.sendMail({
      from,
      to,
      replyTo: data.email,
      subject: internal.subject,
      text: internal.text,
    });
  } catch (error) {
    throw new Error(`Failed to send internal waitlist email: ${error instanceof Error ? error.message : "unknown error"}`);
  }

  try {
    await transporter.sendMail({
      from,
      to: data.email,
      replyTo: to,
      subject: client.subject,
      text: client.text,
      html: client.html,
    });
  } catch (error) {
    throw new Error(`Failed to send client waitlist email: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}
