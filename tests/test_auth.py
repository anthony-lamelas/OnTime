from fastapi.testclient import TestClient
from app.main import app
from tests.conftest import MOCK_USER_EMAIL, MOCK_USER_PASSWORD, MOCK_USER_ID, MOCK_USER_HASHED

client = TestClient(app)

def test_login_success(mock_db_session):
    mock_db_session.fetchrow.return_value = {"id": MOCK_USER_ID, "hashed_password": MOCK_USER_HASHED}
    
    response = client.post(
        "/api/auth/login",
        data={"username": MOCK_USER_EMAIL, "password": MOCK_USER_PASSWORD},
    )
    
    assert response.status_code == 200
    assert "access_token" in response.json()
    assert response.json()["token_type"] == "bearer"


def test_login_incorrect_password(mock_db_session):
    mock_db_session.fetchrow.return_value = {"id": MOCK_USER_ID, "hashed_password": MOCK_USER_HASHED}
    
    response = client.post(
        "/api/auth/login",
        data={"username": MOCK_USER_EMAIL, "password": "wrongpassword"},
    )
    
    assert response.status_code == 400
    assert response.json()["detail"] == "Incorrect email or password"
