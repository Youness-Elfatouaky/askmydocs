"""
Shared pytest fixtures.

Sets the env vars Settings() requires BEFORE the app is imported, stubs
init_db() so the test session doesn't need a live database, and exposes
an async httpx client bound to the FastAPI app via ASGITransport.
"""

import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-real")
os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402


@pytest_asyncio.fixture
async def client(monkeypatch):
    # Skip the real init_db() so we don't need a live Postgres.
    async def fake_init_db() -> None:
        return None

    from core import database

    monkeypatch.setattr(database, "init_db", fake_init_db)

    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
