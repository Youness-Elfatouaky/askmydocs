from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.database import init_db
from routers import auth as auth_router
from routers import documents as documents_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(title=settings.PROJECT_NAME, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix=settings.API_V1_PREFIX)
app.include_router(documents_router.router, prefix=settings.API_V1_PREFIX)


@app.get("/")
async def root():
    return {"message": "AskMyDocs API running"}


@app.get("/health")
async def health():
    return {"status": "ok"}
