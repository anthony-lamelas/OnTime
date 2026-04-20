from typing import Any
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api.api import api_router
from app.core.config import settings
from app.db.init_db import init_db
from app.db.session import init_db_pool, close_db_pool

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize the database schema on startup
    init_db()
    # Spin up asyncpg connection array
    await init_db_pool()
    yield
    # Close gracefully
    await close_db_pool()

app = FastAPI(
    title="OnTime API",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# Set all CORS enabled origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this as we only want the actual frontend calling API
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
