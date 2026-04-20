import json
import logging
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from app.contracts.planned_trips import PlannedTripCreate, PlannedTripResponse
from app.api import deps

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/", response_model=PlannedTripResponse)
async def create_planned_trip(
    *,
    db = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
    planned_trip: PlannedTripCreate,
) -> Any:
    """
    Create a new planned trip
    """
    trip_id = await db.fetchval(
        "INSERT INTO planned_trips (user_id, origin, destination, trip_date, trip_time) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        current_user.id, json.dumps(planned_trip.origin), json.dumps(planned_trip.destination), planned_trip.date, planned_trip.time
    )
    
    logger.info(f"User #{current_user.id} captured planned trip: {trip_id}")
    
    return {
        "id": trip_id,
        "user_id": current_user.id,
        "origin": planned_trip.origin,
        "destination": planned_trip.destination,
        "date": planned_trip.date,
        "time": planned_trip.time,
    }

@router.get("/", response_model=list[PlannedTripResponse])
async def get_planned_trips(
    db = Depends(deps.get_db),
    current_user = Depends(deps.get_current_user),
) -> Any:
    """
    Get all planned trips for the current user
    """
    trips = await db.fetch("SELECT id, origin, destination, trip_date, trip_time FROM planned_trips WHERE user_id = $1 ORDER BY id DESC", current_user.id)
        
    return [
        PlannedTripResponse(
            id=row['id'],
            user_id=current_user.id,
            origin=row['origin'] if isinstance(row['origin'], dict) else json.loads(row['origin']),
            destination=row['destination'] if isinstance(row['destination'], dict) else json.loads(row['destination']),
            date=row['trip_date'],
            time=row['trip_time']
        ) for row in trips
    ]
