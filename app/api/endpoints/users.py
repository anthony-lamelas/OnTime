from typing import Any
from fastapi import APIRouter, Depends, HTTPException

from app.api import deps
from app.core.security import get_password_hash
from app.schemas.user import UserCreate, UserResponse

router = APIRouter()

@router.post("/", response_model=UserResponse)
def create_user(
    *,
    db = Depends(deps.get_db),
    user_in: UserCreate,
) -> Any:
    """
    Create new user.
    """
    with db.cursor() as cursor:
        cursor.execute("SELECT id FROM users WHERE email = %s", (user_in.email,))
        if cursor.fetchone():
            raise HTTPException(
                status_code=400,
                detail="The user with this username already exists in the system.",
            )
        
        hashed_pw = get_password_hash(user_in.password)
        cursor.execute(
            "INSERT INTO users (email, hashed_password) VALUES (%s, %s) RETURNING id, email",
            (user_in.email, hashed_pw)
        )
        new_user = cursor.fetchone()
        db.commit()
        
    return UserResponse(id=new_user[0], email=new_user[1])

@router.get("/me", response_model=UserResponse)
def read_user_me(
    current_user: UserResponse = Depends(deps.get_current_user),
) -> Any:
    """
    Get current user.
    """
    return current_user
