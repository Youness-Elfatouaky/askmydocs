# AskMyDocs — Project Context

Upload any document, ask questions, get AI-powered answers. Built primarily as a learning project for **Docker, AWS deployment, CI/CD, and AI integration**.

## Stack

- **Backend:** FastAPI (async), SQLAlchemy 2.x + asyncpg, PostgreSQL 16 + pgvector
- **Frontend:** React (Vite) — not yet implemented
- **AI:** OpenAI embeddings (`text-embedding-3-small`) + chat (`gpt-4o-mini`) for RAG
- **Infra goal:** Docker Compose locally → AWS deployment → GitHub Actions CI/CD

## Repository layout

```
askmydocs/
├── backend/                 FastAPI app (flat layout, no app/ wrapper)
│   ├── main.py              FastAPI entrypoint + lifespan init_db
│   ├── core/                config, database, security (JWT/bcrypt)
│   ├── models/              SQLAlchemy: User, Document, DocumentChunk(vector)
│   ├── schemas/             Pydantic request/response models
│   ├── routers/             auth, documents
│   ├── services/            auth_service, document_service, ai_service
│   ├── utils/pdf.py         PDF page extraction + chunking
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── .env.example
│   └── Requirements.txt
├── frontend/                React + Vite + TS app
│   ├── src/                 main.tsx, App.tsx, index.css
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts       polling enabled for HMR over Docker bind mount
│   ├── tsconfig.json
│   ├── nginx.conf           used by the prod stage of the Dockerfile
│   ├── Dockerfile           multi-stage: dev (vite) | build | prod (nginx)
│   ├── .dockerignore
│   └── .env.example
├── docker-compose.yml       db + backend + frontend, all hot-reloading
├── .env.example             root env for compose (OPENAI_API_KEY, JWT_SECRET_KEY)
├── .gitignore
└── CLAUDE.md                this file
```

## Conventions / decisions made

- **Flat backend layout** (no `app/` wrapper) — follows the directories that already existed. Imports are top-level: `from core.config import settings`, `from models import User`.
- **Async everywhere** — `create_async_engine`, `AsyncSession`, async route handlers.
- **Schema bootstrap via `init_db()` in lifespan**, not Alembic. Creates `vector` extension + tables on app startup. Switch to Alembic once schema starts changing in production.
- **pgvector** for embeddings (`Vector(1536)`), cosine distance for retrieval (`embedding.cosine_distance`).
- **Auth:** JWT (HS256), bcrypt-hashed passwords, OAuth2PasswordBearer for token extraction.
- **PDF ingestion:** PyPDF2 → page text → fixed-size chunks (1000 chars / 150 overlap) → OpenAI embeddings → pgvector rows. Stored on disk under `uploads/<user_id>/`.
- **API prefix:** `/api/v1`.

## Local dev (Docker-based)

```powershell
# one-time
copy .env.example .env       # add your OPENAI_API_KEY + JWT_SECRET_KEY

# start everything
docker compose up --build

# tail logs
docker compose logs -f backend

# stop
docker compose down          # add -v to wipe the db volume
```

Backend hot-reloads via the `./backend:/app` bind mount + `uvicorn --reload`.
DB: `postgres / postgres @ localhost:5432 / askmydocs`. Inside the compose network the host is `db`.

## Endpoints

- `POST /api/v1/auth/register` · `POST /api/v1/auth/login` · `GET /api/v1/auth/me`
- `POST /api/v1/documents` (multipart PDF upload) · `GET /api/v1/documents` · `DELETE /api/v1/documents/{id}`
- `POST /api/v1/documents/ask` — RAG query, returns answer + citations
- `GET /` · `GET /health`

## Roadmap (learning goals)

- [x] Frontend: React + Vite + TS scaffolded with health-check page (auth/upload/chat UIs TBD)
- [x] Frontend Dockerfile + add to compose with nginx (multi-stage: dev/build/prod)
- [ ] Alembic migrations (replace `init_db()` `create_all`)
- [x] GitHub Actions CI: ruff lint + import smoke (backend), tsc + vite build (frontend) — image build & push to ECR is a follow-up
- [ ] CI follow-ups (do once green): enable branch protection on `main` requiring CI to pass; add a 3rd `docker build` job to validate Dockerfiles; add `pytest` (backend) + `vitest` (frontend) starter tests and wire them into CI; add CI status badge to top of README
- [ ] AWS deploy: ECR + ECS Fargate (or App Runner), RDS Postgres, S3 for uploads
- [ ] Replace local disk uploads with S3
- [ ] Background indexing (embedding is currently sync in the upload request)

