import logging
from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from app.api import deps
from app.core import security
from app.core.config import settings
from app.contracts.token import Token

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/login", response_model=Token)
async def login_access_token(
    db = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    Get an access token for future requests
    """
    user_record = await db.fetchrow("SELECT id, hashed_password FROM users WHERE email = $1", form_data.username)
        
    if not user_record or not security.verify_password(form_data.password, user_record['hashed_password']):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    access_token = security.create_access_token(user_record['id'])
    
    logger.info(f"User #{user_record['id']} authenticated successfully.")

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }