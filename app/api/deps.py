from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from pydantic import ValidationError

from app.db.session import get_db_connection
from app.core.config import settings
from app.core import security
from app.schemas.token import TokenPayload
from app.schemas.user import UserResponse

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

def get_db() -> Generator:
    try:
        conn = next(get_db_connection())
        yield conn
    finally:
        pass # connection closure is handled by the generator in session.py

def get_current_user(db = Depends(get_db), token: str = Depends(oauth2_scheme)) -> UserResponse:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        user_id = token_data.sub
        if not user_id:
            raise ValueError("Token missing user ID")
    except (jwt.PyJWTError, ValidationError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Could not validate credentials",
        )
    
    with db.cursor() as cursor:
        cursor.execute("SELECT id, email FROM users WHERE id = %s", (user_id,))
        user_record = cursor.fetchone()
        
    if not user_record:
        raise HTTPException(status_code=404, detail="User not found")
        
    return UserResponse(id=user_record[0], email=user_record[1])
