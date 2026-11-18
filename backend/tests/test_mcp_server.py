"""
Unit tests for the MCP server tools (mcp_server/server.py).

Everything that would touch Postgres or OpenAI is mocked: the DB session,
services.document_service, and services.ai_service. These tests only check
that each tool wires its inputs/outputs correctly on top of that layer —
the layer itself is already covered by backend/tests' other suites.
"""

from contextlib import asynccontextmanager
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from mcp_server import server
from schemas.document import Citation


@asynccontextmanager
async def _fake_session_cm():
    yield SimpleNamespace()


@pytest.fixture(autouse=True)
def _fake_db_session(monkeypatch):
    monkeypatch.setattr(server, "AsyncSessionLocal", lambda: _fake_session_cm())


@pytest.fixture
def _fake_user(monkeypatch):
    fake_user = SimpleNamespace(id=1, email="test@example.com")
    monkeypatch.setattr(server, "_get_mcp_user", AsyncMock(return_value=fake_user))
    return fake_user


@pytest.mark.asyncio
async def test_list_documents_maps_fields(monkeypatch, _fake_user):
    uploaded_at = datetime(2026, 1, 1, tzinfo=UTC)
    fake_doc = SimpleNamespace(id=1, filename="resume.pdf", page_count=2, created_at=uploaded_at)
    monkeypatch.setattr(
        server.document_service, "list_documents", AsyncMock(return_value=[fake_doc])
    )

    result = await server.list_documents()

    assert len(result) == 1
    assert result[0].id == 1
    assert result[0].title == "resume.pdf"
    assert result[0].page_count == 2
    assert result[0].upload_date == uploaded_at


@pytest.mark.asyncio
async def test_search_documents_embeds_query_and_scores_matches(monkeypatch, _fake_user):
    embed_mock = AsyncMock(return_value=[0.1, 0.2, 0.3])
    monkeypatch.setattr(server.ai_service, "embed_text", embed_mock)

    chunk = SimpleNamespace(chunk_index=0, page_number=3, content="FastAPI, Tailwind CSS")
    doc = SimpleNamespace(id=7, filename="resume.pdf")
    search_mock = AsyncMock(return_value=[(chunk, doc, 0.2)])
    monkeypatch.setattr(server.document_service, "search_chunks", search_mock)

    result = await server.search_documents(query="what languages?", top_k=3)

    embed_mock.assert_awaited_once_with("what languages?")
    search_mock.assert_awaited_once()
    assert search_mock.await_args.args[2] == [0.1, 0.2, 0.3]
    assert search_mock.await_args.args[3] == 3

    assert len(result) == 1
    assert result[0].document_id == 7
    assert result[0].document_title == "resume.pdf"
    assert result[0].page_number == 3
    assert result[0].score == pytest.approx(0.8)
    assert result[0].content == "FastAPI, Tailwind CSS"


@pytest.mark.asyncio
async def test_ask_document_returns_answer_and_citations(monkeypatch, _fake_user):
    citation = Citation(
        document_id=7,
        filename="resume.pdf",
        chunk_index=0,
        page_number=1,
        snippet="Python, FastAPI, SQL",
        score=0.42,
    )
    ask_mock = AsyncMock(return_value=("Python and FastAPI.", [citation]))
    monkeypatch.setattr(server.document_service, "ask", ask_mock)

    result = await server.ask_document(question="what languages?", document_id=7)

    ask_mock.assert_awaited_once()
    assert ask_mock.await_args.kwargs["document_id"] == 7
    assert result.answer == "Python and FastAPI."
    assert result.citations == [citation]


@pytest.mark.asyncio
async def test_missing_mcp_user_email_raises(monkeypatch):
    monkeypatch.setattr(server.settings, "MCP_USER_EMAIL", "")

    with pytest.raises(RuntimeError, match="MCP_USER_EMAIL is not configured"):
        await server._get_mcp_user(SimpleNamespace())


@pytest.mark.asyncio
async def test_unknown_mcp_user_email_raises(monkeypatch):
    monkeypatch.setattr(server.settings, "MCP_USER_EMAIL", "nobody@example.com")
    fake_db = SimpleNamespace(scalar=AsyncMock(return_value=None))

    with pytest.raises(RuntimeError, match="No AskMyDocs user found"):
        await server._get_mcp_user(fake_db)
