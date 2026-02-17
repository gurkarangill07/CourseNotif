from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timedelta, timezone
import xml.etree.ElementTree as ET

from app.config import Settings
from app.repository import Repository, SeatState, WatchRequest, utc_now_iso
from app.services.notifier import EmailNotifier, NotificationError
from app.services.parser import BlockNotFoundError, InvalidXmlError, find_open_seats, parse_xml_root
from app.services.vsb_client import FetchError, SessionExpiredError, VsbClient

logger = logging.getLogger(__name__)


def _parse_iso(ts: str) -> datetime:
    dt = datetime.fromisoformat(ts)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class MonitorService:
    def __init__(self, settings: Settings, repository: Repository) -> None:
        self.settings = settings
        self.repository = repository
        self.vsb_client = VsbClient(settings)
        self.notifier = EmailNotifier(settings)
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._stop_event.clear()
        self._task = asyncio.create_task(self._run_forever())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            await self._task
            self._task = None

    async def _run_forever(self) -> None:
        while not self._stop_event.is_set():
            await asyncio.to_thread(self.run_cycle)

            delay_seconds = self._next_delay_seconds()
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=delay_seconds)
            except asyncio.TimeoutError:
                continue

    def _next_delay_seconds(self) -> int:
        base = max(5, self.settings.poll_interval_seconds)
        jitter = max(0, self.settings.poll_jitter_seconds)
        if jitter == 0:
            return base
        return max(5, base + random.randint(-jitter, jitter))

    def run_cycle(self) -> None:
        watches = self.repository.list_active_watch_requests()
        if not watches:
            logger.info("No active watch requests; monitor cycle skipped")
            return

        try:
            xml_payload = self.vsb_client.fetch_xml()
            self.repository.set_session_valid()
        except SessionExpiredError as exc:
            self.repository.set_session_expired(str(exc))
            self._notify_relogin_once(str(exc))
            for watch in watches:
                self.repository.log_check(
                    watch.id,
                    status="session_expired",
                    message=str(exc),
                )
            logger.warning("Session expired; cycle aborted")
            return
        except FetchError as exc:
            self.repository.set_session_fetch_error(str(exc))
            for watch in watches:
                self.repository.log_check(
                    watch.id,
                    status="fetch_error",
                    message=str(exc),
                )
            logger.error("VSB fetch failed: %s", exc)
            return

        try:
            xml_root = parse_xml_root(xml_payload)
        except InvalidXmlError as exc:
            self.repository.set_session_fetch_error(str(exc))
            for watch in watches:
                self.repository.log_check(
                    watch.id,
                    status="invalid_xml",
                    message=str(exc),
                )
            logger.error("Invalid XML payload: %s", exc)
            return

        for watch in watches:
            self._check_watch(watch, xml_root)

    def _check_watch(self, watch: WatchRequest, xml_root: ET.Element) -> None:
        label = watch.course_label or f"{watch.section_code}/{watch.block_key}"

        try:
            os_value = find_open_seats(
                xml_root,
                term_code=watch.term_code,
                section_code=watch.section_code,
                block_key=watch.block_key,
            )
        except BlockNotFoundError as exc:
            self.repository.upsert_seat_state(
                watch.id,
                last_os=None,
                last_status="not_found",
                last_error=str(exc),
            )
            self.repository.log_check(
                watch.id,
                status="not_found",
                message=str(exc),
                os_value=None,
            )
            logger.warning("%s: block not found", label)
            return

        status = "open" if os_value > 0 else "full"
        previous_state = self.repository.get_seat_state(watch.id)

        self.repository.upsert_seat_state(
            watch.id,
            last_os=os_value,
            last_status=status,
            last_error=None,
        )
        self.repository.log_check(
            watch.id,
            status=status,
            message=f"Checked {label}; open seats={os_value}",
            os_value=os_value,
        )

        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        logger.info("%s Checked %s - Status: %s (os=%s)", ts, label, status, os_value)

        if self._should_send_open_alert(previous_state, os_value):
            self._send_open_alert(watch, os_value)

    def _should_send_open_alert(self, previous_state: SeatState | None, current_os: int) -> bool:
        if current_os <= 0:
            return False

        if previous_state is None or previous_state.last_os is None:
            return True

        if previous_state.last_os > 0:
            # Still open from a previous check, only alert again after cooldown.
            if not previous_state.last_opened_alert_at:
                return True
            cooldown_cutoff = datetime.now(timezone.utc) - timedelta(
                minutes=self.settings.alert_cooldown_minutes
            )
            return _parse_iso(previous_state.last_opened_alert_at) <= cooldown_cutoff

        # Transition from full to open.
        return True

    def _send_open_alert(self, watch: WatchRequest, os_value: int) -> None:
        recipient = watch.email or self.settings.alert_recipient_default
        if not recipient:
            self.repository.log_check(
                watch.id,
                status="alert_skipped",
                message="No recipient configured for open-seat alert",
                os_value=os_value,
            )
            return

        label = watch.course_label or f"Section {watch.section_code} ({watch.block_key})"
        subject = f"[YorkU Seat Alert] {label} now has open seats"
        body = (
            "A seat may be available now.\n\n"
            f"Course: {label}\n"
            f"Term: {watch.term_code}\n"
            f"Section: {watch.section_code}\n"
            f"Block key: {watch.block_key}\n"
            f"Open seats (os): {os_value}\n"
            f"Detected at (UTC): {utc_now_iso()}\n\n"
            "Login to VSB quickly to verify and enroll."
        )

        try:
            self.notifier.send_email(recipient, subject, body)
            sent_at = utc_now_iso()
            self.repository.set_last_opened_alert_at(watch.id, sent_at)
            self.repository.log_alert(
                watch.id,
                alert_type="seat_open",
                payload={
                    "recipient": recipient,
                    "os": os_value,
                    "term_code": watch.term_code,
                    "section_code": watch.section_code,
                    "block_key": watch.block_key,
                },
            )
            self.repository.log_check(
                watch.id,
                status="alert_sent",
                message=f"Open-seat alert sent to {recipient}",
                os_value=os_value,
            )
        except NotificationError as exc:
            self.repository.log_check(
                watch.id,
                status="alert_error",
                message=str(exc),
                os_value=os_value,
            )
            logger.error("Failed sending alert for watch_id=%s: %s", watch.id, exc)

    def _notify_relogin_once(self, error_message: str) -> None:
        session = self.repository.get_session_status()
        if session.relogin_notified_at:
            return

        recipient = self.settings.alert_recipient_default
        if not recipient:
            return

        subject = "[YorkU Seat Monitor] VSB session expired - relogin required"
        body = (
            "The monitor cannot access VSB because the York session appears expired.\n\n"
            f"Error: {error_message}\n"
            f"Detected at (UTC): {utc_now_iso()}\n\n"
            "Please log in to York + Duo, refresh VSB cookies, and update VSB_COOKIE_HEADER."
        )

        try:
            self.notifier.send_email(recipient, subject, body)
            sent_at = utc_now_iso()
            self.repository.set_relogin_notified(sent_at)
            self.repository.log_alert(
                watch_id=None,
                alert_type="relogin_required",
                payload={"recipient": recipient, "error": error_message},
            )
        except NotificationError as exc:
            logger.error("Failed sending relogin alert: %s", exc)
