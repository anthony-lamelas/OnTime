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
import os
import httpx
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.mta.feeds import get_live_subway_data, next_departure_minutes, departure_times_by_line
from app.contracts.subway import StationOut, RouteOut, RouteLeg, TravelTimeOut, PlanRequest, PlanOut
from app.services.route_scorer import RouteSignals, rank_routes

ML_API_URL = os.getenv("ML_API_URL", "http://localhost:8001")

router = APIRouter()

STATIONS_FILE = Path(__file__).parent.parent.parent / "data" / "stations.json"
GRAPH_FILE    = Path(__file__).parent.parent.parent / "data" / "subway_graph.json"
STOP_SEQUENCES_FILE = Path(__file__).parent.parent.parent / "data" / "stop_sequences.json"

_stations_cache: list[dict] | None = None
# graph: { station_id: { neighbor_id: { "time_sec": int, "lines": [str] } } }
_graph_cache: dict[str, dict] | None = None
_stop_sequences_cache: dict[str, int] | None = None

# Routing constants
TRANSFER_PENALTY_SEC  = 240   # 4 min penalty for changing lines at a transfer station
WALK_SPEED_KMH        = 5.0
MAX_WALK_ORIGIN_KM    = 1.5   # consider origin stations up to 1.5 km away
MAX_WALK_DEST_KM      = 1.5   # consider destination stations up to 1.5 km away
MAX_ORIGIN_CANDIDATES = 6     # max walkable origin stations to evaluate
MAX_DEST_CANDIDATES   = 5

def _get_season(month: int) -> str:
    if month in [12, 1, 2]: return "Winter"
    if month in [3, 4, 5]:  return "Spring"
    if month in [6, 7, 8]:  return "Summer"
    return "Fall"

def _get_direction_suffix(stop_ids: list, idx: int) -> str:
    """
    Guess N/S suffix based on position in path.
    First half of route = outbound (S), second half = inbound (N).
    This is a simplification — a proper fix needs actual direction from the graph.
    """
    midpoint = len(stop_ids) // 2
    return "S" if idx < midpoint else "N"

async def _get_delay_prediction(route_name: str, stop_id: str, trip_datetime: datetime = None,) -> float:
    now = trip_datetime or datetime.now()
    _load_stations()
    base_stop_id = stop_id.rstrip("NS")
    seq_key = f"{route_name}_{base_stop_id}"
    actual_seq = _stop_sequences_cache.get(seq_key, 1) if _stop_sequences_cache else 1

    payload = {
        "route_name":    route_name,
        "direction":     "1",
        "stop_id":       stop_id,
        "day_of_week":   now.strftime("%A"),
        "hour":          now.hour,
        "month":         now.month,
        "year":          now.year,
        "stop_sequence": actual_seq,
        "season":        _get_season(now.month),
        "count":         0,
    }
    try:
        async with httpx.AsyncClient() as client:
            r = await client.post(f"{ML_API_URL}/predict", json=payload, timeout=2.0)
            data = r.json()
            return data["data"]["predicted_delay_minutes"]
    except Exception as e:
        print(f"ML API Error: {e}")
        return None

async def _get_delay_prediction_for_route(route_name: str, stop_ids: list[str], trip_datetime: datetime = None,) -> Optional[float]:
    """Average delay prediction across all stops in the route path."""
    import asyncio
    clean_ids = [
        (s[0] if isinstance(s, tuple) else s) + _get_direction_suffix(stop_ids, i)
        for i, s in enumerate(stop_ids)
    ]
    predictions = await asyncio.gather(*[
        _get_delay_prediction(route_name, stop_id, trip_datetime)
        for stop_id in clean_ids
    ])
    valid_predictions = [p for p in predictions if p is not None]
    return sum(valid_predictions) / len(valid_predictions) if valid_predictions else None

# Data loading

def _load_stations() -> list[dict]:
    global _stations_cache, _graph_cache, _stop_sequences_cache
    if _stations_cache is not None:
        return _stations_cache
    with open(STATIONS_FILE) as f:
        _stations_cache = json.load(f)
    with open(GRAPH_FILE) as f:
        _graph_cache = json.load(f)
    if STOP_SEQUENCES_FILE.exists():
        with open(STOP_SEQUENCES_FILE) as f:
            _stop_sequences_cache = json.load(f)
    else:
        _stop_sequences_cache = {}
    return _stations_cache


# Geometry 

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


