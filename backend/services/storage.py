"""
Storage backend abstraction for uploaded files.

Two implementations selected via the STORAGE_BACKEND env var:
  - "local" (default): writes to a directory on disk (UPLOAD_DIR).
  - "s3": writes to an S3 bucket. Endpoint defaults to AWS;
          point AWS_ENDPOINT_URL at LocalStack for local development.

The backend stores a logical key like "<user_id>/<uuid>.pdf" — the
implementation resolves that to either a filesystem path or an S3 object.
This is what makes the app deployable to AWS without code changes.
"""

import asyncio
from abc import ABC, abstractmethod
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from core.config import settings


class StorageBackend(ABC):
    @abstractmethod
    async def save(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...


class LocalStorage(StorageBackend):
    """Filesystem backend — files under <root>/<key>."""

    def __init__(self, root: str) -> None:
        self.root = Path(root)

    async def save(self, key: str, data: bytes) -> None:
        await asyncio.to_thread(self._write, self.root / key, data)

    @staticmethod
    def _write(path: Path, data: bytes) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._unlink, self.root / key)

    @staticmethod
    def _unlink(path: Path) -> None:
        try:
            path.unlink()
        except FileNotFoundError:
            pass


class S3Storage(StorageBackend):
    """S3 backend — works with both AWS and LocalStack."""

    def __init__(
        self,
        bucket: str,
        endpoint_url: str | None = None,
        region: str = "us-east-1",
    ) -> None:
        self.bucket = bucket
        # LocalStack requires path-style addressing; AWS accepts it too.
        config = Config(s3={"addressing_style": "path"}) if endpoint_url else None
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            region_name=region,
            config=config,
        )
        # In dev (LocalStack), create the bucket if missing so the first
        # upload doesn't fail. In prod we expect IaC to have provisioned it,
        # and the IAM role wouldn't allow CreateBucket anyway.
        if endpoint_url:
            self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        try:
            self._client.create_bucket(Bucket=self.bucket)
        except ClientError as e:
            code = e.response["Error"]["Code"]
            if code not in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
                raise

    async def save(self, key: str, data: bytes) -> None:
        await asyncio.to_thread(
            self._client.put_object,
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType="application/pdf",
        )

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(
            self._client.delete_object,
            Bucket=self.bucket,
            Key=key,
        )


_instance: StorageBackend | None = None


def get_storage() -> StorageBackend:
    """Lazily build a singleton backend per process."""
    global _instance
    if _instance is None:
        if settings.STORAGE_BACKEND == "s3":
            _instance = S3Storage(
                bucket=settings.S3_BUCKET,
                endpoint_url=settings.AWS_ENDPOINT_URL or None,
                region=settings.AWS_REGION,
            )
        else:
            _instance = LocalStorage(root=settings.UPLOAD_DIR)
    return _instance


def reset_storage() -> None:
    """Test helper — drops the cached backend so settings can be re-read."""
    global _instance
    _instance = None
