import os
import json
import numpy as np
import joblib


def _encode(le, val: str) -> int:
    """Encode a single value using a fitted LabelEncoder; map unknowns to 0."""
    s = str(val)
    return int(le.transform([s])[0]) if s in set(le.classes_) else 0


def _build_feature_vector(features: dict, expected_features: list, encoders: dict) -> list:
    """Convert a raw request dict into the numeric feature vector the model expects."""
    hour  = float(features.get("hour", 0))
    month = float(features.get("month", 0))

    vector_map = {
        "stop_sequence":  float(features.get("stop_sequence", 0)),
        "hour":           hour,
        "count":          float(features.get("count", 0)),
        "year":           float(features.get("year", 2025)),
        "month":          month,
        "hour_sin":       np.sin(2 * np.pi * hour / 24),
        "hour_cos":       np.cos(2 * np.pi * hour / 24),
        "month_sin":      np.sin(2 * np.pi * month / 12),
        "month_cos":      np.cos(2 * np.pi * month / 12),
        "is_rush_hour":   int(hour in [7, 8, 9, 16, 17, 18]),
        "is_late_night":  int(hour in [0, 1, 2, 3, 4]),
        "route_name_enc": _encode(encoders["route_name"],  features.get("route_name", "")),
        "direction_enc":  _encode(encoders["direction"],   features.get("direction", "")),
        "stop_id_enc":    _encode(encoders["stop_id"],     features.get("stop_id", "")),
        "day_of_week_enc":_encode(encoders["day_of_week"], features.get("day_of_week", "")),
        "season_enc":     _encode(encoders["season"],      features.get("season", "")),
    }

    return [vector_map[feat] for feat in expected_features]


class JobLibModel:
    """
    Loads delay_model.joblib and label_encoders.joblib produced by the
    model_comparison notebook and serves predictions via predict().
    """

    MODEL_PATH    = os.path.join(os.path.dirname(__file__), "models", "delay_model.joblib")
    ENCODERS_PATH = os.path.join(os.path.dirname(__file__), "models", "label_encoders.joblib")
    META_PATH     = os.path.join(os.path.dirname(__file__), "models", "model_meta.json")

    def __init__(self):
        self._model    = joblib.load(self.MODEL_PATH)
        self._encoders = joblib.load(self.ENCODERS_PATH)
        with open(self.META_PATH) as f:
            self._meta = json.load(f)
        self._features   = self._meta["features"]
        self._model_name = self._meta["model_name"]
        print(f"Loaded '{self._model_name}' with {len(self._features)} features.")

    def predict(self, features: dict) -> dict:
        vector = _build_feature_vector(features, self._features, self._encoders)
        raw = float(self._model.predict([vector])[0])
        return {
            "predicted_delay_seconds": round(raw, 2),
            "predicted_delay_minutes": round(raw / 60, 3),
            "model_used": self._model_name,
        }
