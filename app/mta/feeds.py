import asyncio
from typing import Optional

import httpx
from google.transit import gtfs_realtime_pb2

BASE_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F"

FEEDS: dict[str, str] = {
    "ACE":     BASE_URL + "gtfs-ace",
    "BDFM":    BASE_URL + "gtfs-bdfm",
    "G":       BASE_URL + "gtfs-g",
    "JZ":      BASE_URL + "gtfs-jz",
    "NQRW":    BASE_URL + "gtfs-nqrw",
    "L":       BASE_URL + "gtfs-l",
    "1234567": BASE_URL + "gtfs-1234567",
    "SI":      BASE_URL + "gtfs-si",
}

LINE_TO_FEED: dict[str, str] = {
    "A": "ACE", "C": "ACE", "E": "ACE", "H": "ACE", "S": "ACE",
    "B": "BDFM", "D": "BDFM", "F": "BDFM", "M": "BDFM",
    "G": "G",
    "J": "JZ", "Z": "JZ",
    "N": "NQRW", "Q": "NQRW", "R": "NQRW", "W": "NQRW",
    "L": "L",
    "1": "1234567", "2": "1234567", "3": "1234567", "4": "1234567",
    "5": "1234567", "6": "1234567", "7": "1234567",
    "SI": "SI",
}


async def _fetch_feed(client: httpx.AsyncClient, feed: str) -> bytes:
    resp = await client.get(FEEDS[feed])
    resp.raise_for_status()
    return resp.content


def _parse_feed(raw: bytes) -> gtfs_realtime_pb2.FeedMessage:
    msg = gtfs_realtime_pb2.FeedMessage()
    msg.ParseFromString(raw)
    return msg


def _normalize_entity(entity: gtfs_realtime_pb2.FeedEntity) -> dict | None:
    if entity.HasField("trip_update"):
        tu = entity.trip_update
        td = tu.trip
        return {
            "type": "trip_update",
            "trip_id": td.trip_id,
            "route_id": td.route_id,
            "direction": td.direction_id,
            "start_time": td.start_time,
            "start_date": td.start_date,
            "stop_time_updates": [
                {
                    "stop_id": stu.stop_id,
                    "arrival": stu.arrival.time if stu.HasField("arrival") else None,
                    "departure": stu.departure.time if stu.HasField("departure") else None,
                }
                for stu in tu.stop_time_update
            ],
        }

    if entity.HasField("vehicle"):
        vp = entity.vehicle
        td = vp.trip
        return {
            "type": "vehicle_position",
            "trip_id": td.trip_id,
            "route_id": td.route_id,
            "stop_id": vp.stop_id,
            "status": gtfs_realtime_pb2.VehiclePosition.VehicleStopStatus.Name(vp.current_status),
            "timestamp": vp.timestamp,
        }

    if entity.HasField("alert"):
        alert = entity.alert
        header = (
            alert.header_text.translation[0].text
            if alert.header_text.translation
            else ""
        )
        description = (
            alert.description_text.translation[0].text
            if alert.description_text.translation
            else ""
        )
        return {
            "type": "alert",
            "id": entity.id,
            "effect": gtfs_realtime_pb2.Alert.Effect.Name(alert.effect),
            "header": header,
            "description": description,
            "informed_entities": [
                {
                    "route_id": ie.route_id or None,
                    "stop_id": ie.stop_id or None,
                }
                for ie in alert.informed_entity
            ],
        }

    return None


def _merge_feeds(messages: list[gtfs_realtime_pb2.FeedMessage]) -> dict:
    trips: list[dict] = []
    vehicle_positions: list[dict] = []
    alerts: list[dict] = []
    timestamp = 0

    for msg in messages:
        if msg.header.timestamp > timestamp:
            timestamp = msg.header.timestamp
        for entity in msg.entity:
            normalized = _normalize_entity(entity)
            if normalized is None:
                continue
            t = normalized.pop("type")
            if t == "trip_update":
                trips.append(normalized)
            elif t == "vehicle_position":
                vehicle_positions.append(normalized)
            elif t == "alert":
                alerts.append(normalized)

    return {
        "timestamp": timestamp,
        "trips": trips,
        "vehicle_positions": vehicle_positions,
        "alerts": alerts,
    }


