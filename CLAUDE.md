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
│   ├── mcp_server/          MCP (stdio) server: list_documents/search_documents/ask_document
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
- [x] Alembic migrations (async-aware env.py; initial migration creates `vector` extension + 3 tables; backend's compose `command:` runs `alembic upgrade head` before uvicorn so the schema is always in sync)
- [x] GitHub Actions CI: ruff lint + import smoke (backend), tsc + vite build (frontend) — image build & push to ECR is a follow-up
- [x] CI follow-ups: branch protection on `main` (rulesets, requires CI), `docker build` job, `pytest` + `vitest` starters, CI status badge — **Path 1 complete**
- [x] S3 storage backend + Alembic migrations — **Path 2 complete**
- [ ] **Path 3 — AWS deploy** (see the Path 3 section below): OIDC → ECR, ECS Fargate + ALB, RDS, S3, CD workflow
- [ ] **Path 4 — AI assistant optimization** (see the Path 4 section below): eval set, trace, resilience, chunking, memory
- [ ] Background indexing (embedding is currently sync in the upload request)

## Path 2 — Step 1: S3 storage backend (shipped on `feat/s3-storage-backend`)

**Goal:** make uploads work in any container environment, including ephemeral ECS Fargate tasks where local disk dies with the container.

**Pattern:** `services/storage.py` defines an abstract `StorageBackend` (`save`, `delete` as async methods). Two implementations:
- `LocalStorage(root)` — `await asyncio.to_thread(path.write_bytes, data)` under `<root>/<key>` (default).
- `S3Storage(bucket, endpoint_url=None, region)` — boto3 client wrapped in `asyncio.to_thread`. Uses path-style addressing when `endpoint_url` is set (LocalStack quirk). When `endpoint_url` is set, calls `create_bucket` on init and swallows `BucketAlreadyOwnedByYou`/`BucketAlreadyExists` so dev "just works"; in prod (no endpoint_url) we expect IaC to have provisioned the bucket.

`get_storage()` is a singleton selector based on `STORAGE_BACKEND` env (`local` default, `s3` opt-in). `reset_storage()` is a test helper.

`document_service.save_and_index()` and `delete_document()` now go through the abstraction. **Key change:** `documents.storage_path` now stores a *logical key* (`<user_id>/<uuid>.pdf`) rather than an absolute filesystem path — the backend resolves it. Old rows pointing at absolute paths will silently fail to delete the file (the DB row still goes); since we wipe with `down -v` regularly this is acceptable for now.

**LocalStack** added as a 4th compose service (`localstack/localstack:3.8`, only `s3` enabled) on port 4566 with healthcheck. Backend env wired with `STORAGE_BACKEND`, `S3_BUCKET`, `AWS_REGION`, `AWS_ENDPOINT_URL`, plus `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` (LocalStack accepts any value; in prod ECS task IAM role replaces these).

**Deps:** `boto3==1.35.74` + `botocore==1.35.74` added to `Requirements.txt`.

**Try the S3 path locally:** add to `.env`:
```
STORAGE_BACKEND=s3
AWS_ENDPOINT_URL=http://localstack:4566
```
Then `docker compose up -d --build backend localstack` and upload a PDF — bytes land in the LocalStack S3 bucket instead of the host volume. Verify with: `docker compose exec localstack awslocal s3 ls s3://askmydocs-uploads --recursive`.

**Two pre-existing bugs caught while testing the S3 path** (unrelated to storage — would have hit eventually with real users):
1. **Postgres rejects `\x00` in TEXT columns.** PyPDF2 sometimes leaves NULL bytes from broken ligatures (`Certi\x00cation`). Fixed in `utils/pdf.py::extract_pages` with `text.replace("\x00", "")` after extraction.
2. **`PendingRollbackError` on the failure path of `save_and_index`.** When the chunks insert errored, the existing handler tried to `commit()` a `status="failed"` update on a transaction that was already in error state — chained 500. Fixed: `await db.rollback()` first, then best-effort delete of the storage object **and** the doc row so failed uploads leave nothing behind.

## Path 2 — Step 2: Alembic migrations (shipped on `feat/alembic-migrations`)

**Goal:** stop relying on `Base.metadata.create_all` so the schema can evolve in production without dropping data.

**What landed:**
- `backend/alembic.ini` — config; `script_location = alembic`; filename template includes the date.
- `backend/alembic/env.py` — async-aware bootstrap. Pulls `DATABASE_URL` from our `Settings` (single source of truth). Imports `pgvector.sqlalchemy.Vector` so autogenerate knows about it. Explicit `from models import User, Document, DocumentChunk` registers tables on `Base.metadata`.
- `backend/alembic/script.py.mako` — modernized template (uses `collections.abc.Sequence`, `str | None`) so future autogenerated migrations are lint-clean.
- `backend/alembic/versions/2026_05_10_c665f208c083_initial_schema.py` — first migration. Manually patched after autogen to add `from pgvector.sqlalchemy import Vector` import + `op.execute("CREATE EXTENSION IF NOT EXISTS vector")` (autogen detects neither).
- `core/database.py` — deleted `init_db()`. Schema is Alembic's job now.
- `main.py` — dropped the `lifespan` (no startup DB work needed).
- `docker-compose.yml` — backend command is now `sh -c "alembic upgrade head && uvicorn ..."`. Every container start brings the schema up to date.
- `backend/tests/conftest.py` — removed the `init_db` monkey-patch (no longer needed).

**The everyday workflow for schema changes:**
1. Edit a SQLAlchemy model in `backend/models/`.
2. `docker compose run --rm --no-deps backend alembic revision --autogenerate -m "<short description>"`
3. **Read the generated file in `backend/alembic/versions/`.** Always. Autogen misses: extension creation, column renames (sees as drop+add), data backfills, custom-type imports.
4. `docker compose restart backend` → compose runs `alembic upgrade head` automatically.
5. Verify with `docker compose exec backend alembic current` and `docker compose exec db psql -U postgres -d askmydocs -c "\d <table>"`.
6. Commit the migration file + the model change.

**Useful alembic subcommands:**
- `alembic current` — what version is the DB at?
- `alembic history` — list all migrations
- `alembic upgrade head` — apply all pending
- `alembic downgrade -1` — undo the latest
- `alembic revision -m "..."` — empty migration (when you want to write SQL by hand)

**Production note:** for AWS, run migrations as a **one-off task before deploying new app code**, not in every container's startup command. Otherwise N containers race to apply the same migration. The compose `sh -c "alembic upgrade head && uvicorn ..."` pattern is local-dev convenience; the deploy story will use a separate ECS one-off task.

**CI gotchas hit and fixed (worth remembering):**
- ruff hates autogenerated migration files (`Union[]`, `typing.Sequence`, trailing whitespace from the `Revises:` template). **Solution:** `extend-exclude = ["alembic/versions"]` in `pyproject.toml` — autogen output is "data", not hand-written code; lint the hand-written `env.py` + `script.py.mako` only.
- ruff auto-detected the third-party `alembic` library as **first-party** because `backend/alembic/` exists as a directory. **Solution:** explicitly `known-third-party = ["alembic"]` in `[tool.ruff.lint.isort]`. Same fix applies whenever a folder name shadows a pip package.
- `pgvector.Vector` autogen produces `pgvector.sqlalchemy.vector.VECTOR(dim=1536)` without adding `import pgvector` to the migration file — `NameError` at upgrade time. **Solution:** edit the generated file to use `from pgvector.sqlalchemy import Vector` + `Vector(1536)`. Always do this after autogen.
- When debugging a mysterious ruff error, **`ruff check <file> --diff` shows you exactly what ruff wants to change** — beats guessing.

## Stage 0 — Small cleanups (queued, not started)

Cheap items found during the 2026-08-21 planning review. None are blocking; do them
whenever there's a spare 30 minutes.

- [x] README roadmap sync — S3 + branch protection were shipped but still showed unchecked.
- [ ] **`backend` doesn't wait for `localstack` in compose.** `depends_on` only lists
  `db: service_healthy`. LocalStack *has* a healthcheck; nothing waits on it. With
  `STORAGE_BACKEND=s3`, a cold `docker compose up` can run `S3Storage.__init__` →
  `create_bucket` before LocalStack is listening, and the backend dies on boot. A race you
  win most of the time, which is the worst kind. Fix: add
  `localstack: { condition: service_healthy }` to the backend's `depends_on`.
  Branch: `fix/compose-localstack-dependency` (keep separate from doc changes).
- [ ] `.env.example` — promote the S3 block out of the commented "optional" section. It's the
  path actually in use locally and the one prod will use; burying it as an exotic opt-in
  misrepresents the project's real state.
- [ ] Two cheap RAG wins, folded into Path 4a: `TOP_K` 5 → 7, and a `score < 0.15` filter.

**Checked and fine — don't re-investigate:** `backend/venv/` is correctly ignored by git
(0 tracked files, `.gitignore:7`) and excluded from the Docker context (`.dockerignore:1`).
Upload validation exists (content-type + size) in `document_service.py:16-23` — it lives in
the service layer, not the router.

---

## Stage 1 — Pre-flight (do before touching AWS)

Each of these will bite *during* the deploy if skipped.

- [ ] **RDS SSL support.** asyncpg against RDS requires TLS; `core/database.py` passes no
  `connect_args`. Drive it off an env flag so compose stays plaintext and prod requires TLS.
  Skipping this = a deploy that fails at the first DB connection with a confusing error.
- [ ] **Rate-limit `/documents/ask` and the upload endpoint.** There is none today, so a public
  URL is an uncapped spend gate on the OpenAI key. **Do not deploy publicly without this.**
  Must be Redis/DB-backed, *not* an in-process dict — ECS runs N tasks, and an in-memory
  limiter silently allows N times the intended rate.
- [ ] **AWS budget alarm — do this first, before creating any resource.** A $5–10 budget with
  an email alert. Costs nothing; prevents the classic learning-project surprise bill.

---

## Path 3 — AWS deploy

The main event, and the reason this project exists. One PR per step.

| # | Step | What it teaches | Est. |
|---|---|---|---|
| 1 | **GitHub OIDC → IAM role.** Identity provider + deploy role, trust scoped to the repo's `main` ref | Keyless CI auth — the modern replacement for stored AWS keys | half day |
| 2 | **ECR + push.** Two repos; extend CI to push `sha` + `latest` on `main`; keep PR builds `push: false` | Registries, image tagging, layer cache reuse | half day |
| 3 | **RDS Postgres 16.** `db.t4g.micro`, SG locked to the ECS SG. Confirm `CREATE EXTENSION vector` works — migration 1 already does it | Managed DB, subnet groups, SG chaining | half day |
| 4 | **S3 bucket + task IAM role.** Block public access; scoped `Get/Put/DeleteObject`. **Zero code changes** — flip `STORAGE_BACKEND=s3`, blank `AWS_ENDPOINT_URL` | The payoff for Path 2 Step 1 | 2 h |
| 5 | **Secrets in SSM Parameter Store.** `OPENAI_API_KEY`, `JWT_SECRET_KEY`, `DATABASE_URL` as SecureString, wired via the task def `secrets:` block | Execution role vs. task role; KMS decrypt perms | 2 h |
| 6 | **ECS Fargate + ALB.** Cluster, backend task def, ALB health check on `/health`, CloudWatch log group, **plus a separate migration task def** with command override `alembic upgrade head` | The core deploy skill | 1–2 days |
| 7 | **Frontend hosting — S3 + CloudFront.** Gotcha: Vite bakes `VITE_API_URL` at *build* time, so the ALB URL must be known before the bundle is built. Update `CORS_ORIGINS` to match | CDN, static hosting, build-time vs. runtime config | half day |
| 8 | **CD workflow.** `deploy.yml`: build → push → **run migration task → wait** → `update-service --force-new-deployment` → `wait services-stable` | Ordered deploys; why migrations must not race | half day |
| 9 | *(optional)* **Route53 + ACM** — real domain, HTTPS | DNS, cert management | half day |

**The one thing not to get wrong:** step 6's migration task must be separate from the service.
Leaving `alembic upgrade head &&` in the container command means N tasks race the same
migration on every scale-out. The compose `sh -c "alembic upgrade head && uvicorn ..."` is
local-dev convenience only.

**Definition of done:** push to `main` → CI green → images to ECR → migration task runs →
ECS rolls out → live URL answers a question about an uploaded PDF, with no manual step.

---

## Path 4 — AI assistant optimization

Sourced from `Projects/balihani/05-ai-assistant.md` — a production French RAG assistant in
another of this user's projects (its `SKILL.md` indexes the rest of that doc set). Its `ask()`
pipeline (§4), logging (§8) and resilience (§10) sections solve problems askmydocs currently
has. Read that file before starting this path.

### What ports from balihani, and what does not

| balihani pattern | askmydocs today | Verdict |
|---|---|---|
| Server-owned conversation, last 4 turns (§3) | **No history at all** — every question is standalone | Port |
| Retrieval trace per turn: `top_score`, `retrieved` (§8) | Nothing logged | Port — this is what makes a bad prod answer debuggable |
| Graceful degradation → fallback text, `no_answer: true`, never a 500 (§10) | Unguarded `AsyncOpenAI` call → an OpenAI blip is a 500 | Port |
| Wide retrieval `max(k*4, 20)`, then filter to top-k (§4.6) | Hard `LIMIT top_k`, no filter | Port |
| `MIN_SIMILARITY` floor (§9) | None | Port the idea, **not the value** — see trap 1 |
| Refusal detection → `no_answer` flag (§4.9) | No flag; the UI can't tell "don't know" from an answer | Port |
| Pure vs I/O module split, unit-tested without DB/network (§1, §10) | Logic mixed into `document_service` | Port — it's what makes an eval set possible |
| `eval_questions.md` mini eval set (§10) | None | Port. **You cannot optimize what you don't measure** |
| Background reindex: 202 + `asyncio.create_task` + strong ref + status poll (§7) | Sync embedding in the request | Port — this *is* the background-indexing roadmap item, already designed |
| In-memory numpy `KBIndex` (§11) | pgvector | **Don't port** — pgvector is strictly better |
| Darija gate, error codes, variant disambiguation, service cards | — | **Don't port** — balihani business logic |

**Two traps when copying:**

1. **`MIN_SIMILARITY=0.30` would break askmydocs.** balihani's KB is curated, so its scores run
   high. Measured askmydocs scores on a real CV were **0.17–0.41** — a 0.30 floor discards most
   valid context. Start at **0.15** and tune against the eval set.
2. **balihani's in-process state assumes `--workers 1`** (§11 names this as a known sharp edge).
   Its rate-limit buckets and index live in memory. ECS runs N tasks — anything in-process is
   wrong here. Same warning as Stage 1's rate limiter.

### Path 4a — Measure & harden (before AWS, alongside Stage 1)

| # | Step | Why now | Est. |
|---|---|---|---|
| A1 | **Eval set** — `backend/tests/eval_questions.md`, ~20 Q&A pairs over 2–3 fixture PDFs + a runner scoring retrieval hit-rate and answer correctness | Baseline first; every later change is guesswork without it. **A1 gates the whole path** | half day |
| A2 | **Extract pure modules** — `retrieval.py` (scoring/filtering) and `prompt.py` (message building) out of `document_service` | Makes A1 testable with no DB and no OpenAI | 3 h |
| A3 | **Graceful degradation** — wrap the OpenAI calls; return fallback text + `no_answer: true` | An OpenAI outage becoming a 500 is the worst way to learn this | 1 h |
| A4 | **Retrieval trace logging** — persist `top_score` + retrieved chunk ids per turn | Without it, "the answer was bad" is unfixable in prod | half day |
| A5 | **Min-score filter (0.15) + wide-then-narrow retrieval + `TOP_K` 5 → 7** | Cheap, and measurable against A1 | 1 h |
| A6 | **Conversation memory** — server-owned, keyed to user (+ document scope), last 4 turns, `DELETE` to reset | **Moved up from 4b:** it changes the `/ask` contract *and* the chat UI, so it is much cheaper before the deploy than as a redeploy after. The frontend chat already *looks* like it has memory; it doesn't | 1 day |

### Path 4b — Quality (after AWS, or as a break from infra)

| # | Step | Est. |
|---|---|---|
| A7 | **Recursive text splitter** — kills mid-word cuts (`"ipt, Tailwind CSS"`). Biggest single quality win. Measured findings are in the RAG-quality section below | half day |
| A8 | **Surface `no_answer` in the UI** — distinct styling when the docs don't cover it, instead of a confident-looking non-answer | 2 h |
| A9 | **Reranking or hybrid BM25** — only once A1 proves it's needed | 1 day |
| A10 | **`text-embedding-3-large`** — needs `EMBEDDING_DIM=3072` + a migration widening the vector column. A genuinely good real-world Alembic exercise | half day |

**Ordering rule:** run the A1 eval before *and* after each subsequent step. That is the
difference between optimizing and merely changing things.

---

## Overall sequence

```
Stage 0   cleanups                              ~30 min
Stage 1   pre-flight: RDS SSL, rate limit, budget alarm
Path 4a   A1-A6  measure & harden               ~3 days
Path 3    AWS deploy, steps 1-9                 ~1.5 weeks
Path 4b   A7-A10 quality                        ~2 days
          background indexing (balihani §7 pattern), observability
```

Roughly **3 focused weeks** to a deployed, CI/CD'd, measurably-optimized app.

## RAG quality improvements (measured findings — now scheduled as Path 4)

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

### 2026-11-18
- **MCP server shipped** (`backend/mcp_server/`) — exposes the existing RAG pipeline to
  Claude Desktop / Claude Code over stdio using the official Python SDK's `FastMCP`
  (`mcp==1.30.0`, pinned pre-2.0 since `mcp` 2.x renamed `FastMCP` to `MCPServer`).
  Three read-only tools: `list_documents`, `search_documents(query, top_k=5)`,
  `ask_document(question, document_id?)`. No duplicated logic — the tools call straight
  into `services/document_service.py` (`list_documents`, `search_chunks`, `ask`) and
  `services/ai_service.py` (`embed_text`), the same functions the HTTP routers use.
- **No per-request auth, so a new setting: `MCP_USER_EMAIL`.** MCP tool calls carry no
  bearer token the way HTTP requests do, but `documents.owner_id` scopes every query to a
  user. Rather than exposing every account's documents, the server resolves one configured
  account at call time (`_get_mcp_user` in `mcp_server/server.py`) and raises a clear
  `RuntimeError` if it's unset or doesn't match a real user — surfaced as a tool error to
  the MCP client, not a server crash.
- **Tests** in `backend/tests/test_mcp_server.py` mock `document_service`/`ai_service`
  and the DB session; no real Postgres or OpenAI call. Picked up automatically by the
  existing `pytest -v` step in CI's backend job — no workflow change needed there.
- **Docker:** `backend/mcp_server/Dockerfile`, built from the `backend/` context (same
  pattern as the main backend image) so it can import `core`/`models`/`services`/`utils`
  without duplication. Added as a `docker-compose.yml` service gated behind the `mcp`
  profile — stdio needs a client attached to it, not a detached background process, so
  it's invoked with `docker compose run --rm mcp_server`, not `up`. CI's `docker` job
  gained a third build step validating this image alongside backend/frontend.
- **`pyproject.toml`** — added `mcp_server` to `known-first-party` for isort (same category
  of fix as the `alembic` directory-vs-package gotcha logged in Path 2 Step 2).
- **Live demo attempt — partially verified, blocked on OpenAI billing.** Booted the full
  stack (`docker compose up -d --build`), registered a real user, and uploaded a hand-built
  demo PDF through the `STORAGE_BACKEND=s3`/LocalStack path — that leg worked. Indexing then
  failed at `ai_service.embed_texts` with `openai.RateLimitError: insufficient_quota` (the
  dev OpenAI account is out of credits) — unrelated to this feature, but it blocked a full
  live run of `search_documents`/`ask_document`, which need working embeddings. Confirmed as
  a side effect that `save_and_index`'s failure-path cleanup (Path 2 Step 1) still works
  correctly: the failed upload left no orphaned `documents` row. Separately confirmed via a
  real MCP client over stdio (not mocked) that the server's handshake, tool list and schemas
  are correct — only the DB-backed tool bodies are untested against live data.
- **Branch status:** all of the above is on `feat/mcp-server` (5 commits), **pushed to
  origin, not yet opened as a PR.** Holding the PR until OpenAI billing is restored and
  `search_documents`/`ask_document` get a real end-to-end run (`list_documents` needs no
  OpenAI call and is already confirmed). Re-run plan: top up OpenAI credits → `docker compose
  up -d --build` → re-upload a PDF to the existing `mcp-demo@example.com` account → set
  `MCP_USER_EMAIL` → call all three tools for real → then open the PR into `main`.

### 2026-08-21
- **Planning review after a context gap.** Audited repo state against the docs and wrote the
  remaining work into this file as **Stage 0**, **Stage 1**, **Path 3 (AWS deploy)** and
  **Path 4 (AI assistant optimization)**. No application code changed.
- **README roadmap synced** — it still showed the S3 storage backend as unchecked (shipped in
  PR #2) and described the CI docker job as pending. Branch protection and Path 2 completion
  were missing entirely.
- **Path 4 sourced from `Projects/balihani/05-ai-assistant.md`** — a production RAG assistant in
  another project of this user's. Mapped which of its patterns port to askmydocs (conversation
  memory, retrieval trace, graceful degradation, eval set, background-reindex pattern) and which
  must **not** be copied (in-memory numpy index — pgvector is better; the darija/error-code
  business logic; `MIN_SIMILARITY=0.30`, which is tuned for a curated KB and would discard most
  of askmydocs' 0.17–0.41 score range).
- **Multi-task warning recorded:** balihani runs `--workers 1` and keeps rate-limit buckets and
  its index in process. askmydocs will run N ECS tasks, so any in-process state ported from it
  is a bug — the rate limiter must be Redis/DB-backed.
- **Two real defects found and logged (not yet fixed):** the compose `backend` service does not
  wait on `localstack`'s healthcheck (cold-start race when `STORAGE_BACKEND=s3`), and
  `core/database.py` passes no SSL `connect_args`, which will fail against RDS.
- **Two earlier suspicions checked and cleared:** `backend/venv/` is properly gitignored and
  dockerignored; upload content-type/size validation already exists in `document_service.py`.

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
  - **Branch protection ENABLED** on `main` via Rulesets (Active). Requires PR + 0 reviews, all 3 status checks green, branch up-to-date, linear history, no force pushes, no deletions. Allowed merge methods: Squash + Rebase. Direct pushes to `main` now rejected — work happens on feature branches via PRs.
