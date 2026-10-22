export type Role = "vp" | "admin" | "member";
export type Priority = "low" | "medium" | "high" | "urgent";
export type Status = "assigned" | "acknowledged" | "in_progress" | "blocked" | "completed" | "closed" | "reopened";

export type Member = { id: string; email: string; full_name: string; role: Role; active: boolean };
export type Client = { id: string; name: string; active: boolean };
export type Marketplace = { id: string; name: string; active: boolean; sort_order: number };
export type Settings = {
  overdue_grace_days: number;
  ack_window_hours: number;
  closure_roles: Role[];
  status_notes: Record<string, string>;
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
