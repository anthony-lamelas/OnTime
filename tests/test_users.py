from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import MOCK_USER_EMAIL, MOCK_USER_PASSWORD, MOCK_USER_ID, MOCK_USER_HASHED

client = TestClient(app)

def test_create_user(mock_db_session):
    mock_db_session.fetchone.side_effect = [None, (MOCK_USER_ID, MOCK_USER_EMAIL)]
    
    response = client.post(
        "/api/users/",
        json={"email": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD},
    )
    
    assert response.status_code == 200
    assert response.json() == {"id": MOCK_USER_ID, "email": MOCK_USER_EMAIL}


def test_create_user_already_exists(mock_db_session):
    mock_db_session.fetchone.return_value = (MOCK_USER_ID,)
    
    response = client.post(
        "/api/users/",
        json={"email": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD},
    )
    
    assert response.status_code == 400
    assert "already exists" in response.json()["detail"]


def test_read_user_me(mock_db_session):
    mock_db_session.fetchone.return_value = (MOCK_USER_ID, MOCK_USER_HASHED)
    
    login_response = client.post(
        "/api/auth/login",
        data={"username": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD},
    )
    token = login_response.json()["access_token"]
    
    mock_db_session.fetchone.return_value = (MOCK_USER_ID, MOCK_USER_EMAIL, MOCK_USER_HASHED)

    response = client.get(
        "/api/users/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    
    assert response.status_code == 200
    assert response.json() == {"id": MOCK_USER_ID, "email": MOCK_USER_EMAIL}
