"""
Alembic environment — async-aware, talks to our app's DB and models.

When you run `alembic upgrade head` (or any alembic command), Alembic loads
this file, calls run_migrations_online(), which connects to the DB using
our app's settings.DATABASE_URL and applies pending migrations.

`autogenerate` (alembic revision --autogenerate -m "...") also routes
through here — it diffs the current DB schema against `target_metadata`
and writes a migration file with the differences.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from pgvector.sqlalchemy import Vector  # noqa: F401  registers Vector type
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from core.config import settings
from core.database import Base
from models import Document, DocumentChunk, User  # noqa: F401  register tables on Base

config = context.config

# Inject our DB URL from app settings — single source of truth.
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Alembic compares this against the live DB to autogenerate migrations.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Render SQL to stdout without touching the DB. Rarely used."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
