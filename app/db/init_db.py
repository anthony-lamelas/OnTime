import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../../')))

import asyncio
import asyncpg
from app.core.config import settings

async def init_db():
    print("Initializing database")
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    
    try:
        conn = await asyncpg.connect(settings.DATABASE_URL)
        
        with open(schema_path, "r") as f:
            schema_sql = f.read()
            
        await conn.execute(schema_sql)
        print("Database schema applied successfully.")
        
    except Exception as e:
        print(f"Error initializing database: {e}")
    finally:
        if 'conn' in locals():
            await conn.close()

if __name__ == "__main__":
    asyncio.run(init_db())
