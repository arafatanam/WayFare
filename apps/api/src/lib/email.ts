import type { Env } from "../env";

/** Sends transactional email through Resend when configured; otherwise logs (local development). */
export async function sendEmail(env: Env, msg: { to: string; subject: string; text: string }) {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM ?? "Wayfare <hello@example.com>", to: msg.to, subject: msg.subject, text: msg.text }),
  });
  if (!res.ok) console.error("email send failed", res.status);
}
