from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class WatchRequestCreate(BaseModel):
    email: EmailStr
    term_code: str = Field(default="W", min_length=1, max_length=8)
    section_code: str = Field(min_length=1, max_length=16)
    block_key: str = Field(min_length=1, max_length=32)
    course_label: str | None = Field(default=None, max_length=128)


class WatchRequestOut(BaseModel):
    id: int
    email: EmailStr
    term_code: str
    section_code: str
    block_key: str
    course_label: str | None
    is_active: bool
    created_at: str


class DisableWatchResponse(BaseModel):
    id: int
    is_active: bool


class SessionStatusOut(BaseModel):
    state: str
    last_checked_at: str | None
    last_valid_at: str | None
    last_error: str | None
    relogin_notified_at: str | None


class HealthOut(BaseModel):
    status: str
    app: str
    active_watchers: int
    session_state: str