## RAG quality improvements (deferred, revisit after AWS deploy)

Observed during 2026-05-09 testing with a 2-page CV (chunks 0-6). Current pipeline works end-to-end but retrieval quality has clear room to grow.

**Findings:**
- Similarity scores hover 0.17–0.41 (normal range for `text-embedding-3-small`, not a bug — the model produces diffuse vectors).
- **Semantic ambiguity hurts top-k=3 retrieval:** the question "What programming languages does the candidate know?" returned the LANGUAGES section (Arabic/French/English) and PROJECTS instead of the actual SKILLS chunk. The LLM filled gaps from prior knowledge → mild hallucination ("JavaScript ES6+" was inferred, not in the CV).
- **Crude character-based chunking** cuts mid-word: snippets like `"ipt, Tailwind CSS"`, `"ango – University"`, `"ng 15,000+ clients"`. Hurts both embedding quality and citation readability.
- `top_k=10` summaries are noticeably better — covered both pages, no hallucinations. Default `top_k=5` is borderline.

**Improvements to make later (priority order):**
1. **Recursive text splitter** — split on `\n\n`, then sentences, then chars. Prefer `langchain-text-splitters` `RecursiveCharacterTextSplitter` or hand-rolled. Eliminates mid-word cuts. (1-2 hours)
2. **Bump default `TOP_K` from 5 → 6 or 7** — reduces hallucination risk, cost is negligible. (30 sec)
3. **Min-score filter** — drop chunks with `score < 0.15` before sending to LLM in `services/document_service.py::ask()`. Cleaner context. (15 min)
4. **Hybrid retrieval** — vector search + BM25 keyword search, then re-rank top results. Catches exact terms like "FastAPI" that embedding search can miss. (~half day; needs a BM25 lib like `rank-bm25`)
5. **Upgrade to `text-embedding-3-large`** (~9× cost, ~$0.13/1M) — tighter vectors, better discrimination. Worth it once we have real users; flip via `EMBEDDING_MODEL` env var. Note: also requires `EMBEDDING_DIM=3072` and a DB migration to widen the `vector` column.

**Why deferred:** the user's learning goals are Docker / AWS / CI-CD / AI *integration*, not RAG quality engineering. Backend works; better to ship the frontend + AWS pipeline first, then revisit retrieval quality with real usage data.

## Changelog

Append a dated entry whenever the project changes meaningfully. Newest first.

