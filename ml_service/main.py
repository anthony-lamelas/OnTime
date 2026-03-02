import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

from model import get_model

app = FastAPI(
    title="OnTime ML Microservice",
    description="Dedicated API for serving machine learning predictions for the OnTime transit app."
)

# Load the model once when the app starts. 
MODEL_TYPE = os.getenv("MODEL_TYPE", "dummy")
try:
    ml_model = get_model(MODEL_TYPE)
except ValueError as e:
    raise RuntimeError(f"Failed to load model: {e}")


class PredictionRequest(BaseModel):
    """
    TODO: Schema for the incoming data from the main backend.
    """
    features: Dict[str, Any]


@app.get("/health")
def health_check():
    """Simple endpoint to verify the service is running."""
    return {"status": "healthy", "current_model": MODEL_TYPE}


@app.post("/predict")
def predict_endpoint(request: PredictionRequest):
    """
    Main endpoint for taking feature data and returning a delay prediction.
    """
    try:
        # Pass the features to the currently loaded model
        result = ml_model.predict(request.features)
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
