export type Role = "vp" | "admin" | "lead" | "member";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "assigned" | "acknowledged" | "in_progress" | "blocked" | "completed" | "closed" | "reopened";

export type Member = { id: string; email: string; full_name: string; role: Role; active: boolean };
export type Client = { id: string; name: string; active: boolean; contact_emails?: string[]; contact_name?: string };
export type Marketplace = { id: string; name: string; active: boolean; sort_order: number };
export type Settings = {
  overdue_grace_days: number;
  ack_window_hours: number;
  closure_roles: Role[];
  status_notes: Record<string, string>;
  daily_report_enabled?: boolean;
  reminders_enabled?: boolean;
};

export type Task = {
  id: string;
  ref: number;
  title: string;
  description: string;
  client_id: string | null;
  marketplace_id: string | null;
  assignee_id: string;
  created_by: string;
  priority: Priority;
  status: Status;
  due_date: string;
  dependency: string;
  blocked_reason: string;
  progress: number;
  assigned_at: string;
  acknowledged_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Activity = {
  id: string;
  task_id: string;
  actor_id: string | null;
  event: string;
  detail: string;
  created_at: string;
};

export type WeeklyReport = {
  id: string;
  client_id: string;
  week_start: string;
  week_end: string;
  summary: string;
  excluded_task_ids: string[];
  status: "draft" | "sent";
  sent_at: string | null;
  sent_by: string | null;
  sent_to: string[];
  created_at: string;
  updated_at: string;
};
