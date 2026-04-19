from typing import Optional
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440
    ML_API_URL: Optional[str] = None

    # Scorer weights
    WEIGHT_ETA: float = 0.35
    WEIGHT_DELAY_RISK: float = 0.25
    WEIGHT_PREFERENCE: float = 0.20
    WEIGHT_SAFETY: float = 0.15
    WEIGHT_UNCERTAINTY_PENALTY: float = 0.05
    ETA_MAX_MINUTES: float = 120.0

    class Config:
        env_file = ".env"

settings = Settings()
