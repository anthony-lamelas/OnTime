from pydantic import BaseModel

class RouteSignalSchema(BaseModel):
    eta_minutes: float
    delay_probability: float
    preference_score: float
    safety_score: float
    ml_confidence: float

class RouteRequest(BaseModel):
    candidates: list[dict]
    signals: list[RouteSignalSchema]

class RouteResponse(BaseModel):
    routes: list[dict]