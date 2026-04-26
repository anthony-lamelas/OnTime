from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import MOCK_USER_EMAIL, MOCK_USER_PASSWORD, MOCK_USER_ID, MOCK_USER_HASHED
import json

client = TestClient(app)

def test_create_favorite_route(mock_db_session):
    mock_db_session.fetchrow.side_effect = [
        {"id": MOCK_USER_ID, "hashed_password": MOCK_USER_HASHED},
        {"id": MOCK_USER_ID, "email": MOCK_USER_EMAIL} 
    ]
    
    mock_db_session.fetchval.return_value = 100 
    
    login_response = client.post("/api/auth/login", data={"username": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD})
    token = login_response.json()["access_token"]
    
    payload = {
        "name": "Work Commute",
        "origin": {"lat": 40.71, "lon": -74.00, "label": "Home"},
        "destination": {"lat": 40.75, "lon": -73.98, "label": "Work"}
    }
    
    response = client.post(
        "/api/favorites/routes",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert response.json()["id"] == 100
    assert response.json()["name"] == payload["name"]

def test_get_favorite_routes(mock_db_session):
    mock_db_session.fetchrow.side_effect = [
        {"id": MOCK_USER_ID, "hashed_password": MOCK_USER_HASHED},
        {"id": MOCK_USER_ID, "email": MOCK_USER_EMAIL}
    ]
    
    mock_db_session.fetch.return_value = [
        {
            "id": 100, 
            "name": "Work Commute", 
            "origin": '{"lat": 40.71, "lon": -74.00, "label": "Home"}', 
            "destination": '{"lat": 40.75, "lon": -73.98, "label": "Work"}'
        }
    ]
    
    login_response = client.post("/api/auth/login", data={"username": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD})
    token = login_response.json()["access_token"]
    
    response = client.get(
        "/api/favorites/routes",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["id"] == 100

def test_create_favorite_location(mock_db_session):
    mock_db_session.fetchrow.side_effect = [
        {"id": MOCK_USER_ID, "hashed_password": MOCK_USER_HASHED},
        {"id": MOCK_USER_ID, "email": MOCK_USER_EMAIL}
    ]
    mock_db_session.fetchval.return_value = 200
    
    login_response = client.post("/api/auth/login", data={"username": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD})
    token = login_response.json()["access_token"]
    
    payload = {
        "name": "Gym",
        "location": {"lat": 40.72, "lon": -73.99, "label": "Planet Fitness"}
    }
    
    response = client.post(
        "/api/favorites/locations",
        json=payload,
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert response.json()["id"] == 200

def test_get_favorite_locations(mock_db_session):
    mock_db_session.fetchrow.side_effect = [
        {"id": MOCK_USER_ID, "hashed_password": MOCK_USER_HASHED},
        {"id": MOCK_USER_ID, "email": MOCK_USER_EMAIL}
    ]
    
    mock_db_session.fetch.return_value = [
        {
            "id": 200, 
            "name": "Gym", 
            "location": '{"lat": 40.72, "lon": -73.99, "label": "Planet Fitness"}'
        }
    ]
    
    login_response = client.post("/api/auth/login", data={"username": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD})
    token = login_response.json()["access_token"]
    
    response = client.get(
        "/api/favorites/locations",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert response.json()[0]["location"]["lat"] == 40.72
