-- ============================================================
--  Pexeta Ops — 002: notifications, reminders and reports
--  Run once in Supabase → SQL Editor (after schema.sql). Safe to re-run.
-- ============================================================

-- Seller contact emails for weekly reports (one or more per client)
alter table clients add column if not exists contact_emails text[] not null default '{}';
alter table clients add column if not exists contact_name text not null default '';

-- Each reminder is sent once: the key encodes task + reminder type + the date/assignment it refers to.
create table if not exists notification_log (
  key text primary key,
  task_id uuid references tasks(id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table notification_log enable row level security;  -- server-only (service role); no user policies

-- Weekly seller reports: generated as drafts every Monday, reviewed and sent by the VP.
create table if not exists weekly_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  week_start date not null,                    -- Monday of the reported week
  week_end date not null,                      -- Sunday of the reported week
  summary text not null default '',            -- VP's note at the top of the email
  excluded_task_ids uuid[] not null default '{}', -- tasks the VP removed from the report
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  sent_by uuid references team_members(id),
  sent_to text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, week_start)
);
alter table weekly_reports enable row level security;
drop policy if exists "weekly reports for managers" on weekly_reports;
create policy "weekly reports for managers" on weekly_reports for select
  using (current_member_role() in ('vp', 'admin'));

-- Report settings
alter table settings add column if not exists daily_report_enabled boolean not null default true;
alter table settings add column if not exists reminders_enabled boolean not null default true;
