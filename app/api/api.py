from fastapi import APIRouter

from app.api.endpoints import auth, users, subway, routes, favorites, planned_trips

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(subway.router, prefix="/subway", tags=["subway"])
api_router.include_router(routes.router, prefix="/routes", tags=["routes"])
api_router.include_router(favorites.router, prefix="/favorites", tags=["favorites"])
api_router.include_router(planned_trips.router, prefix="/planned_trips", tags=["planned_trips"])
