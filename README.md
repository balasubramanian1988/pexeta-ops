# Pexeta Ops — Task Tracker

Internal operating dashboard for Pexeta's delivery team: explicit ownership, acknowledgement,
visible blockers and VP-controlled closure. Built with Next.js 16 + Supabase (Google sign-in).
Phase 2 will add the client marketplace dashboard to this same app.

## What's inside
| Page | Who | What |
|---|---|---|
| `/dashboard` | Everyone (VP sees all) | Open, overdue, blocked, not-acknowledged, awaiting-closure and closed-this-week counts; today's attention queue; activity pulse; workload by member |
| `/my-work` | Everyone | Your tasks grouped by urgency, filterable by marketplace |
| `/tasks` | Everyone | Searchable register: assignee, marketplace, client, status, priority, due-date range |
| `/tasks/new` | VP / admin | Create and assign a task |
| `/tasks/[id]` | Owner, VP / admin | Lifecycle actions, comments and full activity timeline |
| `/settings` | VP / admin | Operating rules, team allowlist and roles, client accounts, marketplaces |

**Lifecycle:** Assigned → Acknowledged → In progress → (Blocked, reason required) → Awaiting VP closure → Closed.
The VP can reopen completed or closed work with feedback. Every change is written to the activity timeline.

**Visibility:** the VP and admins see all tasks; team members see tasks assigned to them or created by them.
Enforced in the database with row-level security, not just in the UI.

## One-time setup (about 20 minutes)

### 1. Database (Supabase)
You can use the same Supabase project as pexeta.in (no table names clash) or a new one.
1. Open `supabase/schema.sql` and edit the two `team_members` rows at the bottom:
   the VP's and your **Google work emails**.
2. Supabase dashboard → **SQL Editor** → New query → paste the whole file → **Run**.
   It's safe to run again later.

### 2. Google sign-in
1. Google Cloud Console → APIs & Services → **Credentials** → Create credentials → **OAuth client ID** → Web application.
   (Set up the OAuth consent screen first if asked; choose **Internal** so only your Workspace users can sign in.)
2. Authorised redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`
   (Supabase shows the exact URL under Authentication → Providers → Google.)
3. Supabase → **Authentication → Providers → Google** → enable, paste the Client ID and Secret.
4. Supabase → **Authentication → URL Configuration**:
   - Site URL: your app URL, e.g. `https://ops.pexeta.in`
   - Redirect URLs: add `http://localhost:3000/auth/callback` and `https://ops.pexeta.in/auth/callback`

### 3. Environment variables
Copy `.env.example` to `.env.local` and fill in the values from Supabase → Project Settings → API.
`SUPABASE_SERVICE_ROLE_KEY` is secret: never commit it or use it in browser code.

### 4. Run locally
```
npm install
npm run dev
```
Open http://localhost:3000 and sign in with a Google account listed in `team_members`.

### 5. Deploy (Vercel)
1. Push this folder to a new GitHub repo (e.g. `balasubramanian1988/pexeta-ops`).
2. Vercel → Add New Project → import the repo.
3. Add the three environment variables from step 3.
4. Domains → add `ops.pexeta.in` and create the CNAME record your DNS provider shows.

## Adding the team
Settings → Team → name, Google work email and role (Member, Admin or VP). They can sign in immediately.
Deactivating someone blocks sign-in but keeps their task history.

## Project structure
```
supabase/schema.sql          tables, row-level security, starter data
src/proxy.ts                 keeps sessions fresh, redirects signed-out users
src/lib/auth.ts              Google user → team member (allowlist) and roles
src/lib/data.ts              reads (as the signed-in user, so RLS applies)
src/app/actions.ts           all writes: lifecycle rules, role checks, activity log
src/lib/tasks.ts             labels, colours, overdue and acknowledgement logic
src/app/(app)/...            dashboard, my-work, tasks, settings pages
```

---

## Notifications, reminders and reports

### What is sent

| Event | Email to | Google Chat |
|---|---|---|
| Task assigned | Owner | – |
| Reassigned | New owner (old owner gets an FYI) | – |
| Acknowledged / started | Whoever assigned it | – |
| Blocked | VP and assigner, with the reason | ✓ |
| Unblocked | Owner and assigner | ✓ |
| Submitted for VP closure | Everyone allowed to close | ✓ |
| Closed | Owner | ✓ |
| Reopened | Owner, with the feedback | ✓ |
| Due date changed | Owner | – |
| Comment | Owner and assigner | – |

Nobody is emailed about their own action. Inactive members get nothing.

**SLA reminders** (hourly, 9 am–7 pm IST, each sent once): not acknowledged within the window (owner, VP copied), due tomorrow, due today, past due (owner, VP copied, plus a Chat alert). Each owner gets one combined email per run.

**Daily report** (9 am IST, to the VP, admins copied): yesterday's updates, submissions and closures; position this morning; account-wise and team member-wise tables; month to date (created, closed, on-time %, reopens); lists of what was closed, blocked, reopened and is overdue.

**Weekly seller reports** (drafted Monday 9 am IST for the previous Monday–Sunday): one per account with work that week, under **Seller reports**. The VP adds a note, unticks anything that shouldn't go out, checks the preview and sends. The seller gets it from EMAIL_FROM, the sender and VP are copied, and replies go to the sender.

### One-time setup

