from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from model import JobLibModel

app = FastAPI(
    title="OnTime ML Microservice",
    description="Dedicated API for serving machine learning predictions for the OnTime transit app."
)

# Load the model once when the app starts
try:
    ml_model = JobLibModel()
except FileNotFoundError as e:
    raise RuntimeError(f"Failed to load model: {e}")

class PredictionRequest(BaseModel):
    route_name:   str
    direction:    str
    stop_id:      str
    day_of_week:  str
    hour:         int
    month:        int
    year:         int
    stop_sequence: int
    season:       str
    count:        int


@app.get("/health")
def health_check():
    """Simple endpoint to verify the service is running."""
    return {"status": "healthy", "current_model": ml_model._model_name}


@app.post("/predict")
def predict_endpoint(request: PredictionRequest):
    """
    Main endpoint for taking feature data and returning a delay prediction.
    """
    try:
        result = ml_model.predict(request.model_dump())
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))