import os
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models import Document, DocumentChunk, User
from schemas.document import Citation
from services import ai_service
from utils.pdf import chunk_pages, extract_pages


async def save_and_index(db: AsyncSession, user: User, upload: UploadFile) -> Document:
    if upload.content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only PDF uploads are supported")

    data = await upload.read()
    size = len(data)
    max_bytes = settings.MAX_UPLOAD_MB * 1024 * 1024
    if size > max_bytes:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "File too large")

    upload_dir = Path(settings.UPLOAD_DIR) / str(user.id)
    upload_dir.mkdir(parents=True, exist_ok=True)
    storage_path = upload_dir / f"{uuid.uuid4().hex}.pdf"
    storage_path.write_bytes(data)

    doc = Document(
        owner_id=user.id,
        filename=upload.filename or storage_path.name,
        content_type=upload.content_type,
        size_bytes=size,
        storage_path=str(storage_path),
        status="processing",
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    try:
        pages = extract_pages(data)
        chunks = chunk_pages(pages)
        if not chunks:
            doc.status = "empty"
            doc.page_count = len(pages)
            await db.commit()
            return doc

        embeddings = await ai_service.embed_texts([c.text for c in chunks])
        for c, emb in zip(chunks, embeddings, strict=False):
            db.add(
                DocumentChunk(
                    document_id=doc.id,
                    chunk_index=c.index,
                    page_number=c.page_number,
                    content=c.text,
                    embedding=emb,
                )
            )
        doc.page_count = len(pages)
        doc.status = "ready"
        await db.commit()
        await db.refresh(doc)
    except Exception:
        doc.status = "failed"
        await db.commit()
        try:
            os.remove(storage_path)
        except OSError:
            pass
        raise

    return doc


async def list_documents(db: AsyncSession, user: User) -> list[Document]:
    result = await db.scalars(
        select(Document).where(Document.owner_id == user.id).order_by(Document.created_at.desc())
    )
    return list(result.all())


async def get_document(db: AsyncSession, user: User, document_id: int) -> Document:
    doc = await db.get(Document, document_id)
    if not doc or doc.owner_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return doc


async def delete_document(db: AsyncSession, user: User, document_id: int) -> None:
    doc = await get_document(db, user, document_id)
    try:
        os.remove(doc.storage_path)
    except OSError:
        pass
    await db.delete(doc)
    await db.commit()


async def search_chunks(
    db: AsyncSession,
    user: User,
    query_embedding: list[float],
    top_k: int,
    document_id: int | None = None,
) -> list[tuple[DocumentChunk, Document, float]]:
    distance = DocumentChunk.embedding.cosine_distance(query_embedding)
    stmt = (
        select(DocumentChunk, Document, distance.label("distance"))
        .join(Document, DocumentChunk.document_id == Document.id)
        .where(Document.owner_id == user.id, Document.status == "ready")
        .order_by(distance.asc())
        .limit(top_k)
    )
    if document_id is not None:
        stmt = stmt.where(Document.id == document_id)
    rows = (await db.execute(stmt)).all()
    return [(chunk, doc, float(dist)) for chunk, doc, dist in rows]


async def ask(
    db: AsyncSession,
    user: User,
    question: str,
    top_k: int | None = None,
    document_id: int | None = None,
) -> tuple[str, list[Citation]]:
    k = top_k or settings.TOP_K
    query_emb = await ai_service.embed_text(question)
    matches = await search_chunks(db, user, query_emb, k, document_id)
    if not matches:
        return ("I don't have any indexed content to answer that yet.", [])

    contexts = [m[0].content for m in matches]
    answer = await ai_service.answer_with_context(question, contexts)
    citations = [
        Citation(
            document_id=doc.id,
            filename=doc.filename,
            chunk_index=chunk.chunk_index,
            page_number=chunk.page_number,
            snippet=chunk.content[:240],
            score=1.0 - dist,
        )
        for chunk, doc, dist in matches
    ]
    return answer, citations
