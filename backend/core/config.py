from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    PROJECT_NAME: str = "AskMyDocs"
    API_V1_PREFIX: str = "/api/v1"

    DATABASE_URL: str = Field(
        default="postgresql+asyncpg://postgres:postgres@localhost:5432/askmydocs"
    )

    JWT_SECRET_KEY: str = Field(default="change-me-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    OPENAI_API_KEY: str = Field(default="")
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    EMBEDDING_DIM: int = 1536
    CHAT_MODEL: str = "gpt-4o-mini"

    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_MB: int = 25
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 150
    TOP_K: int = 5

    # Storage backend: "local" (default, filesystem) or "s3" (LocalStack/AWS).
    # When "s3", set AWS_ENDPOINT_URL=http://localstack:4566 for LocalStack
    # or leave it empty to talk to real AWS (boto3 will pick the IAM role).
    STORAGE_BACKEND: str = "local"
    S3_BUCKET: str = "askmydocs-uploads"
    AWS_REGION: str = "us-east-1"
    AWS_ENDPOINT_URL: str = ""

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # 12-factor: read only from process env vars, no .env file inside the container.
    # Compose injects values from the root .env at container start.
    model_config = {"case_sensitive": True}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