async def get_live_subway_data(line: Optional[str] = None) -> dict:
    """Fetch and parse MTA GTFS-RT subway feeds.

    Args:
        line: Optional single line letter (e.g. "A", "1"). If omitted, all 8
              feeds are fetched concurrently.

    Returns:
        Normalized dict with keys: timestamp, trips, vehicle_positions, alerts.
    """
    if line is not None:
        feed_key = LINE_TO_FEED.get(line.upper())
        if feed_key is None:
            raise ValueError(f"Unknown subway line: {line!r}")
        feed_keys = [feed_key]
    else:
        feed_keys = list(FEEDS.keys())

    async with httpx.AsyncClient(timeout=15.0) as client:
        raw_feeds = await asyncio.gather(*[_fetch_feed(client, k) for k in feed_keys])

    messages = [_parse_feed(raw) for raw in raw_feeds]
    return _merge_feeds(messages)


async def next_departure_minutes(stop_id: str, lines: list[str]) -> int | None:
    """Return minutes until the next train departs from stop_id on any of `lines`.

    Returns None if no live data is available.
    """
    import time as _time

    feed_keys = list({LINE_TO_FEED[l] for l in lines if l in LINE_TO_FEED})
    if not feed_keys:
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            raw_feeds = await asyncio.gather(*[_fetch_feed(client, k) for k in feed_keys])
        messages = [_parse_feed(raw) for raw in raw_feeds]
    except Exception:
        return None

    now = int(_time.time())
    soonest: int | None = None

    for msg in messages:
        for entity in msg.entity:  # type: ignore[attr-defined]
            if not entity.HasField("trip_update"):
                continue
            tu = entity.trip_update
            if tu.trip.route_id not in lines:
                continue
            for stu in tu.stop_time_update:
                # GTFS-RT stop IDs have N/S suffix; strip to match our IDs
                if stu.stop_id.rstrip("NS") != stop_id:
                    continue
                t = stu.departure.time if stu.HasField("departure") else (
                    stu.arrival.time if stu.HasField("arrival") else None
                )
                if t and t > now:
                    if soonest is None or t < soonest:
                        soonest = t

    if soonest is None:
        return None
    return max(0, (soonest - now) // 60)


async def departure_times_by_line(
    stop_id: str, lines: list[str]
) -> dict[str, dict]:
    """Return {line: {"minutes": int, "live": bool}} for each line in `lines`.

    Falls back to {"minutes": 5, "live": False} for lines with no live data.
    """
    import time as _time

    feed_keys = list({LINE_TO_FEED[l] for l in lines if l in LINE_TO_FEED})
    per_line: dict[str, int | None] = {l: None for l in lines if l in LINE_TO_FEED}

    if feed_keys:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                raw_feeds = await asyncio.gather(*[_fetch_feed(client, k) for k in feed_keys])
            messages = [_parse_feed(raw) for raw in raw_feeds]
            now = int(_time.time())
            for msg in messages:
                for entity in msg.entity:  # type: ignore[attr-defined]
                    if not entity.HasField("trip_update"):
                        continue
                    tu = entity.trip_update
                    route = tu.trip.route_id
                    if route not in per_line:
                        continue
                    for stu in tu.stop_time_update:
                        if stu.stop_id.rstrip("NS") != stop_id:
                            continue
                        t = stu.departure.time if stu.HasField("departure") else (
                            stu.arrival.time if stu.HasField("arrival") else None
                        )
                        if t and t > now:
                            if per_line[route] is None or t < per_line[route]:
                                per_line[route] = t
        except Exception:
            pass  # fall back to all-5

    now_ts = int(_time.time())
    return {
        line: (
            {"minutes": max(0, (t - now_ts) // 60), "live": True}
            if t is not None
            else {"minutes": 5, "live": False}
        )
        for line, t in per_line.items()
    }
