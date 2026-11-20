-- ============================================================
--  Pexeta Ops — 007: schedules for Release 1
--  Run once in Supabase → SQL Editor, after 006_release1.sql.
--  Replace YOUR_CRON_SECRET with the same value as CRON_SECRET in Vercel
--  (the one already used in 003_schedules.sql). Times are UTC.
-- ============================================================
select cron.unschedule(jobname) from cron.job
where jobname in ('pexeta-recurring-tasks', 'pexeta-daily-digest');

-- Recurring tasks: 8:30 am IST every day (before the 9:00 am reports)
select cron.schedule('pexeta-recurring-tasks', '0 3 * * *', $$
  select net.http_post(
    url := 'https://ops.pexeta.in/api/cron/recurring',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);

-- Daily digest: 6:30 pm IST every day
select cron.schedule('pexeta-daily-digest', '0 13 * * *', $$
  select net.http_post(
    url := 'https://ops.pexeta.in/api/cron/digest',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET', 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$$);

-- Check:  select jobname, schedule from cron.job;
