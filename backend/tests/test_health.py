"""
Smoke tests: the FastAPI app boots and basic public routes work.

Uses httpx.AsyncClient + ASGITransport so the app is exercised in-process
(no network, no Postgres, no OpenAI). The init_db lifespan hook is stubbed
out via the `app` fixture in conftest.py.
"""

import pytest


@pytest.mark.asyncio
async def test_health_returns_ok(client):
    res = await client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_root_returns_message(client):
    res = await client.get("/")
    assert res.status_code == 200
    assert "AskMyDocs" in res.json()["message"]
