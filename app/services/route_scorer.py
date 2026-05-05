from dataclasses import dataclass

@dataclass
class RouteSignals:
    eta_minutes: float
    predicted_delay_minutes: float


def score_route(signals: RouteSignals) -> float:
    return signals.eta_minutes + signals.predicted_delay_minutes

def rank_routes(candidates: list[dict], route_signals: list[RouteSignals]) -> list[dict]:
    scored = [
        {**route, "score": score_route(signals)}
        for route, signals in zip(candidates, route_signals)
    ]
    return sorted(scored, key=lambda x: x["score"], reverse=False)