def _extract_legs(
    path_with_lines: list[tuple[str, str]],
    station_map: dict[str, dict],
) -> list[RouteLeg]:
    """
    Group a path of (station_id, line) tuples into RouteLeg segments.
    Each leg is one continuous run on a single line.
    """
    if not path_with_lines:
        return []

    legs: list[RouteLeg] = []
    cur_line = path_with_lines[0][1]
    cur_stations: list[StationOut] = []

    for sid, line in path_with_lines:
        if line != cur_line and cur_stations:
            # Line changed — close the current leg
            legs.append(RouteLeg(line=cur_line, stations=cur_stations, stops=len(cur_stations) - 1))
            cur_line = line
            # The transfer station starts the next leg too
            cur_stations = [cur_stations[-1]]

        if not cur_stations or cur_stations[-1].id != sid:
            station = station_map.get(sid)
            if station:
                cur_stations.append(StationOut(**station))

    if cur_stations:
        legs.append(RouteLeg(line=cur_line, stations=cur_stations, stops=len(cur_stations) - 1))

    return legs


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


def _dijkstra(
    origin_id: str,
    dest_id: str,
    graph: dict,
    initial_wait_sec: int = 300,
    preferred_lines: frozenset | None = None,
) -> tuple[list[str], int] | None:
    """
    Time-weighted Dijkstra.

    State: (cost_sec, station_id, current_line)  — one state per (station, line) pair.
    - Continuing on the same line: add edge travel time only.
    - Switching to a different line (transfer): add travel time + TRANSFER_PENALTY_SEC.

    Using a single current_line (not a frozenset) avoids state-space explosion where
    frozenset({'2'}) and frozenset({'2','3'}) at the same station were treated as
    separate, incomparable states — causing the algorithm to miss optimal transfers.

    Returns (path_of_station_ids, total_transit_seconds) or None.
    """
    if origin_id == dest_id:
        line = next(iter(
            line for nbr_data in graph.get(origin_id, {}).values()
            for line in nbr_data.get("lines", [])
        ), "?")
        return [(origin_id, line)], 0

    # All lines that serve the origin station (via its outgoing edges)
    origin_lines = set(
        line
        for nbr_data in graph.get(origin_id, {}).values()
        for line in nbr_data.get("lines", [])
    )
    if preferred_lines:
        restricted = origin_lines & preferred_lines
        if restricted:   # only restrict if preferred line actually serves this station
            origin_lines = restricted

    # path is a list of (station_id, line) tuples to track which line each hop uses
    pq: list = []
    best: dict[tuple, int] = {}
    for line in origin_lines:
        state = (origin_id, line)
        best[state] = initial_wait_sec
        heapq.heappush(pq, (initial_wait_sec, origin_id, line, [(origin_id, line)]))

    while pq:
        cost, node, cur_line, path = heapq.heappop(pq)

        if node == dest_id:
            return path, cost

        state = (node, cur_line)
        if cost > best.get(state, float("inf")):
            continue

        for nbr, edge in graph.get(node, {}).items():
            t_sec      = edge.get("time_sec", 120)
            edge_lines = edge.get("lines", [])

            if cur_line in edge_lines:
                # Continue on the same line — no transfer penalty
                new_cost = cost + t_sec
                new_state = (nbr, cur_line)
                if new_cost < best.get(new_state, float("inf")):
                    best[new_state] = new_cost
                    heapq.heappush(pq, (new_cost, nbr, cur_line, path + [(nbr, cur_line)]))
            else:
                # Transfer: board each line this edge serves, pay penalty once
                for new_line in edge_lines:
                    new_cost = cost + t_sec + TRANSFER_PENALTY_SEC
                    new_state = (nbr, new_line)
                    if new_cost < best.get(new_state, float("inf")):
                        best[new_state] = new_cost
                        heapq.heappush(pq, (new_cost, nbr, new_line, path + [(nbr, new_line)]))

    return None  # no path


class RankedPlanOut(BaseModel):
    origin_station: StationOut
    dest_station: StationOut
    origin_walk_km: float
    dest_walk_km: float
    route: RouteOut
    travel_time: TravelTimeOut
    score: float
    lines: list[str]
    predicted_delay_minutes: Optional[float]

