from dataclasses import dataclass

@dataclass
class RouteSignals:
    eta_minutes: float
    delay_probability: float
    preference_score: float
    safety_score: float
    ml_confidence: float

WEIGHTS = {
    "eta": 0.35,
    "delay_risk": 0.25,
    "preference": 0.20,
    "safety": 0.15,
    "uncertainty_penalty": 0.05,
}

ETA_MAX_MINUTES = 120

def score_route(signals: RouteSignals) -> float:
    eta_norm = 1 - (signals.eta_minutes / ETA_MAX_MINUTES) # lower ETA = higher score
    uncertainty_penalty = 1 - signals.ml_confidence

    return (
        WEIGHTS["eta"] * eta_norm +
        WEIGHTS["delay_risk"] * (1 - signals.delay_probability) +
        WEIGHTS["preference"] * signals.preference_score +
        WEIGHTS["safety"] * signals.safety_score -
        WEIGHTS["uncertainty_penalty"] * uncertainty_penalty
    )

def rank_routes(candidates: list[dict], route_signals: list[RouteSignals]) -> list[dict]:
    scored = [
        {**route, "score": score_route(signals)}
        for route, signals in zip(candidates, route_signals)
    ]
    return sorted(scored, key=lambda x: x["score"], reverse=True)