### 2026-05-09
- Initial backend scaffold: FastAPI + async SQLAlchemy + pgvector + JWT auth + PDF RAG pipeline.
- Added `docker-compose.yml` (pgvector/pg16 + backend with hot reload), `backend/.dockerignore`, root `.env.example` and `.gitignore`.
- Created this `CLAUDE.md` as the persistent project context.
- **Auth fix:** dropped `passlib` (incompatible with `bcrypt` 5.x), now using `bcrypt` directly in `core/security.py` with explicit 72-byte truncation.
- **Auth UX fix:** `/api/v1/auth/login` now consumes `OAuth2PasswordRequestForm` (form-data with `username`/`password`) so Swagger's Authorize button works natively. The `username` field holds the email.
- **Env strategy → Option A (12-factor):** root `.env` is the single source of truth for compose substitution. Removed `backend/.env` and dropped `env_file` from `Settings` so the container reads only process env vars.
- **Env hygiene:** deleted `backend/.env.example` (no longer loaded under Option A). Root `.env.example` is now the comprehensive template — secrets required, tunable knobs commented out with defaults shown. Principle: `.env` only contains values that differ from `backend/core/config.py` defaults.
- **Frontend scaffold:** added `frontend/` — Vite + React 18 + TypeScript. Single page that fetches `/health` from the backend to prove the wire end-to-end. Auth/upload/chat UIs are next.
- **Frontend Dockerfile:** multi-stage with `dev` (Vite dev server with HMR), `build` (runs `vite build`), and `prod` (Nginx serving `dist/`). Compose uses the `dev` target locally.
- **Compose:** added `frontend` service on port 5173. Anonymous volume on `/app/node_modules` prevents the host bind mount (no node_modules on host) from shadowing the container's installed packages. `VITE_API_URL` injected via root `.env` (defaults to `http://localhost:8000`).
- **Vite HMR over Docker bind mount:** enabled `usePolling: true` in `vite.config.ts` because file-system events don't reliably propagate from the Windows host to the Linux container.
- **Auth UI shipped:** glassmorphic auth card with animated mesh-gradient background, sliding tab indicator (Sign In / Sign Up), floating-label inputs with show/hide password toggle, gradient submit button, shake-on-error, and confetti burst on successful registration. `localStorage`-backed JWT, auto-login after register, `/auth/me` bootstrap on app load. Logout clears token. Layout: `frontend/src/{lib,components}/`. Deps added: `framer-motion`, `canvas-confetti`. Honors `prefers-reduced-motion`.
- **MVP shipped — sidebar workspace:** dashboard now a 2-column `Sidebar` + `Chat` layout. Sidebar shows brand, drag-drop / click PDF upload (`UploadButton`), document list (`DocumentList`) with active-scope toggle and delete, and a footer profile card with avatar + sign-out. Chat is full-height with header showing scope state, scrollable message list with user/AI avatars, animated typing indicator while waiting, expandable citations per AI response showing filename / page / similarity %, and an auto-resizing textarea input (Enter sends, Shift+Enter newline). Empty-state shows a pulsing gradient orb and seed suggestions.
- **Background upgrade:** added 8 floating SVG paper icons drifting/rotating + 24 twinkling sparkles + radial vignette over the existing gradient blobs. All decorative; `aria-hidden`. Hidden under `prefers-reduced-motion`.
- **CI shipped:** `.github/workflows/ci.yml` runs two parallel jobs on push/PR to `main`. Backend job: pip cache → install Requirements.txt + ruff → `ruff check .` → smoke-import `main` with dummy env vars. Frontend job: npm cache → `npm ci` → `tsc --noEmit` → `npm run build`. `package-lock.json` is now committed (was gitignored) so `npm ci` works. Backend lint config in `backend/pyproject.toml` (ruff: E, W, F, I, UP, B with `__init__.py` F401 ignored).
- **CI lint cleanup:** first CI run flagged 7 ruff errors; fixed in two follow-up commits. Notable changes: `typing.AsyncGenerator` → `collections.abc.AsyncGenerator` (UP035), `datetime.timezone.utc` → `datetime.UTC` (UP017), `raise X` inside `except` → `raise X from e` (B904), explicit `strict=False` on `zip()` (B905), and isort grouping (stdlib → blank → third-party → blank → local). All green now.
- **Path 1 — solidify CI (in progress):**
  - **CI badge** added to top of `README.md` (live SVG from `actions/workflows/ci.yml/badge.svg`).
  - **`docker` job** added to `ci.yml`: builds backend + frontend (prod stage) images via `docker/build-push-action@v6` with GHA layer cache (`type=gha`, scoped per service). `push: false` — pure validation. Catches Dockerfile / dep-list breaks.
  - **Backend tests scaffolded** in `backend/tests/` using `pytest` + `pytest-asyncio` + `httpx.ASGITransport`. `conftest.py` sets dummy env vars before app import and stubs `init_db()` so tests never touch a real DB. Two smoke tests cover `/health` and `/`. CI installs `pytest pytest-asyncio` and runs `pytest -v`. `[tool.pytest.ini_options]` block in `pyproject.toml` sets `asyncio_mode = "auto"` and `testpaths = ["tests"]`.
  - **Frontend tests scaffolded** with `vitest` + `@testing-library/react` + `jsdom`. `vite.config.ts` adds the `test:` block; `src/test/setup.ts` imports `@testing-library/jest-dom/vitest` for nicer matchers. Sample test in `src/components/Avatar.test.tsx`. `tsconfig.json` adds `vitest/globals` to `types`. CI runs `npm test` in the frontend job.
  - **Branch protection** on `main` is the user-action follow-up (GitHub Settings → Branches).
