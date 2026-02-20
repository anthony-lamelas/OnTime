## Prerequisites

Before you begin, ensure you have the following installed on your machine:

1.  **Python 3.10+**
2.  **Docker Desktop** (Make sure it is running!)

---

## Initial Setup

Follow these steps to configure your local development environment for the first time.

### 1. Set up the Python Virtual Environment

```bash
# Create the virtual environment (only needed the first time)
python -m venv venv

# Activate the virtual environment
.\venv\Scripts\activate
```

### 2. Install Dependencies

With your virtual environment activated, install the required Python packages:

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

The application requires certain environment variables to run.

1.  Copy the `.env.example` file and rename it to `.env`.
2.  The default `.env` is already pre-configured for local Docker development. It contains the local connection string for PostgreSQL (`postgresql://postgres:postgres@localhost:5433/ontime`) and a default `SECRET_KEY` for JWT tokens.

---

## Running the Application Locally

### 1. Start the Database

In your terminal, ensure you are in the project root and run:

```bash
docker-compose up -d
```

*Note: This will download PostgreSQL and map it to port `5433` on your host machine to avoid conflicts.*

### 2. Start the FastAPI Server

Ensure your virtual environment is activated (`.\venv\Scripts\activate`). Then, start the backend development server using `uvicorn`:

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The `--reload` flag means the server will automatically restart whenever you save changes to your Python code.

### 3. Viewing the Database (pgAdmin)

The `docker-compose.yml` file also spins up **pgAdmin**, a web-based GUI for PostgreSQL.

1. Navigate to [http://localhost:5050](http://localhost:5050) in your browser.
2. Login with the default credentials:
   - **Email:** `admin@admin.com`
   - **Password:** `admin`
3. Click "Add New Server":
   - **General Tab:** Name it whatever you like (e.g., "OnTime Local").
   - **Connection Tab:** Use the following settings:
     - **Host name/address:** `db`  *(This is the internal docker network name for Postgres)*
     - **Port:** `5432`
     - **Username:** `postgres`
     - **Password:** `postgres`
4. Save

---

## Exploring the API Documentation

FastAPI automatically generates interactive API documentation. While your local server is running, you can access these at:

*   **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) (Interactive documentation allowing you to test endpoints directly in your browser).
*   **ReDoc:** [http://127.0.0.1:8000/redoc](http://127.0.0.1:8000/redoc) (More detailed alternative documentation format).

## Stopping the Environment

To stop the FastAPI server, press `Ctrl+C` in the terminal where it is running.

To stop the Docker database container, run:

```bash
docker-compose down
```

---

## Repository Structure

Here is a brief overview of how the backend code is organized:

```text
OnTime/
├── app/                        # Main application code
│   ├── api/                    # API Route Handlers
│   │   ├── endpoints/          # Specific endpoint files (e.g., users.py, auth.py)
│   │   ├── api.py              # Main router combining all endpoints
│   │   └── deps.py             # Reusable dependencies (like get_db or get_current_user)
│   ├── core/                   # Core application configurations
│   │   ├── config.py           # Uses pydantic-settings to load .env variables
│   │   └── security.py         # Password hashing and JWT token creation logic
│   ├── db/                     # Database setup and interaction
│   │   ├── init_db.py          # Script to run schema.sql when the app starts
│   │   ├── schema.sql          # Raw SQL commands to create database tables
│   │   └── session.py          # Creates the psycopg2 SimpleConnectionPool
│   ├── schemas/                # Pydantic (JSON) models
│   │   ├── token.py            # Datatypes for JWT tokens
│   │   └── user.py             # Datatypes for incoming/outgoing User payloads
│   └── main.py                 # FastAPI application entry point
├── .env                        # Local environment variables (do not commit to Git)
├── docker-compose.yml          # Instructions for Docker to run PostgreSQL locally
└── requirements.txt            # Pinned Python package dependencies
```