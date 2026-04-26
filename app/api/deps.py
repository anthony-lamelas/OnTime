from typing import AsyncGenerator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
import logging
from pydantic import ValidationError

from app.db import session
from app.core.config import settings
from app.core import security
from app.contracts.token import TokenPayload
from app.contracts.user import UserResponse

logger = logging.getLogger(__name__)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

async def get_db() -> AsyncGenerator:
    if not session.connection_pool:
        raise Exception("Database connection pool not initialized")
        
    async with session.connection_pool.acquire() as conn:
        yield conn

async def get_current_user(db = Depends(get_db), token: str = Depends(oauth2_scheme)) -> UserResponse:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        user_id = int(token_data.sub)
        if not user_id:
            raise ValueError("Token missing user ID")
    except (jwt.PyJWTError, ValidationError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    
    user_record = await db.fetchrow("SELECT id, email FROM users WHERE id = $1", user_id)
        
    if not user_record:
        raise HTTPException(status_code=404, detail="User not found")
        
    return UserResponse(id=user_record['id'], email=user_record['email'])
