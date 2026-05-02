"""
NYC Subway trip planner endpoint.
  - Dijkstra on GTFS-timed edge graph (real inter-station seconds)
  - Transfer penalty so unnecessary line changes cost time
  - Multi-origin: tries all stations within walking distance, picks fastest total
  - Live MTA wait times from GTFS-RT when available
"""
from __future__ import annotations

import heapq
import json
import math
import httpx
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.mta.feeds import get_live_subway_data, next_departure_minutes, departure_times_by_line
from app.contracts.subway import StationOut, RouteOut, TravelTimeOut, PlanRequest, PlanOut
from app.services.route_scorer import RouteSignals, rank_routes

router = APIRouter()

STATIONS_FILE = Path(__file__).parent.parent.parent / "data" / "stations.json"
GRAPH_FILE    = Path(__file__).parent.parent.parent / "data" / "subway_graph.json"

_stations_cache: list[dict] | None = None
# graph: { station_id: { neighbor_id: { "time_sec": int, "lines": [str] } } }
_graph_cache: dict[str, dict] | None = None

# Routing constants
TRANSFER_PENALTY_SEC  = 240   # 4 min penalty for changing lines at a transfer station
WALK_SPEED_KMH        = 5.0
MAX_WALK_ORIGIN_KM    = 1.0   # consider origin stations up to 1 km away
MAX_WALK_DEST_KM      = 0.8   # consider destination stations up to 0.8 km away
MAX_ORIGIN_CANDIDATES = 6     # max walkable origin stations to evaluate
MAX_DEST_CANDIDATES   = 5

def _get_season(month: int) -> str:
    if month in [12, 1, 2]: return "Winter"
    if month in [3, 4, 5]:  return "Spring"
    if month in [6, 7, 8]:  return "Summer"
    return "Fall"

async def _get_delay_prediction(route_name: str, stop_id: str) -> float:
    """Call ml_service and return predicted delay in minutes, default 0 on failure."""
    now = datetime.now()
    payload = {
        "route_name":    route_name,
        "direction":     "1",
        "stop_id":       stop_id,
        "day_of_week":   now.strftime("%A"),
        "hour":          now.hour,
        "month":         now.month,
        "year":          now.year,
        "stop_sequence": 1,
        "season":        _get_season(now.month),
        "count":         0,
    }
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post("http://localhost:8001/predict", json=payload, timeout=2.0)
            data = r.json()
            return data["data"]["predicted_delay_minutes"]
    except Exception:
        return 0.0

# ── Data loading ──────────────────────────────────────────────────────────────

def _load_stations() -> list[dict]:
    global _stations_cache, _graph_cache
    if _stations_cache is not None:
        return _stations_cache
    with open(STATIONS_FILE) as f:
        _stations_cache = json.load(f)
    with open(GRAPH_FILE) as f:
        _graph_cache = json.load(f)
    return _stations_cache


# ── Geometry ──────────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(d_lon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _walk_seconds(dist_km: float) -> int:
    return int((dist_km / WALK_SPEED_KMH) * 3600)


def _stations_within(lat: float, lon: float, max_km: float,
                     stations: list[dict], graph: dict) -> list[tuple[float, dict]]:
    """Return [(dist_km, station)] for stations within max_km that exist in the graph."""
    result = []
    for s in stations:
        if not s.get("lat") or not s.get("lon") or s["id"] not in graph:
            continue
        d = _haversine_km(lat, lon, s["lat"], s["lon"])
        if d <= max_km:
            result.append((d, s))
    result.sort(key=lambda x: x[0])
    return result


# ── Dijkstra ──────────────────────────────────────────────────────────────────

