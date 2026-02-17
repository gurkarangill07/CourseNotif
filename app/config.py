from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or value == "":
        return default
    return int(value)


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_host: str
    app_port: int
    log_level: str
    admin_api_key: str

    poll_interval_seconds: int
    poll_jitter_seconds: int
    request_timeout_seconds: int
    request_max_retries: int
    request_retry_backoff_seconds: int
    alert_cooldown_minutes: int

    vsb_xhr_url: str
    vsb_cookie_header: str
    vsb_user_agent: str

    session_stale_minutes: int
    session_hard_expire_minutes: int

    email_smtp_host: str
    email_smtp_port: int
    email_sender: str
    email_app_password: str
    alert_recipient_default: str

    app_db_path: str


@lru_cache(maxsize=1)
def load_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "YorkU VSB Seat Monitor"),
        app_host=os.getenv("APP_HOST", "0.0.0.0"),
        app_port=_get_int("APP_PORT", 8000),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        admin_api_key=os.getenv("ADMIN_API_KEY", ""),
        poll_interval_seconds=_get_int("POLL_INTERVAL_SECONDS", 300),
        poll_jitter_seconds=_get_int("POLL_JITTER_SECONDS", 30),
        request_timeout_seconds=_get_int("REQUEST_TIMEOUT_SECONDS", 20),
        request_max_retries=_get_int("REQUEST_MAX_RETRIES", 3),
        request_retry_backoff_seconds=_get_int("REQUEST_RETRY_BACKOFF_SECONDS", 2),
        alert_cooldown_minutes=_get_int("ALERT_COOLDOWN_MINUTES", 30),
        vsb_xhr_url=os.getenv("VSB_XHR_URL", ""),
        vsb_cookie_header=os.getenv("VSB_COOKIE_HEADER", ""),
        vsb_user_agent=os.getenv(
            "VSB_USER_AGENT",
            (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0 Safari/537.36"
            ),
        ),
        session_stale_minutes=_get_int("SESSION_STALE_MINUTES", 85),
        session_hard_expire_minutes=_get_int("SESSION_HARD_EXPIRE_MINUTES", 90),
        email_smtp_host=os.getenv("EMAIL_SMTP_HOST", "smtp.gmail.com"),
        email_smtp_port=_get_int("EMAIL_SMTP_PORT", 465),
        email_sender=os.getenv("EMAIL_SENDER", ""),
        email_app_password=os.getenv("EMAIL_APP_PASSWORD", ""),
        alert_recipient_default=os.getenv("ALERT_RECIPIENT_DEFAULT", ""),
        app_db_path=os.getenv("APP_DB_PATH", "./data/seat_monitor.db"),
    )
