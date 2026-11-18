from datetime import datetime

from pydantic import BaseModel

from schemas.document import Citation


class DocumentInfo(BaseModel):
    id: int
    title: str
    page_count: int | None
    upload_date: datetime


class SearchResult(BaseModel):
    document_id: int
    document_title: str
    page_number: int | None
    score: float
    content: str


class AskResult(BaseModel):
    answer: str
    citations: list[Citation]
