"use client";

import { useActionState, useEffect, useRef } from "react";
import { taskAction, type ActionResult } from "@/app/actions";

/** Comment form with one-click @mention chips. Mentioned people are emailed straight away and can open the task. */
export default function CommentBox({ taskId, people }: { taskId: string; people: { id: string; name: string; handle: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionResult, FormData>(taskAction, { ok: false });
  const formRef = useRef<HTMLFormElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state]);

  function mention(handle: string) {
    const box = boxRef.current;
    if (!box) return;
    const pos = box.selectionStart ?? box.value.length;
    const before = box.value.slice(0, pos);
    const insert = `${before && !/\s$/.test(before) ? " " : ""}${handle} `;
    box.value = before + insert + box.value.slice(pos);
    box.focus();
    const caret = pos + insert.length;
    box.setSelectionRange(caret, caret);
  }

  return (
    <form ref={formRef} action={formAction} className="mt-4 space-y-2">
      <input type="hidden" name="task_id" value={taskId} />
      <input type="hidden" name="action" value="comment" />
      <textarea ref={boxRef} name="note" rows={2} className="field" placeholder="Add an update or question. Type @name to mention a teammate." />
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted">Mention:</span>
        {people.map((p) => (
          <button key={p.id} type="button" onClick={() => mention(p.handle)} title={p.name} className="rounded-full bg-ice px-2 py-0.5 text-xs font-medium text-navy ring-1 ring-line hover:bg-white">
            {p.handle}
          </button>
        ))}
      </div>
      <button className="btn btn-outline w-full" disabled={pending}>{pending ? "Saving…" : "Add comment"}</button>
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
