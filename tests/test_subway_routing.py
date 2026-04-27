import pytest
from app.api.endpoints.subway import _haversine_km, _walk_seconds, _stations_within, _dijkstra

def test_haversine_km():
    # NYC to LA should be ~3900+ km
    lat1, lon1 = 40.7128, -74.0060
    lat2, lon2 = 34.0522, -118.2437
    dist = _haversine_km(lat1, lon1, lat2, lon2)
    assert 3900 < dist < 4000
    
    # Same point distance should be exactly 0
    assert _haversine_km(lat1, lon1, lat1, lon1) == 0.0

def test_walk_seconds():
    # At default 5 km/h walking speed, 5 km should take 3600 seconds
    assert _walk_seconds(5.0) == 3600
    # 2.5 km should take 1800 seconds
    assert _walk_seconds(2.5) == 1800

def test_stations_within():
    stations = [
        {"id": "A1", "lat": 40.7128, "lon": -74.0060},
        {"id": "B1", "lat": 40.7130, "lon": -74.0062},  # very close to A1
        {"id": "C1", "lat": 34.0522, "lon": -118.2437}, # very far (LA)
        {"id": "D1"} # no lat/lon data, should be skipped safely
    ]
    graph = {"A1": {}, "B1": {}, "C1": {}}
    
    # Origin is exactly at A1
    lat, lon = 40.7128, -74.0060
    # Search within 1 km threshold
    result = _stations_within(lat, lon, 1.0, stations, graph)
    
    assert len(result) == 2
    assert result[0][1]["id"] == "A1"
    assert result[1][1]["id"] == "B1"
    assert result[0][0] == 0.0 # First result is 0 distance

def test_dijkstra_routing():
    graph = {
        "A": {
            "B": {"time_sec": 120, "lines": ["1", "2"]},
            "C": {"time_sec": 300, "lines": ["1"]}
        },
        "B": {
            "C": {"time_sec": 120, "lines": ["1", "2"]},
            "D": {"time_sec": 60, "lines": ["2"]}
        },
        "C": {
            "D": {"time_sec": 60, "lines": ["1"]}
        },
        "D": {}
    }
    
    # Best path: A -> B -> D using line "2" without transfer penalty
    # Cost = initial(0) + A->B(120) + B->D(60) = 180
    path_with_lines, cost = _dijkstra("A", "D", graph, initial_wait_sec=0)
    path = [sid for sid, _ in path_with_lines]
    assert path == ["A", "B", "D"]
    assert cost == 180

    # Start with initial wait 300
    path_with_lines, cost = _dijkstra("A", "D", graph, initial_wait_sec=300)
    path = [sid for sid, _ in path_with_lines]
    assert path == ["A", "B", "D"]
    assert cost == 480

    # Preferred line Test -> Force the algo to prioritize line "1" explicitly
    path_with_lines, cost = _dijkstra("A", "D", graph, initial_wait_sec=0, preferred_lines=frozenset(["1"]))
    path = [sid for sid, _ in path_with_lines]
    assert path == ["A", "B", "C", "D"]
    assert cost == 300
