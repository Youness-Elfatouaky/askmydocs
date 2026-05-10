from dataclasses import dataclass
from io import BytesIO

from PyPDF2 import PdfReader

from core.config import settings


@dataclass
class PageText:
    page_number: int
    text: str


@dataclass
class Chunk:
    index: int
    page_number: int | None
    text: str


def extract_pages(data: bytes) -> list[PageText]:
    reader = PdfReader(BytesIO(data))
    pages: list[PageText] = []
    for i, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        # PDF text extraction sometimes leaves NULL bytes in place of
        # broken ligatures (fi, fl, etc.). Postgres TEXT columns reject
        # \x00 outright, so we have to strip them before storing.
        text = text.replace("\x00", "").strip()
        if text:
            pages.append(PageText(page_number=i, text=text))
    return pages


def chunk_pages(
    pages: list[PageText],
    chunk_size: int | None = None,
    overlap: int | None = None,
) -> list[Chunk]:
    size = chunk_size or settings.CHUNK_SIZE
    over = overlap if overlap is not None else settings.CHUNK_OVERLAP
    if size <= 0:
        raise ValueError("chunk_size must be positive")
    if over >= size:
        raise ValueError("overlap must be smaller than chunk_size")

    chunks: list[Chunk] = []
    idx = 0
    for page in pages:
        text = page.text
        start = 0
        while start < len(text):
            end = min(start + size, len(text))
            slice_ = text[start:end].strip()
            if slice_:
                chunks.append(Chunk(index=idx, page_number=page.page_number, text=slice_))
                idx += 1
            if end == len(text):
                break
            start = end - over
    return chunks
