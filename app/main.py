from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, status

from app.config import load_settings
from app.database import init_db
from app.repository import Repository
from app.schemas import (
    DisableWatchResponse,
    HealthOut,
    SessionStatusOut,
    WatchRequestCreate,
    WatchRequestOut,
)
from app.services.monitor import MonitorService

settings = load_settings()
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

repository = Repository(settings)
monitor = MonitorService(settings, repository)


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db(settings)
    await monitor.start()
    yield
    await monitor.stop()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)


def require_api_key(x_api_key: str | None = Header(default=None)) -> None:
    if not settings.admin_api_key:
        return
    if x_api_key != settings.admin_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )


@app.get("/health", response_model=HealthOut)
def health() -> HealthOut:
    session = repository.get_session_status()
    active_watchers = len(repository.list_active_watch_requests())
    return HealthOut(
        status="ok",
        app=settings.app_name,
        active_watchers=active_watchers,
        session_state=session.state,
    )


@app.get("/session", response_model=SessionStatusOut)
def session_status() -> SessionStatusOut:
    session = repository.get_session_status()
    return SessionStatusOut(
        state=session.state,
        last_checked_at=session.last_checked_at,
        last_valid_at=session.last_valid_at,
        last_error=session.last_error,
        relogin_notified_at=session.relogin_notified_at,
    )


@app.get("/watchers", response_model=list[WatchRequestOut])
def list_watchers(_: None = Depends(require_api_key)) -> list[WatchRequestOut]:
    rows = repository.list_watch_requests()
    return [
        WatchRequestOut(
            id=row.id,
            email=row.email,
            term_code=row.term_code,
            section_code=row.section_code,
            block_key=row.block_key,
            course_label=row.course_label,
            is_active=row.is_active,
            created_at=row.created_at,
        )
        for row in rows
    ]


@app.post("/watchers", response_model=WatchRequestOut, status_code=status.HTTP_201_CREATED)
def create_watcher(
    payload: WatchRequestCreate,
    _: None = Depends(require_api_key),
) -> WatchRequestOut:
    row = repository.create_watch_request(
        email=payload.email,
        term_code=payload.term_code,
        section_code=payload.section_code,
        block_key=payload.block_key,
        course_label=payload.course_label,
    )
    return WatchRequestOut(
        id=row.id,
        email=row.email,
        term_code=row.term_code,
        section_code=row.section_code,
        block_key=row.block_key,
        course_label=row.course_label,
        is_active=row.is_active,
        created_at=row.created_at,
    )


@app.post("/watchers/{watch_id}/disable", response_model=DisableWatchResponse)
def disable_watcher(
    watch_id: int,
    _: None = Depends(require_api_key),
) -> DisableWatchResponse:
    try:
        repository.get_watch_request(watch_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    repository.disable_watch_request(watch_id)
    row = repository.get_watch_request(watch_id)
    return DisableWatchResponse(id=row.id, is_active=row.is_active)
