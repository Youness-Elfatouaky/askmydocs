"""
AskMyDocs MCP server.

Exposes the existing retrieval/answer pipeline (services.document_service,
services.ai_service) to MCP clients (Claude Desktop, Claude Code) over
stdio. Read-only: no upload/delete tools, mirroring the HTTP API's logic
exactly rather than duplicating it.

MCP tool calls carry no bearer token, so there is no "current user" the way
HTTP requests have one. Documents are owner-scoped in the DB, so this server
resolves a single configured account (MCP_USER_EMAIL) and scopes every call
to it, instead of exposing every user's documents.
"""

import sys
from typing import Annotated

from mcp.server.fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field
from sqlalchemy import select

from core.config import settings
from core.database import AsyncSessionLocal
from mcp_server.schemas import AskResult, DocumentInfo, SearchResult
from models import User
from services import ai_service, document_service

mcp = FastMCP("askmydocs")

_READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)


async def _get_mcp_user(db) -> User:
    if not settings.MCP_USER_EMAIL:
        raise RuntimeError(
            "MCP_USER_EMAIL is not configured. Set it to the email of the "
            "AskMyDocs account whose documents this server should expose."
        )
    user = await db.scalar(select(User).where(User.email == settings.MCP_USER_EMAIL))
    if user is None:
        raise RuntimeError(f"No AskMyDocs user found with email {settings.MCP_USER_EMAIL!r}")
    return user


@mcp.tool(annotations=_READ_ONLY)
async def list_documents() -> list[DocumentInfo]:
    """List every indexed document, with id, title, page count and upload date."""
    async with AsyncSessionLocal() as db:
        user = await _get_mcp_user(db)
        docs = await document_service.list_documents(db, user)
        return [
            DocumentInfo(id=d.id, title=d.filename, page_count=d.page_count, upload_date=d.created_at)
            for d in docs
        ]


@mcp.tool(annotations=_READ_ONLY)
async def search_documents(
    query: Annotated[str, Field(min_length=1, max_length=2000)],
    top_k: Annotated[int, Field(ge=1, le=20)] = 5,
) -> list[SearchResult]:
    """Semantic search over indexed document chunks. Returns matching chunks
    with document title, page number and similarity score."""
    async with AsyncSessionLocal() as db:
        user = await _get_mcp_user(db)
        embedding = await ai_service.embed_text(query)
        matches = await document_service.search_chunks(db, user, embedding, top_k)
        return [
            SearchResult(
                document_id=doc.id,
                document_title=doc.filename,
                page_number=chunk.page_number,
                score=1.0 - dist,
                content=chunk.content,
            )
            for chunk, doc, dist in matches
        ]


@mcp.tool(annotations=_READ_ONLY)
async def ask_document(
    question: Annotated[str, Field(min_length=1, max_length=2000)],
    document_id: int | None = None,
) -> AskResult:
    """Answer a question using the indexed documents, optionally scoped to one
    document_id, with citations (document + page) for the source material."""
    async with AsyncSessionLocal() as db:
        user = await _get_mcp_user(db)
        answer, citations = await document_service.ask(db, user, question, document_id=document_id)
        return AskResult(answer=answer, citations=citations)


def main() -> None:
    if not settings.MCP_USER_EMAIL:
        print(
            "warning: MCP_USER_EMAIL is not set — every tool call will fail "
            "until it's configured.",
            file=sys.stderr,
        )
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
