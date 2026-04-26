import asyncpg
import logging
from app.core.config import settings

logger = logging.getLogger(__name__)

connection_pool = None

async def init_db_pool():
    global connection_pool
    try:
        connection_pool = await asyncpg.create_pool(
            dsn=settings.DATABASE_URL,
            min_size=1,
            max_size=20
        )
        logger.info("AsyncPG Connection pool created successfully.")
    except Exception as e:
        logger.error(f"Error creating asyncpg pool: {e}")

async def close_db_pool():
    global connection_pool
    if connection_pool:
        await connection_pool.close()
        logger.info("AsyncPG Connection pool closed cleanly.")
