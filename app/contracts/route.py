from pydantic import BaseModel

class RouteSignalSchema(BaseModel):
    eta_minutes: float
    predicted_delay_minutes: float

class RouteRequest(BaseModel):
    candidates: list[dict]
    signals: list[RouteSignalSchema]

class RouteResponse(BaseModel):
    routes: list[dict]