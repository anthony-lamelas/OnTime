import pytest
from app.services.route_scorer import RouteSignals, score_route, rank_routes

pytestmark = pytest.mark.unit

def make_signals(**overrides) -> RouteSignals:
    defaults = dict(
        eta_minutes=30.0,
        predicted_delay_minutes=0.0,
    )
    return RouteSignals(**{**defaults, **overrides})

def test_score_is_a_float():
    assert isinstance(score_route(make_signals()), float)

def test_lower_eta_scores_better_which_means_lower():
    fast = make_signals(eta_minutes=10.0)
    slow = make_signals(eta_minutes=60.0)
    assert score_route(fast) < score_route(slow)

def test_higher_delay_increases_score_which_is_worse():
    low_delay = make_signals(predicted_delay_minutes=0.0)
    high_delay = make_signals(predicted_delay_minutes=10.0)
    assert score_route(high_delay) > score_route(low_delay)

def test_score_is_sum_of_eta_and_delay():
    signals = make_signals(eta_minutes=15.0, predicted_delay_minutes=5.0)
    assert score_route(signals) == 20.0

def make_candidate(name: str) -> dict:
    return {"id": name}

def test_rank_routes_returns_all_candidates():
    candidates = [make_candidate("A"), make_candidate("B"), make_candidate("C")]
    signals = [make_signals(), make_signals(), make_signals()]
    result = rank_routes(candidates, signals)
    assert len(result) == 3

def test_ranked_routes_are_sorted_lowest_score_first():
    candidates = [make_candidate("slow"), make_candidate("fast")]
    signals = [make_signals(eta_minutes=90.0), make_signals(eta_minutes=10.0)]
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
    score_route(make_signals(eta_minutes=0.0))