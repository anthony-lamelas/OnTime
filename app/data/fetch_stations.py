"""
Fetch NYC subway GTFS and produce:
  app/data/stations.json        – station list
  app/data/subway_graph.json    – adjacency with edge travel times and served lines

Run from project root:
    python -m app.data.fetch_stations
"""
import csv
import io
import json
import zipfile
from collections import defaultdict
from pathlib import Path

import httpx

GTFS_URL = "http://web.mta.info/developers/data/nyct/subway/google_transit.zip"
OUT_DIR  = Path(__file__).parent


def _parse_time(t: str) -> int | None:
    """HH:MM:SS → seconds. Returns None on error (GTFS allows >24h times)."""
    try:
        h, m, s = t.strip().split(":")
        return int(h) * 3600 + int(m) * 60 + int(s)
    except Exception:
        return None


def main():
    resp = httpx.get(GTFS_URL, follow_redirects=True, timeout=60)
    resp.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        stops_raw      = zf.read("stops.txt").decode("utf-8")
        trips_raw      = zf.read("trips.txt").decode("utf-8")
        stop_times_raw = zf.read("stop_times.txt").decode("utf-8")


    trip_to_route: dict[str, str] = {}
    for row in csv.DictReader(io.StringIO(trips_raw)):
        trip_to_route[row["trip_id"]] = row["route_id"]


    # Collect per-trip stop sequences with scheduled times.
    # trip_seq: trip_id → [(stop_seq, stop_id_stripped, departure_sec)]
    trip_seq:    dict[str, list] = defaultdict(list)
    stop_routes: dict[str, set]  = defaultdict(set)

    for row in csv.DictReader(io.StringIO(stop_times_raw)):
        tid = row["trip_id"]
        rid = trip_to_route.get(tid)
        if not rid:
            continue
        sid = row["stop_id"].rstrip("NS")
        seq = int(row["stop_sequence"])
        dep = _parse_time(row.get("departure_time", ""))
        arr = _parse_time(row.get("arrival_time", ""))
        t   = dep if dep is not None else arr   # prefer departure

        stop_routes[sid].add(rid)
        trip_seq[tid].append((seq, sid, t))


    # edge_data: (a, b) → {lines: set, times: [seconds, ...]}
    edge_data: dict[tuple, dict] = {}

    for tid, stops in trip_seq.items():
        rid = trip_to_route[tid]
        stops.sort(key=lambda x: x[0])

        for i in range(len(stops) - 1):
            _, sid_a, t_a = stops[i]
            _, sid_b, t_b = stops[i + 1]
            if sid_a == sid_b:
                continue

            key = (sid_a, sid_b) if sid_a < sid_b else (sid_b, sid_a)
            if key not in edge_data:
                edge_data[key] = {"lines": set(), "times": []}

            edge_data[key]["lines"].add(rid)

            # Travel time from departure of A to arrival/departure of B
            if t_a is not None and t_b is not None:
                dt = t_b - t_a
                if 0 < dt < 600:          # 0–10 min: sensible range
                    edge_data[key]["times"].append(dt)

    stations: dict[str, dict] = {}
    for row in csv.DictReader(io.StringIO(stops_raw)):
        loc_type   = row.get("location_type", "0").strip()
        parent_sid = row.get("parent_station", "").strip()

        if loc_type == "0" and parent_sid:
            continue   # child platform — parent covers it
        if loc_type not in ("0", "1", ""):
            continue

        sid = row["stop_id"].rstrip("NS")
        if sid in stations:
            continue
        try:
            lat, lon = float(row["stop_lat"]), float(row["stop_lon"])
        except (ValueError, KeyError):
            continue
        if lat == 0.0 and lon == 0.0:
            continue

        stations[sid] = {
            "id":    sid,
            "name":  row["stop_name"],
            "lat":   lat,
            "lon":   lon,
            "lines": sorted(stop_routes.get(sid, set())),
        }

    # Format: { station_id: { neighbor_id: { "time_sec": int, "lines": [str] } } }
    graph: dict[str, dict] = defaultdict(dict)
    DEFAULT_SEC = 120   # 2 min fallback if no timing data

    for (a, b), info in edge_data.items():
        times = info["times"]
        t_sec = int(sum(times) / len(times)) if times else DEFAULT_SEC
        lines = sorted(info["lines"])

        graph[a][b] = {"time_sec": t_sec, "lines": lines}
        graph[b][a] = {"time_sec": t_sec, "lines": lines}


    OUT_DIR.mkdir(parents=True, exist_ok=True)

    with open(OUT_DIR / "stations.json", "w") as f:
        json.dump(list(stations.values()), f)

    with open(OUT_DIR / "subway_graph.json", "w") as f:
        json.dump(dict(graph), f)

    # Compute average stop sequence per route per stop
    route_stop_seq = defaultdict(list)
    for tid, stops in trip_seq.items():
        rid = trip_to_route[tid]
        for seq, sid, _ in stops:
            route_stop_seq[f"{rid}_{sid}"].append(seq)

    stop_sequences = {}
    for key, seqs in route_stop_seq.items():
        stop_sequences[key] = int(round(sum(seqs) / len(seqs)))

    with open(OUT_DIR / "stop_sequences.json", "w") as f:
        json.dump(stop_sequences, f)


if __name__ == "__main__":
    main()
