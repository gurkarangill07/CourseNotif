# YorkU VSB Seat Monitor (Prototype)

Centralized MVP for monitoring York University VSB seat availability and sending email alerts when seats open.

## What this repo contains

- FastAPI backend with watch request APIs
- XML fetch/parsing pipeline for VSB `get_data.jsp`
- 3-point block matching (`pn`, `usn`, `key`)
- `os` seat trigger logic and alert deduplication
- Session-expiry detection and relogin notifications
- SQLite persistence for state/logging
- Background monitor loop (default every 300s)

## Architecture (MVP option 2)

- Users submit monitor requests to this service.
- Service polls VSB from one central authenticated session.
- Service parses XML and checks open seats.
- Service sends email alert on `0 -> >0` state transition.
- If VSB session expires (~90 min), service marks session invalid and sends relogin alert.

## Quick start

1. Create a virtual environment and install dependencies.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2. Create `.env` from template.

```bash
cp .env.example .env
```

3. Fill required variables in `.env`:

- `VSB_XHR_URL`
- `VSB_COOKIE_HEADER` (active Passport York session cookies)
- `EMAIL_SENDER`
- `EMAIL_APP_PASSWORD`
- `ALERT_RECIPIENT_DEFAULT` (fallback recipient)

4. Start the API:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## API

### `POST /watchers`
Create a watch request.

Request body:

```json
{
  "email": "student@example.com",
  "term_code": "W",
  "section_code": "M",
  "block_key": "F57V03",
  "course_label": "EECS 1022 Lab 02"
}
```

### `GET /watchers`
List watch requests.

### `POST /watchers/{watch_id}/disable`
Disable a watch request.

### `GET /session`
Get current VSB session health state.

### `GET /health`
Basic service health.

## Session refresh flow

1. If fetch returns login/HTML instead of XML, state becomes `expired`.
2. A relogin email is sent once (deduplicated).
3. Update `VSB_COOKIE_HEADER` with fresh cookies after York login + Duo.
4. Next successful poll marks session `valid` automatically.

## Local development notes

- Polling loop starts automatically on app startup.
- DB file defaults to `./data/seat_monitor.db` and is created automatically.
- Alert dedupe is controlled by `ALERT_COOLDOWN_MINUTES`.

## GitHub repo setup

After files are ready:

```bash
git add .
git commit -m "Initial YorkU VSB seat monitor MVP"
```

If you already created an empty GitHub repo:

```bash
git remote add origin <your-repo-url>
git branch -M main
git push -u origin main
```

## Security

- Never hardcode York cookies or Gmail app passwords.
- Keep `.env` local only.
- Rotate Gmail app password if exposed.
- Do not send raw session cookies to external services.

## Next iteration

- Move from centralized session to per-user client extension/agent.
- Add auth, rate limiting, and admin dashboard.
- Add PostgreSQL + worker queue for scale.
