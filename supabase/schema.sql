-- ============================================================
--  Pexeta Ops — Task Tracker schema (phase 1)
--  Run once in Supabase: SQL Editor → New query → paste → Run.
--  Then edit the INSERT INTO team_members at the bottom with real team emails.
-- ============================================================

-- ---------- Team (allowlist + roles) ----------
-- Only emails listed here (and active) can use the app after Google sign-in.
create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  full_name text not null,
  role text not null default 'member' check (role in ('vp', 'admin', 'member')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Reference lists ----------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists marketplaces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order int not null default 0
);

-- ---------- Operating rules (single row) ----------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  overdue_grace_days int not null default 1,       -- task is overdue this many days after due date
  ack_window_hours int not null default 24,        -- must be acknowledged within this many hours
  closure_roles text[] not null default array['vp'],-- roles allowed to close / reopen
  status_notes jsonb not null default '{}'::jsonb, -- optional definitions shown in Settings
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict (id) do nothing;

-- ---------- Tasks ----------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  ref serial unique,                               -- human-friendly number, e.g. PX-42
  title text not null,
  description text not null default '',
  client_id uuid references clients(id),
  marketplace_id uuid references marketplaces(id),
  assignee_id uuid not null references team_members(id),
  created_by uuid not null references team_members(id),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'assigned'
    check (status in ('assigned', 'acknowledged', 'in_progress', 'blocked', 'completed', 'closed', 'reopened')),
  due_date date not null,
  dependency text not null default '',             -- optional dependency details
  blocked_reason text not null default '',
  progress int not null default 0 check (progress between 0 and 100),
  assigned_at timestamptz not null default now(),  -- reset on reassign / reopen (drives the acknowledgement clock)
  acknowledged_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on tasks(assignee_id);
create index if not exists tasks_status_idx on tasks(status);
create index if not exists tasks_due_idx on tasks(due_date);

-- ---------- Activity timeline ----------
create table if not exists task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  actor_id uuid references team_members(id),
  event text not null,          -- created, acknowledged, started, progress, blocked, unblocked, completed, closed, reopened, reassigned, due_changed, comment, edited
  detail text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists task_activity_task_idx on task_activity(task_id, created_at);

-- ---------- Helper: the signed-in team member ----------
create or replace function current_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from team_members
  where lower(email) = lower(auth.jwt() ->> 'email') and active
$$;

create or replace function current_member_role() returns text
language sql stable security definer set search_path = public as $$
  select role from team_members
  where lower(email) = lower(auth.jwt() ->> 'email') and active
$$;

-- ---------- Row-level security ----------
-- Reads go through these policies. All writes are made by the app's server after role checks
-- (service role), so no insert/update policies are granted to signed-in users.
alter table team_members enable row level security;
alter table clients enable row level security;
alter table marketplaces enable row level security;
alter table settings enable row level security;
alter table tasks enable row level security;
alter table task_activity enable row level security;

drop policy if exists "team visible to members" on team_members;
create policy "team visible to members" on team_members for select using (current_member_id() is not null);

drop policy if exists "clients visible to members" on clients;
create policy "clients visible to members" on clients for select using (current_member_id() is not null);

drop policy if exists "marketplaces visible to members" on marketplaces;
create policy "marketplaces visible to members" on marketplaces for select using (current_member_id() is not null);

drop policy if exists "settings visible to members" on settings;
create policy "settings visible to members" on settings for select using (current_member_id() is not null);

-- VP and admins see every task; members see tasks assigned to them or created by them.
drop policy if exists "tasks visibility" on tasks;
create policy "tasks visibility" on tasks for select using (
  current_member_role() in ('vp', 'admin')
  or assignee_id = current_member_id()
  or created_by = current_member_id()
);

drop policy if exists "activity visibility" on task_activity;
create policy "activity visibility" on task_activity for select using (
  exists (select 1 from tasks t where t.id = task_activity.task_id)
);

-- ---------- Starter data (edit before running) ----------
insert into marketplaces (name, sort_order) values
  ('Amazon', 1), ('Flipkart', 2), ('Myntra', 3), ('FirstCry', 4),
  ('Blinkit', 5), ('Zepto', 6), ('Swiggy Instamart', 7), ('BigBasket', 8), ('Other', 99)
on conflict (name) do nothing;

-- Replace with real team emails (must be the Google accounts they sign in with).
insert into team_members (email, full_name, role) values
  ('ananth@pexeta.in', 'Vijayananth', 'vp'),
  ('bala@pexeta.in', 'Balasubramanian VA', 'admin')
on conflict (email) do nothing;