def _dijkstra(
    origin_id: str,
    dest_id: str,
    graph: dict,
    initial_wait_sec: int = 300,
    preferred_lines: frozenset | None = None,
) -> tuple[list[str], int] | None:
    """
    Time-weighted Dijkstra.

    State: (total_seconds, station_id, frozenset_of_lines_currently_on)
    - Moving along an edge shared by the current line(s): add edge travel time only.
    - Moving to a neighbor reachable only via a different line: add edge time +
      TRANSFER_PENALTY_SEC (platform walk + waiting for the next train).

    Returns (path_of_station_ids, total_transit_seconds) or None.
    """
    if origin_id == dest_id:
        return [origin_id], 0

    # Start with all lines at origin, initial wait already paid
    origin_lines = frozenset(
        line
        for nbr_data in graph.get(origin_id, {}).values()
        for line in nbr_data.get("lines", [])
    )
    if preferred_lines:
        restricted = origin_lines & preferred_lines
        if restricted:   # only restrict if preferred line actually serves this station
            origin_lines = restricted

    # heap entries: (cost_sec, station_id, lines_on, path)
    pq: list = [(initial_wait_sec, origin_id, origin_lines, [origin_id])]
    best: dict[tuple, int] = {(origin_id, origin_lines): initial_wait_sec}

    while pq:
        cost, node, lines_on, path = heapq.heappop(pq)

        if node == dest_id:
            return path, cost

        state = (node, lines_on)
        if cost > best.get(state, float("inf")):
            continue

        for nbr, edge in graph.get(node, {}).items():
            t_sec        = edge.get("time_sec", 120)
            edge_lines   = frozenset(edge.get("lines", []))
            shared_lines = lines_on & edge_lines

            if shared_lines:
                # Continue on the same line — no penalty
                new_cost  = cost + t_sec
                new_lines = shared_lines
            else:
                # Transfer: pay penalty + board new line
                new_cost  = cost + t_sec + TRANSFER_PENALTY_SEC
                new_lines = edge_lines

            new_state = (nbr, new_lines)
            if new_cost < best.get(new_state, float("inf")):
                best[new_state] = new_cost
                heapq.heappush(pq, (new_cost, nbr, new_lines, path + [nbr]))

    return None  # no path


# ── API models ────────────────────────────────────────────────────────────────

class RankedPlanOut(BaseModel):
    origin_station: StationOut
    dest_station: StationOut
    origin_walk_km: float
    dest_walk_km: float
    route: RouteOut
    travel_time: TravelTimeOut
    score: float
    lines: list[str]
    predicted_delay_minutes: float

class PlansOut(BaseModel):
    routes: list[RankedPlanOut]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/stations", response_model=list[StationOut])
def get_stations():
    return _load_stations()


