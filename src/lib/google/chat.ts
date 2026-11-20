// Google Chat: find or open a direct-message conversation between two @pexeta.in people.
// Needs the Google Chat API enabled and configured in the Cloud project, the two chat scopes added to the
// domain-wide delegation entry, and GOOGLE_CHAT_ENABLED=1 in Vercel. Until then, chatEnabled() is false.
import "server-only";
import { accessToken, googleConfigured, SCOPES } from "./auth";

const API = "https://chat.googleapis.com/v1";

export function chatEnabled() {
  return googleConfigured() && process.env.GOOGLE_CHAT_ENABLED === "1";
}

type Space = { name: string; spaceUri?: string };

function dmUrl(space: Space) {
  if (space.spaceUri) return space.spaceUri;
  const id = space.name.replace(/^spaces\//, "");
  return `https://mail.google.com/chat/u/0/#chat/dm/${id}`;
}

/** URL of the Google Chat DM between `from` and `to`, creating the DM if they've never chatted. */
export async function directMessageUrl(from: string, to: string): Promise<string> {
  const headers = { Authorization: `Bearer ${await accessToken(from, SCOPES.chat)}`, "Content-Type": "application/json" };

  const found = await fetch(`${API}/spaces:findDirectMessage?name=${encodeURIComponent(`users/${to.toLowerCase()}`)}`, { headers });
  if (found.ok) return dmUrl((await found.json()) as Space);
  if (found.status !== 404) throw new Error(`Google Chat findDirectMessage failed: ${found.status} ${await found.text()}`);

  const created = await fetch(`${API}/spaces:setup`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      space: { spaceType: "DIRECT_MESSAGE" },
      memberships: [{ member: { name: `users/${to.toLowerCase()}`, type: "HUMAN" } }],
    }),
  });
  if (!created.ok) throw new Error(`Google Chat spaces.setup failed: ${created.status} ${await created.text()}`);
  return dmUrl((await created.json()) as Space);
}
