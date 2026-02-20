import asyncio
import sys

from app.schemas.user import UserCreate
from app.api.endpoints.users import create_user
from app.api.deps import get_db

async def run():
    try:
        conn = next(get_db())
        user_in = UserCreate(email="test2@example.com", password="securepassword123")
        res = create_user(db=conn, user_in=user_in)
        print("Success:", res)
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(run())
