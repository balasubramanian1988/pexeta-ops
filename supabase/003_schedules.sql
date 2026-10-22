-- ============================================================
--  Pexeta Ops — 003: schedules (reminders and reports)
--  Run once in Supabase → SQL Editor AFTER the app is live on Vercel.
--  1. Replace https://ops.pexeta.in with your app URL if different.
--  2. Replace YOUR_CRON_SECRET with the same value as CRON_SECRET in Vercel.
--  All times are UTC: 03:30 UTC = 9:00 am IST.
-- ============================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove earlier versions of these jobs if re-running
select cron.unschedule(jobname) from cron.job
where jobname in ('pexeta-sla-reminders', 'pexeta-daily-report', 'pexeta-weekly-reports');

-- SLA reminders: every hour from 9:00 am to 7:00 pm IST
select cron.schedule('pexeta-sla-reminders', '30 3-13 * * *', $$
  select net.http_post(
    url := 'https://ops.pexeta.in/api/cron/sla',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$$);

-- Daily VP report: 9:00 am IST every day
select cron.schedule('pexeta-daily-report', '30 3 * * *', $$
  select net.http_post(
    url := 'https://ops.pexeta.in/api/cron/daily-report',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$$);

-- Weekly seller report drafts: Monday 9:00 am IST (covers the previous Monday–Sunday)
select cron.schedule('pexeta-weekly-reports', '30 3 * * 1', $$
  select net.http_post(
    url := 'https://ops.pexeta.in/api/cron/weekly-reports',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
$$);

-- Check they're scheduled:   select jobname, schedule from cron.job;
-- Check recent runs:         select * from cron.job_run_details order by start_time desc limit 10;
