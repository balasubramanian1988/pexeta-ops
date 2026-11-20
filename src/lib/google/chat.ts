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

export const CHAT_HOME = "https://mail.google.com/chat/u/0/#chat/home";

/**
 * URL of the existing Google Chat DM between `from` and `to`, or null if Google doesn't find one.
 * Ops never creates a DM itself: Google can miss a chat started in the Chat app, and creating one
 * would leave the two people with a second, duplicate conversation.
 */
export async function directMessageUrl(from: string, to: string): Promise<string | null> {
  const headers = { Authorization: `Bearer ${await accessToken(from, SCOPES.chat)}` };
  const found = await fetch(`${API}/spaces:findDirectMessage?name=${encodeURIComponent(`users/${to.toLowerCase()}`)}`, { headers });
  if (found.ok) return dmUrl((await found.json()) as Space);
  if (found.status === 404) return null;
  throw new Error(`Google Chat findDirectMessage failed: ${found.status} ${await found.text()}`);
}
