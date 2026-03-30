from abc import ABC, abstractmethod
import random
import os
import json
import numpy as np

# Feature engineering helpers
_DAY_OF_WEEK_MAP = {
    "Monday": 0, "Tuesday": 1, "Wednesday": 2, "Thursday": 3, "Friday": 4, "Saturday": 5, "Sunday": 6
}
_DIRECTION_MAP = {"Downtown/South": 0, "Uptown/North": 1}
_SEASON_MAP = {"Winter": 0, "Spring": 1, "Summer": 2, "Fall": 3}

def _build_feature_vector(features: dict, expected_features: list) -> list:
    """
    Converts raw API request dict into the exact numeric feature vector that the trained model expects.
    Mirrors engineer_features() function in the model_comparison notebook.
    """

    hour = float(features.get("hour", 0))
    month = float(features.get("month", 0))
    hour_sin = np.sin(2 * np.pi * hour / 24)
    hour_cos = np.cos(2 * np.pi * hour / 24)
    month_sin = np.sin(2 * np.pi * month / 12)
    month_cos = np.cos(2 * np.pi * month / 12)

    is_rush_hour = int(hour in [7, 8, 9, 16, 17, 18])
    is_late_night = int(hour in [0, 1, 2, 3, 4])

    route_enc = hash(str(features.get("route_name", ""))) % 100
    direction_enc = _DIRECTION_MAP.get(features.get("direction", ""), 0)
    stop_enc = hash(str(features.get("stop_id", ""))) % 1000
    dow_enc = _DAY_OF_WEEK_MAP.get(features.get("day_of_week", "Monday"), 0)
    season_enc = _SEASON_MAP.get(features.get("season", "Spring"), 1)

    vector_map = {
        "stop_sequence": float(features.get("stop_sequence", 0)),
        "hour": hour,
        "count":            float(features.get("count", 0)),
        "year":             float(features.get("year", 2025)),
        "month":            month,
        "hour_sin":         hour_sin,
        "hour_cos":         hour_cos,
        "is_rush_hour":     is_rush_hour,
        "is_late_night":    is_late_night,
        "month_sin":        month_sin,
        "month_cos":        month_cos,
        "route_name_enc":   route_enc,
        "direction_enc":    direction_enc,
        "stop_id_enc":      stop_enc,
        "day_of_week_enc":  dow_enc,
        "season_enc":       season_enc,
    }

    return [vector_map[feat] for feat in expected_features]

class MLModel(ABC):
    """Abstract base class for all ML models."""
    
    @abstractmethod
    def predict(self, features: dict) -> dict:
        """
        TODO: Takes a dictionary of features and returns a prediction dictionary.
        """
        pass

class DummyModel(MLModel):
    """A dummy model that returns random predictions for testing."""
    
    def __init__(self):
        print("Initialized Dummy Model for testing.")
        
    def predict(self, features: dict) -> dict:
        """
        Ignores features and returns a random prediction score
        """
        score = random.uniform(0.0, 1.0)
            
        return {
            "prediction_score": round(score, 3),
            "model_used": "DummyModel_v1",
            "received_features": features # Echoing back for debugging
        }

class JobLibModel(MLModel):
    """
    Loads a LightGMB model from ml_service/models/delay_model.joblib.

    The companion file models/model_meta.json stores the exact feature list and
    evaluation metrics produced by the training notebook.
    """

    MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "delay_model.joblib")
    META_PATH = os.path.join(os.path.dirname(__file__), "models", "model_meta.json")

    def __init__(self):
        import joblib

        if not os.path.exists(self.MODEL_PATH):
            raise FileNotFoundError(f"Trained model not found at {self.MODEL_PATH}. "
                                    "Run the model_comparison notebook first to train and save the model.")

        self._model = joblib.load(self.MODEL_PATH)

        with open(self.META_PATH) as f:
            self._meta = json.load(f)

        self._features = self._meta["features"]
        self._model_name = self._meta["model_name"]
        print(f"Loaded '{self._model_name}' with {len(self._features)} features.")

    def predict(self, features: dict) -> dict:
        vector = _build_feature_vector(features, self._features)
        raw_prediction = float(self._model.predict([vector])[0])

        return {
            "predicted_delay_seconds": round(raw_prediction, 2),
            "predicted_delay_minutes": round(raw_prediction / 60, 3),
            "model_used": self._model_name,
            "model_metrics": self._meta.get("metrics", {}),
        }

# Factory function to easily swap models based on an environment variable later
def get_model(model_name: str = "dummy") -> MLModel:
    if model_name.lower() == "dummy":
        return DummyModel()
    elif model_name.lower() == "trained":
        return JobLibModel()
    else:
        raise ValueError(f"Unknown model type: {model_name}")