@router.post("/plan", response_model=PlansOut)
async def plan_trip(req: PlanRequest):
    """
    Find the fastest subway route from origin coords to destination coords.

    Strategy:
      1. Enumerate all candidate origin stations within walking distance.
      2. Enumerate all candidate destination stations within walking distance.
      3. For each line group at the origin, run Dijkstra with that group preferred.
      4. Total cost = walk_to_origin + wait_for_train + dijkstra_transit + walk_from_dest.
      5. Score and rank the top results, return ranked list.
    """
    stations = _load_stations()
    if _graph_cache is None:
        raise HTTPException(status_code=503, detail="Graph not ready")

    station_map = {s["id"]: s for s in stations}

    # Candidate origin stations (all within MAX_WALK_ORIGIN_KM)
    origin_candidates = _stations_within(
        req.origin_lat, req.origin_lon, MAX_WALK_ORIGIN_KM, stations, _graph_cache
    )[:MAX_ORIGIN_CANDIDATES]

    # Fallback: just the nearest station if nothing in range
    if not origin_candidates:
        routable = sorted(
            [s for s in stations if s["id"] in _graph_cache],
            key=lambda s: _haversine_km(req.origin_lat, req.origin_lon, s["lat"], s["lon"])
        )
        if routable:
            origin_candidates = [(_haversine_km(req.origin_lat, req.origin_lon,
                                                 routable[0]["lat"], routable[0]["lon"]),
                                  routable[0])]

    if not origin_candidates:
        raise HTTPException(status_code=404, detail="No station near origin")

    # Candidate destination stations
    dest_candidates = _stations_within(
        req.dest_lat, req.dest_lon, MAX_WALK_DEST_KM, stations, _graph_cache
    )[:MAX_DEST_CANDIDATES]

    if not dest_candidates:
        routable = sorted(
            [s for s in stations if s["id"] in _graph_cache],
            key=lambda s: _haversine_km(req.dest_lat, req.dest_lon, s["lat"], s["lon"])
        )
        if routable:
            dest_candidates = [(_haversine_km(req.dest_lat, req.dest_lon,
                                              routable[0]["lat"], routable[0]["lon"]),
                                routable[0])]

    if not dest_candidates:
        raise HTTPException(status_code=404, detail="No station near destination")

    # Fetch live wait times for each candidate origin station (concurrently)
    import asyncio
    async def _get_wait(s: dict) -> int:
        w = await next_departure_minutes(s["id"], s.get("lines", []))
        return w * 60 if w is not None else 300   # default 5 min

    wait_tasks = [_get_wait(s) for _, s in origin_candidates]
    wait_secs_list = await asyncio.gather(*wait_tasks)
    origin_waits = {
        s["id"]: (wait_secs_list[i], wait_secs_list[i] < 300)  # (seconds, is_live)
        for i, (_, s) in enumerate(origin_candidates)
    }

    # Evaluate every (origin, destination) pair
    best_total = float("inf")
    best_result = None

    for o_km, o_station in origin_candidates:
        o_walk_sec = _walk_seconds(o_km)
        o_wait_sec, o_live = origin_waits[o_station["id"]]

        for d_km, d_station in dest_candidates:
            if o_station["id"] == d_station["id"]:
                continue

            pref = frozenset([req.preferred_line]) if req.preferred_line else None
            result = _dijkstra(o_station["id"], d_station["id"], _graph_cache, o_wait_sec, pref)
            if result is None:
                continue

            path, transit_sec = result
            total_sec = o_walk_sec + transit_sec + _walk_seconds(d_km)

            if total_sec < best_total:
                best_total = total_sec
                best_result = {
                    "o_station": o_station,
                    "d_station": d_station,
                    "o_walk_km": o_km,
                    "d_walk_km": d_km,
                    "o_wait_sec": o_wait_sec,
                    "o_live": o_live,
                    "path": path,
                    "transit_sec": transit_sec,
                    "total_sec": total_sec,
                }

    if best_result is None:
        raise HTTPException(status_code=404, detail="No route found")

    r = best_result

    # Fetch per-line departure times for the chosen origin station
    line_dep = await departure_times_by_line(
        r["o_station"]["id"],
        r["o_station"].get("lines", [])
    )
    path = r["path"]
    route_stations = [StationOut(**station_map[sid]) for sid in path if sid in station_map]

    stops = max(0, len(path) - 1)
    wait_min = round(r["o_wait_sec"] / 60)
    transit_min = max(1, round((r["transit_sec"] - r["o_wait_sec"]) / 60))
    o_walk_min = round(_walk_seconds(r["o_walk_km"]) / 60)
    d_walk_min = round(_walk_seconds(r["d_walk_km"]) / 60)
    total_min = o_walk_min + wait_min + transit_min + d_walk_min

    # Score each line at the origin station individually
    candidates = []
    signals_list = []
    line_names = []
    delay_minutes_list = []

    for line, dep in line_dep.items():
        delay_min = await _get_delay_prediction(line, r["o_station"]["id"])
        delay_score = min(delay_min / 10.0, 1.0)

        candidate = PlanOut(
            origin_station=StationOut(**r["o_station"]),
            dest_station=StationOut(**r["d_station"]),
            origin_walk_km=r["o_walk_km"],
            dest_walk_km=r["d_walk_km"],
            route=RouteOut(stations=route_stations, total_stops=stops, found=True),
            travel_time=TravelTimeOut(
                stops=stops,
                transit_minutes=transit_min,
                wait_minutes=dep["minutes"],
                total_minutes=o_walk_min + dep["minutes"] + transit_min + d_walk_min,
                live=dep["live"],
                line_departures=line_dep,
            ),
        )
        candidates.append(candidate)
        line_names.append(line)
        signals_list.append(RouteSignals(
            eta_minutes=float(o_walk_min + dep["minutes"] + transit_min + d_walk_min),
            delay_probability=delay_score,
            preference_score=0.7,
            safety_score=0.8,
            ml_confidence=0.9,
        ))
        delay_minutes_list.append(round(delay_min, 1))

    ranked = rank_routes(
        [c.model_dump() for c in candidates],
        signals_list
    )

    return PlansOut(
        routes=[
            RankedPlanOut(**r, lines=[line_names[i]], predicted_delay_minutes=delay_minutes_list[i])
            for i, r in enumerate(ranked)
        ]
    )


@router.get("/live")
async def live_subway(
    line: Optional[str] = Query(None, description="Single line letter, e.g. A, 1, G")
):
    """Return live MTA GTFS-RT data."""
    try:
        data = await get_live_subway_data(line)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"MTA feed error: {exc}")
    return data