-- ============================================================
--  Pexeta Ops — 006: Release 1
--  Calendar & Meet, daily digest, recurring tasks, @mentions.
--  Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.
--  Then run 007_release1_schedules.sql for the two new scheduled jobs.
-- ============================================================

-- ---------- @mentions: people following a task ----------
-- Someone @mentioned on a task becomes a watcher: they can open the task, comment,
-- and get comment updates in their daily digest.
create table if not exists task_watchers (
  task_id uuid not null references tasks(id) on delete cascade,
  member_id uuid not null references team_members(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (task_id, member_id)
);
alter table task_watchers enable row level security;
drop policy if exists "watchers visible to members" on task_watchers;
create policy "watchers visible to members" on task_watchers for select using (current_member_id() is not null);

-- Watchers can see the task (and, through it, its activity).
drop policy if exists "tasks visibility" on tasks;
create policy "tasks visibility" on tasks for select using (
  current_member_role() in ('vp', 'admin')
  or assignee_id = current_member_id()
  or created_by = current_member_id()
  or exists (select 1 from task_watchers w where w.task_id = tasks.id and w.member_id = current_member_id())
);

-- ---------- Daily digest ----------
-- Routine updates are queued here and sent as one email per person each evening.
-- New assignments, blocks, submissions, reopens and @mentions are still emailed instantly.
create table if not exists notification_digest (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references team_members(id) on delete cascade,
  task_id uuid references tasks(id) on delete cascade,
  actor_id uuid references team_members(id),
  event text not null,
  summary text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_digest_pending_idx on notification_digest(recipient_id) where sent_at is null;
alter table notification_digest enable row level security;  -- server-only

alter table settings add column if not exists digest_enabled boolean not null default true;

-- ---------- Recurring tasks ----------
create table if not exists recurring_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  client_id uuid references clients(id),
  marketplace_id uuid references marketplaces(id),
  assignee_id uuid not null references team_members(id),
  created_by uuid not null references team_members(id),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  weekday int check (weekday between 1 and 7),       -- weekly: 1 = Monday … 7 = Sunday
  month_day int check (month_day between 1 and 28),  -- monthly: day of the month
  due_in_days int not null default 0 check (due_in_days between 0 and 30),
  client_visible boolean not null default false,
  client_title text not null default '',
  active boolean not null default true,
  last_created_on date,                              -- IST date the last task was created
  created_at timestamptz not null default now()
);
alter table recurring_tasks enable row level security;
drop policy if exists "recurring visible to members" on recurring_tasks;
create policy "recurring visible to members" on recurring_tasks for select using (current_member_id() is not null);

alter table tasks add column if not exists recurring_id uuid references recurring_tasks(id) on delete set null;

-- ---------- Calendar & Meet ----------
-- Task due dates as all-day events in the owner's Google Calendar.
alter table tasks add column if not exists calendar_event_id text;
alter table tasks add column if not exists calendar_owner_email text;

-- Meetings and reminders scheduled from Ops (the Google event lives in the organiser's calendar).
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'meeting' check (kind in ('meeting', 'reminder')),
  title text not null,
  description text not null default '',
  start_at timestamptz not null,
  end_at timestamptz not null,
  organizer_id uuid not null references team_members(id),
  attendee_emails text[] not null default '{}',
  task_id uuid references tasks(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  meet_url text not null default '',
  google_event_id text,
  html_link text not null default '',
  reminder_minutes int not null default 10,
  status text not null default 'scheduled' check (status in ('scheduled', 'cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists meetings_start_idx on meetings(start_at);
alter table meetings enable row level security;
drop policy if exists "meetings visibility" on meetings;
create policy "meetings visibility" on meetings for select using (
  current_member_role() in ('vp', 'admin')
  or organizer_id = current_member_id()
  or lower(auth.jwt() ->> 'email') = any (attendee_emails)
);
