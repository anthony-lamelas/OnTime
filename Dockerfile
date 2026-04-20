FROM python:3.12-slim

# Prevent Python from writing .pyc files
ENV PYTHONDONTWRITEBYTECODE=1
# Prevent Python from buffering stdout and stderr
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Copy dependency requirements and build them cleanly without caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Map standard environment payload
COPY . .

# Route application cleanly against production Gunicorn bindings
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
