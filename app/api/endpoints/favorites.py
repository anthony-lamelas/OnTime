import json
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from app.contracts.favorites import (
    FavoriteRouteCreate, FavoriteRouteResponse,
    FavoriteLocationCreate, FavoriteLocationResponse
)
from app.api import deps

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/routes", response_model=FavoriteRouteResponse)
async def create_favorite_route(
    *,
    db = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
    favorite_route: FavoriteRouteCreate,
) -> Any:
    """
    Create a new favorite route
    """
    route_id = await db.fetchval(
        "INSERT INTO favorite_routes (user_id, name, origin, destination) VALUES ($1, $2, $3, $4) RETURNING id",
        current_user.id, favorite_route.name, json.dumps(favorite_route.origin), json.dumps(favorite_route.destination)
    )
    
    logger.info(f"User #{current_user.id} logged favorite route: {route_id}")
    
    return {
        "id": route_id,
        "user_id": current_user.id,
        "name": favorite_route.name,
        "origin": favorite_route.origin,
        "destination": favorite_route.destination,
    }

@router.get("/routes", response_model=list[FavoriteRouteResponse])
async def get_favorite_routes(
    db = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
) -> Any:
    """
    Get all favorite routes for the current user
    """
    favorite_routes = await db.fetch("SELECT id, name, origin, destination FROM favorite_routes WHERE user_id = $1 ORDER BY id DESC", current_user.id)
        
    return [
        FavoriteRouteResponse(
            id=row['id'],
            user_id=current_user.id,
            name=row['name'],
            origin=row['origin'] if isinstance(row['origin'], dict) else json.loads(row['origin']),
            destination=row['destination'] if isinstance(row['destination'], dict) else json.loads(row['destination'])
        ) for row in favorite_routes
    ]

@router.post("/locations", response_model=FavoriteLocationResponse)
async def create_favorite_location(
    *,
    db = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
    favorite_location: FavoriteLocationCreate,
) -> Any:
    """
    Create a new favorite location
    """
    loc_id = await db.fetchval(
        "INSERT INTO favorite_locations (user_id, name, location) VALUES ($1, $2, $3) RETURNING id", 
        current_user.id, favorite_location.name, json.dumps(favorite_location.location)
    )
    
    logger.info(f"User #{current_user.id} logged favorite location: {loc_id}")
    
    return {
        "id": loc_id,
        "user_id": current_user.id,
        "name": favorite_location.name,
        "location": favorite_location.location,
    }

@router.get("/locations", response_model=list[FavoriteLocationResponse])
async def get_favorite_locations(
    db = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
) -> Any:
    """
    Get all favorite locations for the current user
    """
    favorite_locations = await db.fetch("SELECT id, name, location FROM favorite_locations WHERE user_id = $1 ORDER BY id DESC", current_user.id)
        
    return [
        FavoriteLocationResponse(
            id=row['id'],
            user_id=current_user.id,
            name=row['name'],
            location=row['location'] if isinstance(row['location'], dict) else json.loads(row['location']),
        ) for row in favorite_locations
    ]

@router.delete("/routes/{route_id}")
async def delete_favorite_route(
    db = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
    route_id: int,
) -> Any:
    """
    Delete a favorite route
    """
    await db.execute("DELETE FROM favorite_routes WHERE id = $1 AND user_id = $2", route_id, current_user.id)
    logger.info(f"User #{current_user.id} deleted favorite route: {route_id}")
    return {"message": "Favorite route deleted successfully"}


@router.delete("/locations/{location_id}")
async def delete_favorite_location(
    db = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
    location_id: int,
) -> Any:
    """
    Delete a favorite location
    """
    await db.execute("DELETE FROM favorite_locations WHERE id = $1 AND user_id = $2", location_id, current_user.id)
    logger.info(f"User #{current_user.id} deleted favorite location: {location_id}")
    return {"message": "Favorite location deleted successfully"}
