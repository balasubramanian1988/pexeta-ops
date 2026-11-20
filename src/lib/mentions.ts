// @mentions: each team member gets a short handle (their first name, or full name without spaces
// if two people share a first name). Used by the comment box and by the server to find who was mentioned.
type Person = { id: string; full_name: string; active?: boolean };

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export function mentionHandles<T extends Person>(team: T[]): Map<string, T> {
  const firstCount = new Map<string, number>();
  for (const m of team) {
    const first = squash(m.full_name.split(/\s+/)[0] ?? "");
    firstCount.set(first, (firstCount.get(first) ?? 0) + 1);
  }
  const out = new Map<string, T>();
  for (const m of team) {
    const first = squash(m.full_name.split(/\s+/)[0] ?? "");
    const handle = first && firstCount.get(first) === 1 ? first : squash(m.full_name);
    if (handle) out.set(handle, m);
  }
  return out;
}

/** Display form of a handle, e.g. "@Harismita". */
export function handleFor(m: Person, team: Person[]): string {
  for (const [h, p] of mentionHandles(team)) if (p.id === m.id) return "@" + h.charAt(0).toUpperCase() + h.slice(1);
  return "@" + squash(m.full_name);
}

/** Team members mentioned in a piece of text. */
export function findMentions<T extends Person>(text: string, team: T[]): T[] {
  const handles = mentionHandles(team.filter((m) => m.active !== false));
  const found = new Map<string, T>();
  for (const match of text.matchAll(/@([\p{L}\p{N}.]+)/gu)) {
    const m = handles.get(squash(match[1]!));
    if (m) found.set(m.id, m);
  }
  return [...found.values()];
}
