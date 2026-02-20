from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm

from app.api import deps
from app.core import security
from app.core.config import settings
from app.schemas.token import Token

router = APIRouter()

@router.post("/login", response_model=Token)
def login_access_token(
    db = Depends(deps.get_db), form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """
    Get an access token for future requests
    """
    with db.cursor() as cursor:
        cursor.execute("SELECT id, hashed_password FROM users WHERE email = %s", (form_data.username,))
        user_record = cursor.fetchone()
        
    if not user_record or not security.verify_password(form_data.password, user_record[1]):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    access_token = security.create_access_token(user_record[0])

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }