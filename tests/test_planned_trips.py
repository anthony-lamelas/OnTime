from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import MOCK_USER_EMAIL, MOCK_USER_PASSWORD, MOCK_USER_ID, MOCK_USER_HASHED

client = TestClient(app)

def test_create_planned_trip(mock_db_session):
    mock_db_session.fetchrow.side_effect = [
        {"id": MOCK_USER_ID, "hashed_password": MOCK_USER_HASHED},
        {"id": MOCK_USER_ID, "email": MOCK_USER_EMAIL}
    ]
    mock_db_session.fetchval.side_effect = [None, 300]
    
    login_response = client.post("/api/auth/login", data={"username": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD})
    token = login_response.json()["access_token"]
    
    payload = {
        "origin": {"lat": 40.71, "lon": -74.00, "label": "Home"},
        "destination": {"lat": 40.75, "lon": -73.98, "label": "Work"},
        "date": "2024-05-10",
        "time": "08:30"
    }
    
    response = client.post(
        "/api/planned_trips/",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert response.json()["id"] == 300
    assert response.json()["date"] == "2024-05-10"

def test_get_planned_trips(mock_db_session):
    mock_db_session.fetchrow.side_effect = [
        {"id": MOCK_USER_ID, "hashed_password": MOCK_USER_HASHED},
        {"id": MOCK_USER_ID, "email": MOCK_USER_EMAIL}
    ]
    
    mock_db_session.fetch.return_value = [
        {
            "id": 300,
            "origin": '{"lat": 40.71, "lon": -74.00, "label": "Home"}',
            "destination": '{"lat": 40.75, "lon": -73.98, "label": "Work"}',
            "trip_date": "2024-05-10",
            "trip_time": "08:30"
        }
    ]
    
    login_response = client.post("/api/auth/login", data={"username": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD})
    token = login_response.json()["access_token"]
    
    response = client.get(
        "/api/planned_trips/",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == 300
