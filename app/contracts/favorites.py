from pydantic import BaseModel
from typing import Dict, Any

class FavoriteRouteCreate(BaseModel):
    name: str
    origin: Dict[str, Any]
    destination: Dict[str, Any]

class FavoriteRouteResponse(BaseModel):
    id: int
    user_id: int
    name: str
    origin: Dict[str, Any]
    destination: Dict[str, Any]

class FavoriteLocationCreate(BaseModel):
    name: str
    location: Dict[str, Any]

class FavoriteLocationResponse(BaseModel):
    id: int
    user_id: int
    name: str
    location: Dict[str, Any]   