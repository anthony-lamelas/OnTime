from fastapi import APIRouter
from app.contracts.route import RouteRequest, RouteResponse
from app.services.route_scorer import rank_routes, RouteSignals

router = APIRouter()

@router.post("/recommend", response_model=RouteResponse)
def recommend_routes(req: RouteRequest):
    signals_list = [RouteSignals(**s.model_dump()) for s in req.signals]
    ranked = rank_routes(req.candidates, signals_list)
    return RouteResponse(routes=ranked)