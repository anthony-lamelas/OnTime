import pytest
from app.services.route_scorer import RouteSignals, score_route, rank_routes

pytestmark = pytest.mark.unit

def make_signals(**overrides) -> RouteSignals:
    defaults = dict(
        eta_minutes=30,
        delay_probability=0.2,
        preference_score=0.7,
        safety_score=0.8,
        ml_confidence=0.9,
    )
    return RouteSignals(**{**defaults, **overrides})

def test_score_is_a_float():
    assert isinstance(score_route(make_signals()), float)

def test_lower_eta_scores_higher():
    fast = make_signals(eta_minutes=10)
    slow = make_signals(eta_minutes=60)
    assert score_route(fast) > score_route(slow)

def test_lower_delay_probability_scores_higher():
    low_delay = make_signals(delay_probability=0.1)
    high_delay = make_signals(delay_probability=0.9)
    assert score_route(low_delay) > score_route(high_delay)

def test_higher_preference_scores_higher():
    liked = make_signals(preference_score=0.95)
    disliked = make_signals(preference_score=0.1)
    assert score_route(liked) > score_route(disliked)

def test_higher_safety_scores_higher():
    safe = make_signals(safety_score=1.0)
    unsafe = make_signals(safety_score=0.1)
    assert score_route(safe) > score_route(unsafe)

def test_low_confidence_penalises_score():
    confident = make_signals(ml_confidence=1.0)
    uncertain = make_signals(ml_confidence=0.1)
    assert score_route(confident) > score_route(uncertain)


def make_candidate(name: str) -> dict:
    return {"id": name}

def test_rank_routes_returns_all_candidates():
    candidates = [make_candidate("A"), make_candidate("B"), make_candidate("C")]
    signals = [make_signals(), make_signals(), make_signals()]
    result = rank_routes(candidates, signals)
    assert len(result) == 3

def test_ranked_routes_are_sorted_highest_first():
    candidates = [make_candidate("slow"), make_candidate("fast")]
    signals = [make_signals(eta_minutes=90), make_signals(eta_minutes=10)]
    result = rank_routes(candidates, signals)
    assert result[0]["id"] == "fast"

def test_ranked_routes_attaches_score():
    candidates = [make_candidate("A")]
    signals = [make_signals()]
    result = rank_routes(candidates, signals)
    assert "score" in result[0]

def test_ranked_routes_empty_input():
    assert rank_routes([], []) == []

# edge cases -------

def test_zero_eta_does_not_crash():
    score_route(make_signals(eta_minutes=0))

def test_perfect_route_scores_above_zero():
    perfect = make_signals(eta_minutes=1, delay_probability=0.0,
                           preference_score=1.0, safety_score=1.0, ml_confidence=1.0)
    assert score_route(perfect) > 0

def test_worst_route_scores_below_perfect():
    perfect = make_signals(eta_minutes=1, delay_probability=0.0,
                           preference_score=1.0, safety_score=1.0, ml_confidence=1.0)
    worst = make_signals(eta_minutes=120, delay_probability=1.0,
                         preference_score=0.0, safety_score=0.0, ml_confidence=0.0)
    assert score_route(perfect) > score_route(worst)