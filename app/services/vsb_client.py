from __future__ import annotations

import time

import requests

from app.config import Settings


class VsbClientError(Exception):
    pass


class SessionExpiredError(VsbClientError):
    pass


class FetchError(VsbClientError):
    pass


class VsbClient:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.session = requests.Session()

    def fetch_xml(self) -> str:
        if not self.settings.vsb_xhr_url:
            raise FetchError("VSB_XHR_URL is not configured")

        if not self.settings.vsb_cookie_header:
            raise SessionExpiredError("VSB_COOKIE_HEADER is empty; login session is missing")

        headers = {
            "Accept": "application/xml,text/xml,*/*;q=0.1",
            "User-Agent": self.settings.vsb_user_agent,
            "Cookie": self.settings.vsb_cookie_header,
            "X-Requested-With": "XMLHttpRequest",
            "Referer": "https://w2prod.sis.yorku.ca/Apps/WebObjects/cdm",
        }

        max_retries = max(1, self.settings.request_max_retries)

        for attempt in range(1, max_retries + 1):
            try:
                response = self.session.get(
                    self.settings.vsb_xhr_url,
                    headers=headers,
                    timeout=self.settings.request_timeout_seconds,
                )

                if response.status_code in (401, 403):
                    raise SessionExpiredError(
                        f"received HTTP {response.status_code} from VSB"
                    )

                response.raise_for_status()
                body = response.text.strip()

                lower_body = body.lower()
                if "<html" in lower_body and (
                    "passport york" in lower_body
                    or "duo" in lower_body
                    or "login" in lower_body
                ):
                    raise SessionExpiredError(
                        "VSB returned login page; York session is expired"
                    )

                if not body.startswith("<"):
                    raise FetchError("VSB response is not XML-like")

                return body
            except SessionExpiredError:
                raise
            except requests.RequestException as exc:
                if attempt == max_retries:
                    raise FetchError(f"request failed after {attempt} attempts: {exc}") from exc
            except FetchError:
                if attempt == max_retries:
                    raise

            sleep_seconds = self.settings.request_retry_backoff_seconds * attempt
            time.sleep(sleep_seconds)

        raise FetchError("unexpected fetch loop termination")
