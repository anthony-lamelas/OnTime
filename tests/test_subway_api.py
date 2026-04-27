from unittest.mock import patch
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_stations():
    response = client.get("/api/subway/stations")
    assert response.status_code == 200
    assert len(response.json()) > 0
    assert "id" in response.json()[0]

@patch("app.api.endpoints.subway.next_departure_minutes")
@patch("app.api.endpoints.subway.departure_times_by_line")
def test_plan_trip(mock_departure_times, mock_next_departure):
    mock_next_departure.return_value = 5
    mock_departure_times.return_value = {"1": {"minutes": 5, "live": False}}

    payload = {
        "origin_lat": 40.7128,
        "origin_lon": -74.0060,
        "dest_lat": 40.7580,
        "dest_lon": -73.9855
    }

    response = client.post("/api/subway/plan", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert "routes" in data
    assert len(data["routes"]) > 0

    top = data["routes"][0]
    assert top["route"]["found"] is True
    assert "travel_time" in top
    assert "score" in top
    assert "lines" in top

@patch("app.api.endpoints.subway.get_live_subway_data")
def test_live_subway_data(mock_get_live):
    mock_get_live.return_value = {"status": "Good Service", "trains": []}
    
    response = client.get("/api/subway/live?line=A")
    assert response.status_code == 200
    assert response.json()["status"] == "Good Service"
