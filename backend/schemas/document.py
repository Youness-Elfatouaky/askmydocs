from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class DocumentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    content_type: str
    size_bytes: int
    status: str
    page_count: int | None
    created_at: datetime


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    document_id: int | None = None
    top_k: int | None = Field(default=None, ge=1, le=20)


class Citation(BaseModel):
    document_id: int
    filename: str
    chunk_index: int
    page_number: int | None
    snippet: str
    score: float


class AskResponse(BaseModel):
    answer: str
    citations: list[Citation]
