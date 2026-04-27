from typing import Optional
from pydantic import BaseModel

class StationOut(BaseModel):
    id: str
    name: str
    lines: list[str]
    lat: Optional[float]
    lon: Optional[float]


class RouteLeg(BaseModel):
    """A continuous segment of a route on a single subway line."""
    line: str
    stations: list[StationOut]
    stops: int


class RouteOut(BaseModel):
    stations: list[StationOut]   # flat list for map rendering
    legs: list[RouteLeg] = []    # per-line segments for sidebar display
    total_stops: int
    found: bool


class TravelTimeOut(BaseModel):
    stops: int
    transit_minutes: int
    wait_minutes: int
    total_minutes: int
    live: bool
    line_departures: dict = {}   # {line: {"minutes": int, "live": bool}}


class PlanRequest(BaseModel):
    origin_lat: float
    origin_lon: float
    dest_lat: float
    dest_lon: float
    preferred_line: str | None = None


class PlanOut(BaseModel):
    origin_station: StationOut
    dest_station: StationOut
    origin_walk_km: float
    dest_walk_km: float
    route: RouteOut
    travel_time: TravelTimeOut
