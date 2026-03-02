from abc import ABC, abstractmethod
import random

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

# Factory function to easily swap models based on an environment variable later
def get_model(model_name: str = "dummy") -> MLModel:
    if model_name.lower() == "dummy":
        return DummyModel()
    # Add actual models here later:
    else:
        raise ValueError(f"Unknown model type: {model_name}")
