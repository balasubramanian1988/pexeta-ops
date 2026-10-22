// Low-level senders: email via Resend, team alerts via a Google Chat space webhook.
// Both are optional: if the env vars aren't set, sends are skipped (logged), so the app keeps working.
import "server-only";
import { Resend } from "resend";

const FROM = process.env.EMAIL_FROM || "Pexeta Ops <ops@pexeta.in>";
export const APP_URL = (process.env.APP_URL || "https://ops.pexeta.in").replace(/\/$/, "");

let resend: Resend | null = null;
function client() {
  if (!process.env.RESEND_API_KEY) return null;
  resend ??= new Resend(process.env.RESEND_API_KEY);
  return resend;
}

export type Email = {
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  html: string;
};

export async function sendEmail(e: Email): Promise<boolean> {
  const to = [...new Set(e.to.filter(Boolean).map((x) => x.toLowerCase()))];
  const cc = [...new Set((e.cc ?? []).filter(Boolean).map((x) => x.toLowerCase()))].filter((x) => !to.includes(x));
  if (to.length === 0) return false;
  const r = client();
  if (!r) {
    console.warn(`[pexeta-ops] RESEND_API_KEY not set — skipped email "${e.subject}" to ${to.join(", ")}`);
    return false;
  }
  try {
    const { error } = await r.emails.send({
      from: FROM,
      to,
      cc: cc.length ? cc : undefined,
      replyTo: e.replyTo,
      subject: e.subject,
      html: e.html,
    });
    if (error) {
      console.error("[pexeta-ops] email failed:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[pexeta-ops] email failed:", err);
    return false;
  }
}

/** Post a message to the team's Google Chat space (incoming webhook). Supports *bold* and <url|text> links. */
export async function sendChat(text: string): Promise<boolean> {
  const url = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) console.error("[pexeta-ops] Google Chat webhook failed:", res.status, await res.text());
    return res.ok;
  } catch (err) {
    console.error("[pexeta-ops] Google Chat webhook failed:", err);
    return false;
  }
}

// ---------- HTML helpers (email-safe, inline styles) ----------
export function esc(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wraps content in the branded email layout. */
export function layout(opts: { title: string; preheader?: string; body: string; footer?: string; brand?: "ops" | "client" }) {
  const eyebrow = opts.brand === "client" ? "PEXETA · WEEKLY UPDATE" : "PEXETA OPS";
  const footer =
    opts.footer ??
    (opts.brand === "client"
      ? "Pexeta · Amazon and omnichannel e-commerce growth · pexeta.in"
      : `You're receiving this because you're on the Pexeta Ops team. <a href="${APP_URL}" style="color:#1d6fb8">Open Pexeta Ops</a>`);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#f7fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#1e293b">
<span style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader ?? "")}</span>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f7fafc;padding:24px 0"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border:1px solid #dce3ec;border-radius:10px;overflow:hidden">
<tr><td style="background:#0b2a4a;padding:20px 28px">
<div style="color:#f2871e;font-size:11px;font-weight:700;letter-spacing:2px">${eyebrow}</div>
<div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:6px;line-height:1.3">${esc(opts.title)}</div>
</td></tr>
<tr><td style="padding:24px 28px;font-size:14px;line-height:1.6">${opts.body}</td></tr>
<tr><td style="padding:16px 28px;background:#f7fafc;border-top:1px solid #dce3ec;font-size:12px;color:#4b5a6b">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

export function button(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#f2871e;color:#0b2a4a;text-decoration:none;font-weight:700;font-size:14px;padding:11px 20px;border-radius:6px">${esc(label)}</a>`;
}

export function kv(rows: [string, string][]) {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;margin:12px 0;font-size:14px">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:5px 0;color:#4b5a6b;width:140px;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;color:#0b2a4a;font-weight:600">${v}</td></tr>`
    )
    .join("")}</table>`;
}

export function note(text: string, tone: "info" | "warn" | "danger" = "info") {
  const c = { info: ["#eef2f7", "#123a63"], warn: ["#fff7e6", "#8a4b08"], danger: ["#fdecec", "#991b1b"] }[tone];
  return `<div style="background:${c[0]};color:${c[1]};padding:12px 14px;border-radius:6px;margin:12px 0;white-space:pre-wrap">${esc(text)}</div>`;
}

export function table(headers: string[], rows: (string | number)[][], alignRightFrom = 1) {
  const th = headers
    .map((h, i) => `<th style="padding:8px 10px;background:#0b2a4a;color:#fff;font-size:12px;text-align:${i >= alignRightFrom ? "right" : "left"}">${esc(h)}</th>`)
    .join("");
  const tr = rows
    .map(
      (r, j) =>
        `<tr style="background:${j % 2 ? "#f7fafc" : "#ffffff"}">${r
          .map((c, i) => `<td style="padding:7px 10px;border-top:1px solid #dce3ec;font-size:13px;text-align:${i >= alignRightFrom ? "right" : "left"}">${typeof c === "number" ? c : c}</td>`)
          .join("")}</tr>`
    )
    .join("");
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #dce3ec;border-collapse:collapse;margin:8px 0 18px">${`<tr>${th}</tr>`}${tr}</table>`;
}
