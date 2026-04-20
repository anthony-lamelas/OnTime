import pytest
from unittest.mock import AsyncMock

from app.main import app
from app.api import deps
from app.core.security import get_password_hash

# Common mock data
MOCK_USER_ID = 1
MOCK_USER_EMAIL = "test@example.com"
MOCK_USER_PASSWORD = "securepassword123"
MOCK_USER_HASHED = get_password_hash(MOCK_USER_PASSWORD)

@pytest.fixture
def mock_db_session():
    """Fixture to mock the database connection for endpoints."""
    mock_conn = AsyncMock()
    
    async def get_mock_db():
        yield mock_conn
        
    app.dependency_overrides[deps.get_db] = get_mock_db
    yield mock_conn
    app.dependency_overrides.clear()