1. **Database:** in Supabase → SQL Editor, run `supabase/002_notifications_reports.sql`.
2. **Email (Resend):** sign up at resend.com → Domains → add `pexeta.in` → add the DNS records it shows (in your domain's DNS) → wait for "Verified" → API Keys → create a key.
3. **Google Chat (optional):** create a space for the team (e.g. "Pexeta Ops alerts") → space name → Apps & integrations → Webhooks → Add webhook → copy the URL.
4. **Vercel → Settings → Environment Variables:** add `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `GOOGLE_CHAT_WEBHOOK_URL`, `CRON_SECRET` (see `.env.example`), then redeploy.
5. **Schedules:** open `supabase/003_schedules.sql`, replace `YOUR_CRON_SECRET` (three places) with your CRON_SECRET, and run it in the SQL Editor.
6. **Test:** Settings → Notifications and reports → "Send daily report now", "Check reminders now" and "Draft weekly reports now".


---

## Release 1: Calendar & Meet, daily digest, recurring tasks, @mentions

### Setup (once)
1. **Database:** Supabase → SQL Editor → run `supabase/006_release1.sql`, then `supabase/007_release1_schedules.sql`
   (replace `YOUR_CRON_SECRET` with the same `CRON_SECRET` used in 003).
2. **Google Calendar** (optional; everything else works without it):
   - Google Cloud Console → enable **Google Calendar API** → create a **service account** → Keys → add a **JSON key**.
   - Google Admin → Security → Access and data control → API controls → **Manage domain-wide delegation** → Add new:
     the service account's **Unique ID** and scope `https://www.googleapis.com/auth/calendar.events`.
   - Vercel → Environment Variables: `GOOGLE_SA_EMAIL` (client_email) and `GOOGLE_SA_PRIVATE_KEY` (private_key). Redeploy.
   - Then Settings → **Sync task deadlines to Calendar** once, so existing open tasks appear too.

### What's new
| Feature | Where | How it works |
|---|---|---|
| Meetings and reminders | `/meetings`, task page → "Schedule a call or reminder" | Creates the event in the organiser's Google Calendar with an optional Meet link; Google emails the invites. Cancelling notifies guests. Linked tasks get a timeline entry. |
| Task deadlines in Calendar | automatic | Every open task appears as an all-day "Due: PX-…" event in its owner's calendar, with a pop-up at 9 am the day before. It moves on reassign or due-date change and disappears when the task is submitted or closed. |
| Upcoming meetings | `/my-work` | Today's and tomorrow's meetings from the person's Google Calendar, with Join Meet buttons. |
| Daily digest | 6:30 pm IST | Acknowledgements, starts, unblocks, closures, due-date changes and comments are bundled into one email per person. New assignments, blocks, submissions, reopens and @mentions are still sent instantly. Switch off in Settings to go back to instant emails. |
| Recurring tasks | `/recurring` (VP, admins, leads) | Daily (Mon–Sat), weekly or monthly rules; a task is created and assigned at 8:30 am IST on each scheduled day. |
| @mentions | task comments | Type `@Name` or click a name chip. The person is emailed straight away and can open, follow and comment on the task. |

### Files
```
supabase/006_release1.sql            watchers, digest queue, recurring rules, meetings, calendar columns
supabase/007_release1_schedules.sql  8:30 am recurring job, 6:30 pm digest job
src/lib/google/calendar.ts           Calendar API via service account (no extra packages)
src/lib/calendar-sync.ts             task due dates → owner's calendar
src/lib/notify/digest.ts             evening digest
src/lib/recurring.ts                 recurring rules
src/lib/mentions.ts                  @mention handles
src/app/meeting-actions.ts           schedule / cancel meetings
src/app/recurring-actions.ts         create / pause / delete rules
```


---

## Release 2: Team availability, Message & Call, Today list, task links

### Setup (once)
1. **Database:** Supabase → SQL Editor → run `supabase/008_release2.sql`.
2. **Google Chat (for the Message button; optional — without it, Message opens an email):**
   - Google Cloud Console (pexeta-ops project) → APIs & Services → Library → **Google Chat API** → Enable.
   - Google Chat API → **Configuration** tab: App name `Pexeta Ops`, an avatar URL (e.g. `https://ops.pexeta.in/pexeta-logo.png`), a short description.
     Turn interactive features **off**. Save.
   - Google Admin → Security → API controls → Manage domain-wide delegation → **edit** the Pexeta Ops entry so the scopes are (comma separated):
     `https://www.googleapis.com/auth/calendar.events,https://www.googleapis.com/auth/chat.spaces.readonly`
   - Vercel → Environment Variables: `GOOGLE_CHAT_ENABLED` = `1`. Redeploy.

### What's new
| Feature | Where | How it works |
|---|---|---|
| Who's free | `/team` | Each person's status right now from their own Google Calendar: free (and next meeting), in a meeting until…, or out of office. All-day events and declined invites are ignored. |
| Message | `/team`, task page | Opens your existing Google Chat DM with that person. Ops never creates chats (to avoid duplicates); if none is found it opens Google Chat so you can start one. Falls back to email until Chat is connected. |
| Call | `/team`, task page | Starts a 30-minute Google Meet now, invites the person (they get a calendar notification) and opens the call. Calls from a task are logged on its timeline. |
| Today | top of `/my-work` | Overdue, due today, to acknowledge, blocked and today's meetings, with the overdue and due-today tasks listed in priority order. |
| Files and links | task page | Attach Drive files, Sheets, Docs or any URL with a label; recognised Google file types get an icon. |
