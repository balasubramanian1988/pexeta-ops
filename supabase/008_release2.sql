-- ============================================================
--  Pexeta Ops — 008: Release 2
--  Links (Google Drive, Sheets, Docs or any URL) attached to tasks.
--  Run once in Supabase: SQL Editor → New query → paste → Run. Safe to run again.
-- ============================================================
create table if not exists task_links (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  url text not null,
  label text not null default '',
  added_by uuid references team_members(id),
  created_at timestamptz not null default now()
);
create index if not exists task_links_task_idx on task_links(task_id);
alter table task_links enable row level security;
drop policy if exists "links follow task visibility" on task_links;
create policy "links follow task visibility" on task_links for select using (
  exists (select 1 from tasks t where t.id = task_links.task_id)
);