class PlansOut(BaseModel):
    routes: list[RankedPlanOut]


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

    # Find the best (origin, dest) pair with no line preference
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

            path_with_lines, transit_sec = result
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
                    "path": path_with_lines,
                    "transit_sec": transit_sec,
                    "total_sec": total_sec,
                }

    if best_result is None:
        raise HTTPException(status_code=404, detail="No route found")

    r = best_result

    # Run per-line Dijkstra for the best origin/dest pair 
    line_dep = await departure_times_by_line(
        r["o_station"]["id"],
        r["o_station"].get("lines", [])
    )

    o_walk_min = round(_walk_seconds(r["o_walk_km"]) / 60)
    d_walk_min = round(_walk_seconds(r["d_walk_km"]) / 60)

    candidates = []
    signals_list = []
    line_names = []
    delay_minutes_list = []
    seen_paths: set[tuple] = set()

    for line, dep in line_dep.items():
        pref = frozenset([line])
        line_result = _dijkstra(
            r["o_station"]["id"], r["d_station"]["id"],
            _graph_cache, r["o_wait_sec"], pref
        )
        if line_result is None:
            continue

        path_with_lines, transit_sec = line_result
        # Deduplicate: same sequence of stations = same route
        path_key = tuple(sid for sid, _ in path_with_lines)
        if path_key in seen_paths:
            continue
        seen_paths.add(path_key)

        legs = _extract_legs(path_with_lines, station_map)
        route_stations = [StationOut(**station_map[sid]) for sid in path_key if sid in station_map]
        stops = max(0, len(path_key) - 1)
        pure_transit_sec = transit_sec - r["o_wait_sec"]
        transit_min = max(1, round(pure_transit_sec / 60))
        total_min = o_walk_min + dep["minutes"] + transit_min + d_walk_min
        all_lines = list(dict.fromkeys(leg.line for leg in legs))  # ordered, deduplicated

        import asyncio
        leg_delay_tasks = [
            _get_delay_prediction_for_route(leg.line, [s.id for s in leg.stations], req.trip_datetime)
            for leg in legs
        ]
        leg_delays = await asyncio.gather(*leg_delay_tasks)
        for leg, delay in zip(legs, leg_delays):
            leg.predicted_delay_minutes = delay

        valid_delays = [d for d in leg_delays if d is not None]
        delay_min = sum(valid_delays) if valid_delays else None
        delay_score = min(delay_min / 10.0, 1.0) if delay_min is not None else 0.5

        candidate = PlanOut(
            origin_station=StationOut(**r["o_station"]),
            dest_station=StationOut(**r["d_station"]),
            origin_walk_km=r["o_walk_km"],
            dest_walk_km=r["d_walk_km"],
            route=RouteOut(stations=route_stations, legs=legs, total_stops=stops, found=True),
            travel_time=TravelTimeOut(
                stops=stops,
                transit_minutes=transit_min,
                wait_minutes=dep["minutes"],
                total_minutes=total_min,
                live=dep["live"],
                line_departures=line_dep,
            ),
        )
        cand_dict = candidate.model_dump()
        cand_dict["lines"] = [line]
        cand_dict["predicted_delay_minutes"] = round(delay_min, 1) if delay_min is not None else None
        candidates.append(cand_dict)

        signals_list.append(RouteSignals(
            eta_minutes=float(total_min),
            delay_probability=delay_score,
            preference_score=0.7,
            safety_score=0.8,
            ml_confidence=0.9,
        ))

    # Fallback: use the globally-optimal path if no per-line routes produced candidates
    if not candidates:
        path_with_lines = r["path"]
        path_key = tuple(sid for sid, _ in path_with_lines)
        legs = _extract_legs(path_with_lines, station_map)
        route_stations = [StationOut(**station_map[sid]) for sid in path_key if sid in station_map]
        stops = max(0, len(path_key) - 1)
        wait_min = round(r["o_wait_sec"] / 60)
        transit_min = max(1, round((r["transit_sec"] - r["o_wait_sec"]) / 60))
        total_min = o_walk_min + wait_min + transit_min + d_walk_min
        fallback = PlanOut(
            origin_station=StationOut(**r["o_station"]),
            dest_station=StationOut(**r["d_station"]),
            origin_walk_km=r["o_walk_km"],
            dest_walk_km=r["d_walk_km"],
            route=RouteOut(stations=route_stations, legs=legs, total_stops=stops, found=True),
            travel_time=TravelTimeOut(
                stops=stops,
                transit_minutes=transit_min,
                wait_minutes=wait_min,
                total_minutes=total_min,
                live=r["o_live"],
                line_departures={},
            ),
        )
        fallback_lines = list(dict.fromkeys(leg.line for leg in legs))
        return PlansOut(routes=[RankedPlanOut(**fallback.model_dump(), score=1.0, lines=fallback_lines, predicted_delay_minutes=None)])

    ranked = rank_routes(
        candidates,
        signals_list
    )

    return PlansOut(
        routes=[
            RankedPlanOut(**r)
            for r in ranked
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