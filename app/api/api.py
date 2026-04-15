from fastapi import APIRouter

from app.api.endpoints import auth, users, subway, routes

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(subway.router, prefix="/subway", tags=["subway"])
api_router.include_router(routes.router, prefix="/routes", tags=["routes"])
