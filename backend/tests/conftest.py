"""
Shared pytest fixtures.

Sets the env vars Settings() requires BEFORE the app is imported, then
exposes an async httpx client bound to the FastAPI app via ASGITransport.
The app no longer touches the DB at startup (Alembic owns schema), so tests
work without a live Postgres.
"""

import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@localhost/test")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-real")
os.environ.setdefault("OPENAI_API_KEY", "test-key-not-real")

import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402


@pytest_asyncio.fixture
async def client():
    from main import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
