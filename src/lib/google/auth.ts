// Google access tokens for a service account with domain-wide delegation.
// The service account acts as an @pexeta.in user (the "subject") for the scopes the Admin console allows.
import "server-only";
import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const SCOPES = {
  calendar: "https://www.googleapis.com/auth/calendar.events",
  chat: ["https://www.googleapis.com/auth/chat.spaces.readonly"],
};

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY);
}

function privateKey() {
  // Vercel stores multi-line values as-is, but a key pasted with literal "\n" also works.
  return (process.env.GOOGLE_SA_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");
const tokens = new Map<string, { token: string; exp: number }>();

export async function accessToken(subject: string, scopes: string | string[]): Promise<string> {
  const scope = (Array.isArray(scopes) ? scopes : [scopes]).join(" ");
  const sub = subject.toLowerCase();
  const key = `${sub} ${scope}`;
  const cached = tokens.get(key);
  if (cached && cached.exp > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: process.env.GOOGLE_SA_EMAIL, scope, aud: TOKEN_URL, sub, iat: now, exp: now + 3600 }));
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(privateKey()))}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(
      `Google sign-in for ${sub} failed: ${json.error ?? res.status} ${json.error_description ?? ""}`.trim() +
        ` (check the service account key and that domain-wide delegation allows: ${scope})`
    );
  }
  tokens.set(key, { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 });
  return json.access_token;
}
