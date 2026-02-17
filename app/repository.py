from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.config import Settings
from app.database import get_connection


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class WatchRequest:
    id: int
    email: str
    term_code: str
    section_code: str
    block_key: str
    course_label: str | None
    is_active: bool
    created_at: str


@dataclass
class SeatState:
    watch_request_id: int
    last_os: int | None
    last_status: str | None
    last_checked_at: str | None
    last_opened_alert_at: str | None
    last_error: str | None


@dataclass
class SessionStatus:
    state: str
    last_checked_at: str | None
    last_valid_at: str | None
    last_error: str | None
    relogin_notified_at: str | None


class Repository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def create_watch_request(
        self,
        email: str,
        term_code: str,
        section_code: str,
        block_key: str,
        course_label: str | None,
    ) -> WatchRequest:
        created_at = utc_now_iso()
        with get_connection(self.settings) as conn:
            cur = conn.execute(
                """
                INSERT INTO watch_requests
                (email, term_code, section_code, block_key, course_label, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (email, term_code, section_code, block_key, course_label, created_at),
            )
            watch_id = cur.lastrowid
        return self.get_watch_request(watch_id)

    def get_watch_request(self, watch_id: int) -> WatchRequest:
        with get_connection(self.settings) as conn:
            row = conn.execute(
                "SELECT * FROM watch_requests WHERE id = ?",
                (watch_id,),
            ).fetchone()
        if row is None:
            raise KeyError(f"watch request {watch_id} not found")
        return WatchRequest(
            id=row["id"],
            email=row["email"],
            term_code=row["term_code"],
            section_code=row["section_code"],
            block_key=row["block_key"],
            course_label=row["course_label"],
            is_active=bool(row["is_active"]),
            created_at=row["created_at"],
        )

    def list_watch_requests(self) -> list[WatchRequest]:
        with get_connection(self.settings) as conn:
            rows = conn.execute(
                "SELECT * FROM watch_requests ORDER BY id DESC"
            ).fetchall()
        return [
            WatchRequest(
                id=row["id"],
                email=row["email"],
                term_code=row["term_code"],
                section_code=row["section_code"],
                block_key=row["block_key"],
                course_label=row["course_label"],
                is_active=bool(row["is_active"]),
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def list_active_watch_requests(self) -> list[WatchRequest]:
        with get_connection(self.settings) as conn:
            rows = conn.execute(
                "SELECT * FROM watch_requests WHERE is_active = 1 ORDER BY id ASC"
            ).fetchall()
        return [
            WatchRequest(
                id=row["id"],
                email=row["email"],
                term_code=row["term_code"],
                section_code=row["section_code"],
                block_key=row["block_key"],
                course_label=row["course_label"],
                is_active=bool(row["is_active"]),
                created_at=row["created_at"],
            )
            for row in rows
        ]

    def disable_watch_request(self, watch_id: int) -> None:
        with get_connection(self.settings) as conn:
            conn.execute(
                "UPDATE watch_requests SET is_active = 0 WHERE id = ?",
                (watch_id,),
            )

    def get_seat_state(self, watch_id: int) -> SeatState | None:
        with get_connection(self.settings) as conn:
            row = conn.execute(
                "SELECT * FROM seat_state WHERE watch_request_id = ?",
                (watch_id,),
            ).fetchone()
        if row is None:
            return None
        return SeatState(
            watch_request_id=row["watch_request_id"],
            last_os=row["last_os"],
            last_status=row["last_status"],
            last_checked_at=row["last_checked_at"],
            last_opened_alert_at=row["last_opened_alert_at"],
            last_error=row["last_error"],
        )

    def upsert_seat_state(
        self,
        watch_id: int,
        last_os: int | None,
        last_status: str,
        last_error: str | None,
    ) -> None:
        checked_at = utc_now_iso()
        with get_connection(self.settings) as conn:
            conn.execute(
                """
                INSERT INTO seat_state (
                    watch_request_id,
                    last_os,
                    last_status,
                    last_checked_at,
                    last_error
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(watch_request_id) DO UPDATE SET
                    last_os = excluded.last_os,
                    last_status = excluded.last_status,
                    last_checked_at = excluded.last_checked_at,
                    last_error = excluded.last_error
                """,
                (watch_id, last_os, last_status, checked_at, last_error),
            )

    def set_last_opened_alert_at(self, watch_id: int, sent_at: str) -> None:
        with get_connection(self.settings) as conn:
            conn.execute(
                """
                UPDATE seat_state
                SET last_opened_alert_at = ?
                WHERE watch_request_id = ?
                """,
                (sent_at, watch_id),
            )

    def log_check(
        self,
        watch_id: int,
        status: str,
        message: str,
        os_value: int | None = None,
    ) -> None:
        with get_connection(self.settings) as conn:
            conn.execute(
                """
                INSERT INTO check_logs (watch_request_id, checked_at, os_value, status, message)
                VALUES (?, ?, ?, ?, ?)
                """,
                (watch_id, utc_now_iso(), os_value, status, message),
            )

    def log_alert(
        self,
        watch_id: int | None,
        alert_type: str,
        payload: dict[str, Any],
    ) -> None:
        with get_connection(self.settings) as conn:
            conn.execute(
                """
                INSERT INTO alerts_sent (watch_request_id, alert_type, sent_at, payload)
                VALUES (?, ?, ?, ?)
                """,
                (watch_id, alert_type, utc_now_iso(), json.dumps(payload)),
            )

    def get_session_status(self) -> SessionStatus:
        with get_connection(self.settings) as conn:
            row = conn.execute(
                """
                SELECT state, last_checked_at, last_valid_at, last_error, relogin_notified_at
                FROM session_status
                WHERE id = 1
                """
            ).fetchone()
        if row is None:
            raise RuntimeError("session_status row missing")
        return SessionStatus(
            state=row["state"],
            last_checked_at=row["last_checked_at"],
            last_valid_at=row["last_valid_at"],
            last_error=row["last_error"],
            relogin_notified_at=row["relogin_notified_at"],
        )

    def set_session_valid(self) -> None:
        now = utc_now_iso()
        with get_connection(self.settings) as conn:
            conn.execute(
                """
                UPDATE session_status
                SET state = 'valid',
                    last_checked_at = ?,
                    last_valid_at = ?,
                    last_error = NULL,
                    relogin_notified_at = NULL
                WHERE id = 1
                """,
                (now, now),
            )

    def set_session_expired(self, error: str) -> None:
        with get_connection(self.settings) as conn:
            conn.execute(
                """
                UPDATE session_status
                SET state = 'expired',
                    last_checked_at = ?,
                    last_error = ?
                WHERE id = 1
                """,
                (utc_now_iso(), error),
            )

    def set_session_fetch_error(self, error: str) -> None:
        with get_connection(self.settings) as conn:
            conn.execute(
                """
                UPDATE session_status
                SET state = 'fetch_error',
                    last_checked_at = ?,
                    last_error = ?
                WHERE id = 1
                """,
                (utc_now_iso(), error),
            )

    def set_relogin_notified(self, notified_at: str) -> None:
        with get_connection(self.settings) as conn:
            conn.execute(
                """
                UPDATE session_status
                SET relogin_notified_at = ?
                WHERE id = 1
                """,
                (notified_at,),
            )
