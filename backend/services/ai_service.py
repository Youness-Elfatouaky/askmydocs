from openai import AsyncOpenAI

from core.config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _get_client()
    resp = await client.embeddings.create(model=settings.EMBEDDING_MODEL, input=texts)
    return [d.embedding for d in resp.data]


async def embed_text(text: str) -> list[float]:
    vectors = await embed_texts([text])
    return vectors[0]


SYSTEM_PROMPT = (
    "You are AskMyDocs, an assistant that answers questions strictly using the "
    "provided document excerpts. Cite sources inline as [#] matching the excerpt "
    "numbers. If the answer is not contained in the excerpts, say you don't know."
)


async def answer_with_context(question: str, contexts: list[str]) -> str:
    client = _get_client()
    joined = "\n\n".join(f"[{i + 1}] {c}" for i, c in enumerate(contexts))
    user_msg = f"Question: {question}\n\nExcerpts:\n{joined}"
    resp = await client.chat.completions.create(
        model=settings.CHAT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.2,
    )
    return resp.choices[0].message.content or ""
