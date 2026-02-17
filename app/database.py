from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.config import Settings


def _ensure_db_dir(db_path: str) -> None:
    db_parent = Path(db_path).expanduser().resolve().parent
    db_parent.mkdir(parents=True, exist_ok=True)


@contextmanager
def get_connection(settings: Settings) -> Iterator[sqlite3.Connection]:
    _ensure_db_dir(settings.app_db_path)
    conn = sqlite3.connect(settings.app_db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db(settings: Settings) -> None:
    with get_connection(settings) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS watch_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                term_code TEXT NOT NULL DEFAULT 'W',
                section_code TEXT NOT NULL,
                block_key TEXT NOT NULL,
                course_label TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS seat_state (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                watch_request_id INTEGER NOT NULL UNIQUE,
                last_os INTEGER,
                last_status TEXT,
                last_checked_at TEXT,
                last_opened_alert_at TEXT,
                last_error TEXT,
                FOREIGN KEY(watch_request_id) REFERENCES watch_requests(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS check_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                watch_request_id INTEGER,
                checked_at TEXT NOT NULL,
                os_value INTEGER,
                status TEXT NOT NULL,
                message TEXT,
                FOREIGN KEY(watch_request_id) REFERENCES watch_requests(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS alerts_sent (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                watch_request_id INTEGER,
                alert_type TEXT NOT NULL,
                sent_at TEXT NOT NULL,
                payload TEXT,
                FOREIGN KEY(watch_request_id) REFERENCES watch_requests(id)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS session_status (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                state TEXT NOT NULL,
                last_checked_at TEXT,
                last_valid_at TEXT,
                last_error TEXT,
                relogin_notified_at TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT OR IGNORE INTO session_status
            (id, state, last_checked_at, last_valid_at, last_error, relogin_notified_at)
            VALUES (1, 'unknown', NULL, NULL, NULL, NULL)
            """
        )
