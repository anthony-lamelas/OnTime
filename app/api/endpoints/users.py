import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException

from app.api import deps
from app.core.security import get_password_hash
from app.contracts.user import UserCreate, UserResponse

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/", response_model=UserResponse)
async def create_user(
    *,
    db = Depends(deps.get_db),
    user_in: UserCreate,
) -> Any:
    """
    Create new user.
    """
    record = await db.fetchrow("SELECT id FROM users WHERE email = $1", user_in.email)
    if record:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )
    
    hashed_pw = get_password_hash(user_in.password)
    new_user = await db.fetchrow(
        "INSERT INTO users (email, hashed_password) VALUES ($1, $2) RETURNING id, email",
        user_in.email, hashed_pw
    )
    
    logger.info(f"New user generated dynamically: #{new_user['id']}")
        
    return UserResponse(id=new_user['id'], email=new_user['email'])

@router.get("/me", response_model=UserResponse)
async def read_user_me(
    current_user: UserResponse = Depends(deps.get_current_user),
) -> Any:
    """
    Get current user.
    """
    return current_user
