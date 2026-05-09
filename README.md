# AskMyDocs

> Upload any PDF, ask questions, get AI-powered answers grounded in your own documents — with citations that show you where each answer came from.

A learning project built end-to-end to practice **Docker, AWS deployment, CI/CD pipelines, and AI integration (RAG)** with a real, polished application instead of a toy.

---

## Demo

A glassmorphic React UI on top of a FastAPI + pgvector backend, fully containerized.

- **Auth screen:** sliding Sign In / Sign Up tabs, floating-label inputs, confetti on registration.
- **Workspace:** sidebar with drag-and-drop PDF uploads + per-document scoping; chat-style Q&A with AI/user avatars, animated typing indicator, and expandable citations showing filename / page / similarity score.

> _Screenshots — TBD once deployed._

---

## What it does

1. **Sign up / sign in** with email + password (JWT-based auth).
2. **Drop a PDF** into the sidebar. The backend extracts text per page, splits it into chunks, embeds each chunk with OpenAI, and stores the vectors in PostgreSQL via the **pgvector** extension.
3. **Ask a question** in natural language. Your question is embedded too, and a **cosine-similarity vector search** retrieves the most relevant chunks. Those chunks are sent to GPT-4o-mini with the question, which produces a grounded answer.
4. **See citations** — every answer comes with the exact passages it was based on (filename, page, similarity %). No more "where did the AI get that?".
5. **Scope by document** — click a PDF in the sidebar to ask only about that one. Click again to search across all your uploads.

This pattern (search → augment → generate) is called **RAG (Retrieval-Augmented Generation)** — the standard architecture for "chat with your documents" products.

---

## Tech stack

| Layer | Tech |
|---|---|
| **Frontend** | React 18, Vite 5, TypeScript 5, Framer Motion, canvas-confetti |
| **Backend** | FastAPI (async), SQLAlchemy 2.x + asyncpg, Pydantic v2 |
| **Database** | PostgreSQL 16 + [pgvector](https://github.com/pgvector/pgvector) for embeddings |
| **AI** | OpenAI `text-embedding-3-small` (embeddings) + `gpt-4o-mini` (chat) |
| **Auth** | JWT (HS256) + bcrypt password hashing |
| **PDF parsing** | PyPDF2 with custom chunker (1000-char windows, 150-char overlap) |
| **Local dev** | Docker Compose — DB + backend + frontend, all hot-reloading |
| **Production target** | AWS (ECR + ECS Fargate + RDS Postgres + S3) — _planned_ |
| **CI/CD target** | GitHub Actions — _planned_ |

---

## Architecture

```
┌──────────────┐  HTTP/JSON   ┌──────────────────┐  asyncpg   ┌──────────────────┐
│  React (5173)│ ───────────▶ │  FastAPI (8000)  │ ─────────▶ │  Postgres (5432) │
│  Vite + TS   │              │  /api/v1/...     │            │  + pgvector ext. │
└──────────────┘              │                  │            └──────────────────┘
                              │  ┌────────────┐  │
                              │  │ ai_service │──┼──────────▶  OpenAI API
                              │  └────────────┘  │              (embeddings + chat)
                              └──────────────────┘
                                       │
                                       ▼
                              named volume: backend_uploads
                              (PDFs on disk, S3 in prod)
```

Each box is a Docker container in a single Compose network. Volumes:
- `pgdata` — persistent Postgres data
- `backend_uploads` — uploaded PDFs (will become S3 in production)

---

## Quick start

You need: **Docker Desktop** with WSL 2 backend, Git, and an **OpenAI API key**.

```bash
# 1. Clone
git clone https://github.com/Youness-Elfatouaky/askmydocs.git
cd askmydocs

# 2. Configure secrets (root .env is what Docker Compose reads)
cp .env.example .env          # Windows: copy .env.example .env
# Edit .env -> set OPENAI_API_KEY and a long random JWT_SECRET_KEY
# Generate one with:
#   python -c "import secrets; print(secrets.token_urlsafe(48))"

# 3. Build & start the whole stack
docker compose up --build -d

# 4. Open
# Frontend ........  http://localhost:5173
# API docs ........  http://localhost:8000/docs
# Health ..........  http://localhost:8000/health
```

First build takes ~3 minutes (downloading images, `pip install`, `npm install`). After that, code edits hot-reload — no rebuild needed.

### Useful commands

```bash
docker compose ps                 # see what's running
docker compose logs -f backend    # tail backend logs
docker compose logs -f frontend   # tail frontend logs
docker compose exec backend bash  # shell into a container
docker compose exec db psql -U postgres -d askmydocs   # inspect the DB
docker compose down               # stop everything (preserves data)
docker compose down -v            # stop AND wipe DB + uploads
```

### When to rebuild

| You changed... | Run |
|---|---|
| Python or React source | _nothing_ — hot reload picks it up |
| `Requirements.txt` | `docker compose rm -fsv backend && docker compose up -d --build backend` |
| `package.json` | `docker compose rm -fsv frontend && docker compose up -d --build frontend` |
| `Dockerfile` (either) | rebuild that service |
| `docker-compose.yml` or `.env` | `docker compose up -d` (no rebuild needed) |

---

## API reference

All endpoints are under `/api/v1`. Interactive docs at http://localhost:8000/docs.

### Auth
- `POST /auth/register` — JSON `{ email, password, full_name? }` → user
- `POST /auth/login` — `application/x-www-form-urlencoded` `username=<email>&password=...` → `{ access_token }`
- `GET /auth/me` — current user (requires `Authorization: Bearer <token>`)

### Documents
- `POST /documents` — multipart upload (field `file`) → indexed document
- `GET /documents` — list your documents
- `DELETE /documents/{id}` — delete a document and all its chunks
- `POST /documents/ask` — JSON `{ question, document_id?, top_k? }` → `{ answer, citations[] }`

---

## Project layout

```
askmydocs/
├── backend/                 FastAPI app (flat layout, no app/ wrapper)
│   ├── main.py              entrypoint + lifespan init_db()
│   ├── core/                config, async DB engine, security (JWT/bcrypt)
│   ├── models/              SQLAlchemy: User, Document, DocumentChunk(vector)
│   ├── schemas/             Pydantic request/response models
│   ├── routers/             auth, documents
│   ├── services/            auth_service, document_service, ai_service
│   ├── utils/pdf.py         PDF page extraction + chunking
│   ├── Dockerfile
│   └── Requirements.txt
│
├── frontend/                Vite + React + TypeScript
│   ├── src/
│   │   ├── App.tsx          auth ↔ dashboard router
│   │   ├── components/      AuthCard, Sidebar, Chat, Message, Avatar, ...
│   │   ├── lib/             api client, auth (localStorage), types
│   │   └── index.css        all styles + design tokens
│   ├── Dockerfile           multi-stage: dev (Vite) | build | prod (Nginx)
│   ├── nginx.conf           used by the prod stage
│   └── package.json
│
├── docker-compose.yml       db + backend + frontend
├── .env.example             template for secrets
├── CLAUDE.md                full project context, decisions, changelog
└── README.md                you are here
```

---

## Design decisions worth knowing

- **Flat backend layout, no `app/` wrapper** — top-level imports (`from core.config import settings`).
- **Schema bootstrap via `init_db()` in lifespan**, not Alembic. Creates the `vector` extension and tables on startup. Fine for early dev; will switch to Alembic before production.
- **Async everywhere** — `create_async_engine`, `AsyncSession`, async route handlers.
- **`bcrypt` directly, not `passlib`** — passlib is incompatible with bcrypt 5.x; replaced with a thin wrapper in `core/security.py` that handles the 72-byte input limit.
- **OAuth2 password flow for `/login`** — accepts form-data so Swagger's Authorize button works natively.
- **12-factor env strategy (Option A)** — root `.env` is the single source of truth; Compose injects values as container env vars; Pydantic Settings reads only process env (no in-container `.env` file).
- **Named volume for uploads** — `backend_uploads:/app/uploads`. Forces the cloud-storage mindset; will become S3 in production.
- **Anonymous `node_modules` volume** in compose — prevents the host bind mount (which has no `node_modules`) from shadowing the container's installed packages.
- **HMR polling enabled in `vite.config.ts`** — file-system events don't reliably propagate from a Windows host into a Linux container.

The full design log lives in [CLAUDE.md](./CLAUDE.md), including a dated changelog and a deferred-improvements section.

---

## Roadmap

- [x] Backend scaffold: FastAPI + async SQLAlchemy + pgvector + JWT auth + PDF RAG pipeline
- [x] Backend Dockerfile + `docker-compose.yml`
- [x] Frontend: Vite + React + TypeScript scaffold
- [x] Frontend Dockerfile (multi-stage: dev | build | prod via Nginx)
- [x] Auth UI (login, register, JWT in localStorage)
- [x] MVP workspace: sidebar (uploads, doc list, scope, profile/logout) + chat (citations, scoping, suggestions)
- [ ] **GitHub Actions CI** — lint + build both services on PR; build & push images on `main`
- [ ] **AWS deploy** — ECR + ECS Fargate (or App Runner), RDS Postgres, S3 for uploads
- [ ] Replace local-disk uploads with S3
- [ ] Alembic migrations (replace `init_db()` `create_all`)
- [ ] Background indexing (embedding currently runs synchronously in the upload request)
- [ ] RAG quality pass — smarter chunking, score-based filtering, hybrid search

---

## Learning goals (the actual reason this exists)

This project is a sandbox for the things I want to get hands-on with:

1. **Docker & containerization** — multi-service Compose, multi-stage builds, named/anonymous volumes, healthchecks, hot reload.
2. **Cloud deployment** — push images to ECR, run on ECS Fargate (or App Runner), provision RDS + S3, wire it all together.
3. **CI/CD** — GitHub Actions for lint/test/build/push, environment-gated deployments.
4. **AI integration** — embeddings, vector search, RAG, prompt engineering, cost awareness.

If you're learning the same things and want to follow along, the per-feature commits and the changelog in [CLAUDE.md](./CLAUDE.md) tell the full story.

---

## License

MIT — do whatever you want, no warranty.
