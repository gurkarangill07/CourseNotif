# CourseNotif

CourseNotif monitors tracked courses and notifies users when open seats are available.

## What is implemented now

- PostgreSQL schema: `db/schema.sql`
- Monitoring worker logic (Node.js):
  - Reads tracked courses per user
  - Runs VSB automation in browser mode (search, dropdown select, refresh)
  - Captures all `getClassData.jsp` responses and uses the latest one
  - Parses `cartid`, `os`, and `code` (for course name)
  - If `os > 0`, sends stub email event and stops tracking that course for that user
  - Detects shared VSB session failure/timeout and sends stub owner-alert event

Email integration is intentionally stubbed (console events only) for now.

## Project files

- `db/schema.sql`: database tables
- `src/worker.js`: monitor runner (`once` and loop modes)
- `src/monitorService.js`: core monitoring logic
- `src/vsbBrowserSource.js`: Playwright automation + network capture
- `src/jspParser.js`: `getClassData.jsp` parser
- `src/notification.js`: email stubs

## Setup

1. Install dependencies and browser:

```bash
npm install
npx playwright install chromium
```

2. Set env vars:

```bash
export DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DB_NAME"
export OWNER_ALERT_EMAIL="you@example.com" # optional but recommended
export MONITOR_INTERVAL_SECONDS="60"       # optional, default 60
export SESSION_DURATION_MINUTES="90"       # optional, default 90
export VSB_REFRESH_INTERVAL_MINUTES="15"   # optional, default 15

# Source mode: browser | filesystem | db
export VSB_SOURCE_MODE="browser"

# Browser mode (automation)
export VSB_URL="https://your-vsb-url"
export VSB_USER_DATA_DIR=".data/vsb-profile"
export VSB_HEADLESS="false"                # keep false initially for login visibility
export VSB_SEARCH_SELECTOR="input[type='search']"
export VSB_DROPDOWN_OPTION_SELECTOR="[role='option']"
export VSB_COURSE_ROW_SELECTOR="tr, li, .course, .course-row"
export VSB_COURSE_PRESENCE_SELECTOR="tr, li, .course, .course-row"
export VSB_COURSE_CHECKBOX_SELECTOR="input[type='checkbox'], [role='checkbox']"
export VSB_CHECKBOX_TIMEOUT_MS="6000"
export VSB_SYNC_TRACKED_COURSES_ON_START="true"
export VSB_SYNC_TRACKED_COURSES_LIMIT="50"
export VSB_LOGGED_OUT_SELECTOR="input[type='password']"

# Optional auto re-login (recommended if VSB session expires frequently)
export VSB_AUTO_RELOGIN_ENABLED="true"
export VSB_LOGIN_USERNAME="your_student_username_or_email"
export VSB_LOGIN_PASSWORD="your_password"
export VSB_LOGIN_USERNAME_SELECTOR="input[type='email'], input[name='username'], input[name='user']"
export VSB_LOGIN_PASSWORD_SELECTOR="input[type='password']"
export VSB_LOGIN_SUBMIT_SELECTOR="button[type='submit'], input[type='submit']"
export VSB_LOGIN_CONTINUE_SELECTOR="a[href*='schedulebuilder.yorku.ca/vsb/'], a:has-text('Visual Schedule Builder')"
export VSB_POST_LOGIN_WAIT_MS="1500"

# Optional fallback modes
export JSP_SOURCE_DIR="/absolute/path/to/jsp/files" # used only when VSB_SOURCE_MODE=filesystem
```

3. Apply schema:

```bash
psql "$DATABASE_URL" -f db/schema.sql
```

## Run

Start web UI + API server (frontend/backend connected):

```bash
npm run web
```

Then open:

```text
http://localhost:3000
```

Initialize browser login session (browser mode only):

```bash
npm run monitor:init-login
```

After command starts, login to VSB in the opened browser. Once the search field is visible, session state is marked `ok`.

Single run:

```bash
npm run monitor:once
```

Loop mode:

```bash
npm run monitor:loop
```

Immediate check when a user adds a new course:

```bash
node src/worker.js --check-new-course <userId> <cartId>
```

## Notes

- Browser mode is designed for "login once, keep worker running in background."
- You do not need your personal VSB tab open, but the automation process must stay running and machine must stay awake/online.
- When session expires, worker can auto re-login if `VSB_AUTO_RELOGIN_ENABLED=true` and login credentials/selectors are configured.
- Browser mode refresh rule: if a fresh JSP was captured within the last 15 minutes, worker reuses it; otherwise it forces a new VSB refresh and captures latest JSP.
- UI tracking actions now persist to PostgreSQL through `/api/*` endpoints (no local-only list anymore).
- Custom course names entered in UI are stored per tracked user-course (`user_courses.display_name`), not globally per cart id.
- If browser refresh capture fails, worker only falls back to cached JSP when that cache is still within the configured refresh window.
