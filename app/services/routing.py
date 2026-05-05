import math
import heapq
from app.contracts.subway import RouteLeg, StationOut

# Routing constants
TRANSFER_PENALTY_SEC  = 240   # 4 min penalty for changing lines at a transfer station
WALK_SPEED_KMH        = 5.0
MAX_WALK_ORIGIN_KM    = 1.5   # consider origin stations up to 1.5 km away
MAX_WALK_DEST_KM      = 1.5   # consider destination stations up to 1.5 km away
MAX_ORIGIN_CANDIDATES = 6     # max walkable origin stations to evaluate
MAX_DEST_CANDIDATES   = 5

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
    if not path_with_lines:
        return []

    legs: list[RouteLeg] = []
    cur_line = path_with_lines[0][1]
    cur_stations: list[StationOut] = []

    for sid, line in path_with_lines:
        if line != cur_line and cur_stations:
            legs.append(RouteLeg(line=cur_line, stations=cur_stations, stops=len(cur_stations) - 1))
            cur_line = line
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
) -> tuple[list[tuple[str, str]], int] | None:
    if origin_id == dest_id:
        line = next(iter(
            line for nbr_data in graph.get(origin_id, {}).values()
            for line in nbr_data.get("lines", [])
        ), "?")
        return [(origin_id, line)], 0

    origin_lines = set(
        line
        for nbr_data in graph.get(origin_id, {}).values()
        for line in nbr_data.get("lines", [])
    )
    if preferred_lines:
        restricted = origin_lines & preferred_lines
        if restricted:
            origin_lines = restricted

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
                new_cost = cost + t_sec
                new_state = (nbr, cur_line)
                if new_cost < best.get(new_state, float("inf")):
                    best[new_state] = new_cost
                    heapq.heappush(pq, (new_cost, nbr, cur_line, path + [(nbr, cur_line)]))
            else:
                for new_line in edge_lines:
                    new_cost = cost + t_sec + TRANSFER_PENALTY_SEC
                    new_state = (nbr, new_line)
                    if new_cost < best.get(new_state, float("inf")):
                        best[new_state] = new_cost
                        heapq.heappush(pq, (new_cost, nbr, new_line, path + [(nbr, new_line)]))

    return None
