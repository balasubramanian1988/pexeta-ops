-- ============================================================
--  Pexeta Ops — Team lead role
--  Team leads can create and assign tasks, and reassign / edit / change
--  the due date of tasks they assigned. Closing and reopening stay with
--  the closure roles in Settings (VP only by default).
--  Run once in Supabase: SQL Editor → New query → paste → Run.
-- ============================================================
alter table team_members drop constraint if exists team_members_role_check;
alter table team_members add constraint team_members_role_check
  check (role in ('vp', 'admin', 'lead', 'member'));

update team_members set role = 'lead'
where lower(email) in ('kanna@pexeta.in', 'yuhanthra@pexeta.in');

-- Check: should list both as 'lead'
select full_name, email, role from team_members where role = 'lead';
