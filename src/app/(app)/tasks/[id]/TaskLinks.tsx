"use client";

import { useActionState, useEffect, useRef } from "react";
import { FileSpreadsheet, FileText, Folder, Link2, Presentation, X } from "lucide-react";
import { addTaskLink, removeTaskLink } from "@/app/link-actions";
import type { ActionResult } from "@/app/actions";

type Link = { id: string; url: string; label: string; added_by: string | null };

function kind(url: string) {
  if (url.includes("docs.google.com/spreadsheets")) return { Icon: FileSpreadsheet, name: "Google Sheet" };
  if (url.includes("docs.google.com/document")) return { Icon: FileText, name: "Google Doc" };
  if (url.includes("docs.google.com/presentation")) return { Icon: Presentation, name: "Google Slides" };
  if (url.includes("drive.google.com/drive/folders")) return { Icon: Folder, name: "Drive folder" };
  if (url.includes("drive.google.com")) return { Icon: FileText, name: "Drive file" };
  try {
    return { Icon: Link2, name: new URL(url).hostname.replace(/^www\./, "") };
  } catch {
    return { Icon: Link2, name: "Link" };
  }
}

export default function TaskLinks({ taskId, links, meId, manager }: { taskId: string; links: Link[]; meId: string; manager: boolean }) {
  const [state, action, pending] = useActionState<ActionResult, FormData>(addTaskLink, { ok: false });
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.ok) ref.current?.reset();
  }, [state]);

  return (
    <section className="card p-5">
      <h2 className="eyebrow">Files and links</h2>
      {links.length > 0 && (
        <ul className="mt-3 space-y-2">
          {links.map((l) => {
            const { Icon, name } = kind(l.url);
            return (
              <li key={l.id} className="flex items-center gap-2">
                <Icon size={16} className="flex-shrink-0 text-brand" />
                <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-ink hover:underline" title={l.url}>
                  {l.label || name}
                </a>
                {(l.added_by === meId || manager) && (
                  <form action={removeTaskLink}>
                    <input type="hidden" name="id" value={l.id} />
                    <button aria-label="Remove link" className="text-faint hover:text-red-700"><X size={14} /></button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form ref={ref} action={action} className="mt-3 space-y-2">
        <input type="hidden" name="task_id" value={taskId} />
        <input name="url" className="field" placeholder="Paste a Drive, Sheets or any link" />
        <input name="label" className="field" placeholder="Label (optional), e.g. Price sheet" />
        <button className="btn btn-outline w-full" disabled={pending}>{pending ? "Adding…" : "Add link"}</button>
        {state.error && <p className="text-xs text-red-700">{state.error}</p>}
      </form>
    </section>
  );
}
