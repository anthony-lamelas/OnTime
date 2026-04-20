from pydantic import BaseModel
from typing import Dict, Any

class PlannedTripCreate(BaseModel):
    origin: Dict[str, Any]
    destination: Dict[str, Any]
    date: str
    time: str

class PlannedTripResponse(BaseModel):
    id: int
    user_id: int
    origin: Dict[str, Any]
    destination: Dict[str, Any]
    date: str
    time: str
