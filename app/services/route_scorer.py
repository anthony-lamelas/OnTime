from dataclasses import dataclass
from app.core.config import settings

@dataclass
class RouteSignals:
    eta_minutes: float
    delay_probability: float
    preference_score: float
    safety_score: float
    ml_confidence: float


def score_route(signals: RouteSignals) -> float:
    eta_norm = 1 - (signals.eta_minutes / settings.ETA_MAX_MINUTES) # lower ETA = higher score
    uncertainty_penalty = 1 - signals.ml_confidence

    return (
        settings.WEIGHT_ETA * eta_norm +
        settings.WEIGHT_DELAY_RISK * (1 - signals.delay_probability) +
        settings.WEIGHT_PREFERENCE * signals.preference_score +
        settings.WEIGHT_SAFETY * signals.safety_score -
        settings.WEIGHT_UNCERTAINTY_PENALTY * uncertainty_penalty
    )

def rank_routes(candidates: list[dict], route_signals: list[RouteSignals]) -> list[dict]:
    scored = [
        {**route, "score": score_route(signals)}
        for route, signals in zip(candidates, route_signals)
    ]
    return sorted(scored, key=lambda x: x["score"], reverse=True)