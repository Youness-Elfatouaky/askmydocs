from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from models import User
from schemas.document import AskRequest, AskResponse, DocumentRead
from services.auth_service import get_current_user
from services.document_service import (
    ask,
    delete_document,
    list_documents,
    save_and_index,
)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def upload(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await save_and_index(db, current_user, file)


@router.get("", response_model=list[DocumentRead])
async def index(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await list_documents(db, current_user)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    await delete_document(db, current_user, document_id)


@router.post("/ask", response_model=AskResponse)
async def ask_question(
    payload: AskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AskResponse:
    answer, citations = await ask(
        db, current_user, payload.question, payload.top_k, payload.document_id
    )
    return AskResponse(answer=answer, citations=citations)
