# CourseNotif Roadmap (Implementation-Aligned)

Last updated: February 20, 2026

## Current baseline (already done)

- PostgreSQL schema and DB layer are implemented.
- Express API exists for user resolve and tracked-course CRUD.
- Web UI exists and is connected to `/api/*`.
- Monitoring worker exists with `--init-login`, `--once`, loop mode, and immediate check mode.
- VSB source modes exist (`browser`, `filesystem`, `db`) with Playwright capture path.
- JSP parser and monitor flow update course state and stop tracking after open-seat notification trigger.
- Notification functions are present but currently stubbed (console events only).

## Phase 1: Real notifications and reliability

Goal: move from stub alerts to reliable user-visible delivery.

- Integrate real email provider (Resend or SendGrid).
- Store notification attempts and outcomes.
- Add retry/backoff for transient send failures.
- Add idempotency guard to avoid duplicate sends for the same event.
- Define alert suppression/dedupe window and enforce it in code.

Exit criteria:
- Real emails send successfully in end-to-end tests.
- Failed sends are retried and logged with clear status.
- No duplicate emails for one open-seat event.

## Phase 2: Security and access control

Goal: prevent unauthorized read/write of tracking data.

- Add account auth (session or token based).
- Bind tracked-course operations to authenticated user identity.
- Remove dependency on query/body email for ownership checks.
- Add basic rate limiting and input hardening on API endpoints.
- Add environment and secret management checklist for deployment.

Exit criteria:
- Only authenticated users can manage their own tracked courses.
- Unauthorized access attempts are blocked and logged.

## Phase 3: Testing and quality gates

Goal: reduce regressions and increase deployment confidence.

- Add unit tests for `jspParser` edge cases.
- Add unit tests for `monitorService` success/failure/session-expiry paths.
- Add integration tests for API routes (`resolve`, list/add/delete tracking).
- Add CI checks for tests plus syntax/static checks.
- Add fixtures for representative `getClassData.jsp` payload variants.

Exit criteria:
- Core parser, monitor, and API paths are covered by automated tests.
- CI blocks merges when checks fail.

## Phase 4: Observability and operations

Goal: make production behavior visible and supportable.

- Add structured logging for worker and API.
- Add metrics for scan count, failures, notify count, and latency.
- Add alerts for session-expired state and repeated worker failures.
- Create runbooks for login refresh, provider failure, and DB connectivity issues.
- Add graceful startup/shutdown checks and health reporting for worker process.

Exit criteria:
- Operators can detect and diagnose failures quickly.
- Common incidents have documented recovery steps.

## Phase 5: Product and UX improvements

Goal: improve usability and reduce manual support overhead.

- Add clearer UI status for each tracked course (last check, latest OS, alert state).
- Add pause/resume tracking controls.
- Add user-visible error states for session/auth problems.
- Add optional immediate recheck button in UI after adding a course.
- Improve validation and feedback for course/cart ID entry.

Exit criteria:
- Users can self-serve most common tracking and recovery actions from UI.

## Parallel policy/compliance track

- Confirm acceptable monitoring frequency and access method constraints.
- Enforce minimum poll interval guardrails in config/runtime.
- Add feature kill-switch for emergency disable.
- Document compliance assumptions and review cadence.

## Immediate next actions (recommended order)

1. Implement real email provider integration with delivery logging.
2. Add parser + monitor + API automated tests.
3. Introduce authentication and ownership enforcement.
4. Add observability baseline (structured logs + key metrics).
