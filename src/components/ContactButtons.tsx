"use client";

import { useActionState, useEffect, useRef } from "react";
import { MessageSquare, Video } from "lucide-react";
import { openChat, startCall, type LinkResult } from "@/app/people-actions";

/**
 * Message (Google Chat DM) and Call (instant Meet) for one teammate.
 * A blank tab is opened on click so pop-up blockers allow it; it's pointed at the link once the server replies.
 */
function LinkButton({
  action,
  label,
  icon,
  memberId,
  taskId,
  topic,
  primary,
}: {
  action: (prev: LinkResult, fd: FormData) => Promise<LinkResult>;
  label: string;
  icon: React.ReactNode;
  memberId: string;
  taskId?: string;
  topic?: string;
  primary?: boolean;
}) {
  const [state, formAction, pending] = useActionState<LinkResult, FormData>(action, { ok: false });
  const tab = useRef<Window | null>(null);
  useEffect(() => {
    if (state.ok && state.url) {
      if (tab.current && !tab.current.closed) tab.current.location.href = state.url;
      else window.open(state.url, "_blank", "noopener");
      tab.current = null;
    } else if (state.error && tab.current) {
      tab.current.close();
      tab.current = null;
    }
  }, [state]);

  return (
    <form action={formAction} onSubmit={() => (tab.current = window.open("about:blank", "_blank"))} className="inline-flex flex-col items-start">
      <input type="hidden" name="member_id" value={memberId} />
      {taskId && <input type="hidden" name="task_id" value={taskId} />}
      {topic && <input type="hidden" name="topic" value={topic} />}
      <button className={`btn ${primary ? "btn-primary" : "btn-outline"} gap-1.5 px-3 py-1.5 text-xs`} disabled={pending}>
        {icon}
        {pending ? "Opening…" : label}
      </button>
      {state.error && <span className="mt-1 max-w-[14rem] text-[11px] leading-tight text-red-700">{state.error}</span>}
      {state.ok && state.note && <span className="mt-1 max-w-[14rem] text-[11px] leading-tight text-muted">{state.note}</span>}
      {state.ok && state.url && (
        <a href={state.url} target="_blank" rel="noreferrer" className="mt-1 text-[11px] text-brand underline">Open again</a>
      )}
    </form>
  );
}

export default function ContactButtons({
  memberId,
  email,
  chat,
  calendar,
  taskId,
  topic,
}: {
  memberId: string;
  email: string;
  chat: boolean;
  calendar: boolean;
  taskId?: string;
  topic?: string;
}) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {chat ? (
        <LinkButton action={openChat} label="Message" icon={<MessageSquare size={13} />} memberId={memberId} />
      ) : (
        <a href={`mailto:${email}`} className="btn btn-outline gap-1.5 px-3 py-1.5 text-xs"><MessageSquare size={13} /> Email</a>
      )}
      {calendar && <LinkButton action={startCall} label="Call" icon={<Video size={13} />} memberId={memberId} taskId={taskId} topic={topic} primary />}
    </div>
  );
}
