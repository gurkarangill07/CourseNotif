from __future__ import annotations

import smtplib
from email.message import EmailMessage

from app.config import Settings


class NotificationError(Exception):
    pass


class EmailNotifier:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def send_email(self, recipient: str, subject: str, body: str) -> None:
        if not self.settings.email_sender or not self.settings.email_app_password:
            raise NotificationError("email sender credentials are not configured")

        msg = EmailMessage()
        msg["From"] = self.settings.email_sender
        msg["To"] = recipient
        msg["Subject"] = subject
        msg.set_content(body)

        try:
            with smtplib.SMTP_SSL(
                self.settings.email_smtp_host,
                self.settings.email_smtp_port,
            ) as smtp:
                smtp.login(self.settings.email_sender, self.settings.email_app_password)
                smtp.send_message(msg)
        except Exception as exc:
            raise NotificationError(f"failed to send email: {exc}") from exc
