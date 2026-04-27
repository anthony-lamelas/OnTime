# 10. SYSTEM-WIDE DESIGN DECISIONS

*Note: As per section requirements, ensure that all Functional Requirements (Use Case, Use Case Diagrams), Non-Functional Requirements, and Domain Requirements have been updated prior to formalizing this section.*

## Process Architecture Diagrams

Because the OnTime system consists of both real-time user serving and asynchronous model training, the process architecture is divided into two distinct sequence diagrams to encompass all seven core components.

### 1. Live Trip Routing (User Interaction)
The primary system function: generating an optimized, ML-scored subway route for commutters.

```mermaid
sequenceDiagram
    actor User
    participant UI as Web Application Interface
    participant API as Prediction API
    participant Routing as Recommendation Engine
    participant DB as Cloud Deployment Infrastructure
    participant ML as Machine Learning Model

    User->>UI: Submit Origin, Destination, Preferences
    UI->>API: HTTP POST /plan
    API->>Routing: Delegate route calculation
    Routing->>DB: fetchCachedGraph()
    Routing->>DB: fetchLiveGTFSStatus()
    DB-->>Routing: Return real-time departures
    Routing->>Routing: Execute Time-Weighted Dijkstra calculation
    Routing->>ML: request_delay_prob(features)
    ML-->>Routing: return_delay_mins()
    Routing->>Routing: Rank candidates via Scorer
    Routing-->>API: Return Ranked Routes
    API-->>UI: 200 OK + Payload JSON
    UI-->>User: Render Mapbox Visualization
```

### 2. Offline Model Training (Data Pipeline)
The asynchronous backend process where data science operations prepare the logic used by the ML service. 

```mermaid
sequenceDiagram
    actor Data Scientist
    participant Ext as MTA Open Data (External)
    participant Collection as Data Collection Module
    participant Preprocess as Data Preprocessing Module
    participant ML as Machine Learning Model
    participant DB as Cloud Deployment Infrastructure

    Data Scientist->>Collection: triggerDataIngestion()
    Collection->>Ext: Fetch historical MTA performance logs
    Ext-->>Collection: Raw CSV / JSON payloads
    Collection->>Preprocess: passRawData()
    Preprocess->>Preprocess: Normalize, map categorical features
    Preprocess->>Preprocess: Perform feature engineering (sin/cos cycles)
    Preprocess->>ML: trainModel(processed_features)
    ML->>ML: Fit classifier/regressor
    ML->>DB: deployTrainedJoblibModel()
    DB-->>Data Scientist: Report deployment success
```

---

## 10.1 Software Component Architectural Design

Using the updated set of Functional Requirements, Non-Functional Requirements, and Domain Requirements, the OnTime system decomposes into seven strict sub-components.

### 10.1.1 System Component Relationships (Overview)
*This diagram illustrates how the seven primary components interface and relate to one another within the system boundary.*

```mermaid
flowchart TD
    %% System Component Relationships
    WAI["Web Application<br/>Interface"]
    API["Prediction API"]
    RE["Recommendation<br/>Engine"]
    ML["Machine Learning<br/>Model"]
    DCM["Data Collection<br/>Module"]
    DPM["Data Preprocessing<br/>Module"]
    CDI["Cloud Deployment<br/>Infrastructure"]

    WAI -->|"HTTPS / JSON"| API
    API -->|"Internal<br/>Routing"| RE
    RE -->|"Inference<br/>Protocol"| ML
    RE -->|"SQL Queries /<br/>Graph Retrieval"| CDI
    ML -.->|"Deployed<br/>inside"| CDI

    DCM -->|"Offline MTA<br/>Submissions"| DPM
    DPM -->|"Engineered<br/>Features"| ML
```

### 10.1.2 Individual Component Architecture

**1. Data Collection Module**
```mermaid
flowchart LR
    MTA[MTA Open Data API] --> Fetcher[Python Fetcher Script]
    Fetcher --> RawStorage[(Raw CSV Storage)]
```

**2. Data Preprocessing Module**
```mermaid
flowchart LR
    Raw[(Raw CSV Storage)] --> Cleaner[Data Cleaner / Imputer]
    Cleaner --> Engineer[Feature Engineer cyclical]
    Engineer --> Vector[Vector Output Store]
```

**3. Machine Learning Model**
```mermaid
flowchart TD
    Input[Training Vectors] --> RF[Random Forest Schema]
    RF --> Eval[Model Scorer & Validator]
    Eval --> Exporter[Joblib Exporter]
```

**4. Prediction API**
```mermaid
flowchart TD
    Gateway[FastAPI Application] --> Auth[Security & JWT Controller]
    Gateway --> PlanRoute[Trip Planner Endpoint]
    Gateway --> Session[Asyncpg Middleware]
```

**5. Recommendation Engine**
```mermaid
flowchart TD
    Engine[Core Recommendation Controller] --> Graph[Graph State Traverser]
    Engine --> Penalty[Transfer Penalty Manager]
    Engine --> Ranker[Route Scorer & Ranker]
```

**6. Web Application Interface**
```mermaid
flowchart TD
    DOM[React DOM Tree] --> Components[Form & Route List UI]
    DOM --> Context[Secure State Manager]
    DOM --> Map[Mapbox GL Visualization Engine]
```

**7. Cloud Deployment Infrastructure**
```mermaid
flowchart LR
    Docker[Docker Compositing Interface] --> DB[(PostgreSQL Engine)]
    Docker --> Volumes[Persistent Docker Volumes]
    Docker --> Services[Containerized FastAPI Host]
```

---

## 10.2 Software Architecture General Description

**Decoupled Microservice Architecture**
The architecture is divided into three primary deployable artifacts: the React SPA Frontend, the Core FastAPI Backend, and the Machine Learning FastAPI Microservice. 

**Rationale for Decomposition:**
1. **Memory & Compute Isolation:** The core application operates on I/O-bound processes (database queries, network requests to MTA GTFS feeds), benefiting from asynchronous event loops. In contrast, the `ML Delay Prediction Service` needs to hold bulky static `joblib` models (e.g., Random Forest) and Scikit-Learn transformers in memory. Running them independently guarantees that CPU-heavy ML predictions do not block the concurrent network thread pool.
2. **Horizontal Scalability:** The delay prediction engine can scale independently of the web-serving API gateway under heavy network load traffic.
3. **Decoupled Frontend:** By serving the frontend via Vite/React independently, it can be hosted on a global CDN edge layer perfectly distinct from backend application processing.

---

## 10.3 Software Item Components

| Component | Functionality |
| :--- | :--- |
| **Frontend User Interface** | Captures user queries (locational data, preferred lines), displays the responsive Mapbox interface, and renders ranked dynamic itineraries. |
| **Map Engine Component** | A localized instance wrapping Mapbox GL to project graph nodes and visual routing paths onto spatial map layers natively in the browser. |
| **API Gateway / API Router** | Exposes the overarching REST API endpoints (`/plan`, `/live`, routes for users/auth). Funnels external internet traffic to specific backend sub-components and normalizes inputs using Pydantic models. |
| **Security & Authentication** | Validates user identity using JWT bearer tokens. Enforces access controls for submitting user reviews or persisting favorite routes. |
| **Subway Routing Engine** | Computes the mathematical shortest path using a custom Time-Weighted Dijkstra algorithm, integrating literal pedestrian traverse durations and inter-station transfer penalties. |
| **GTFS Live Feed Integrator** | Connects dynamically to the MTA real-time GTFS feeds to replace static historical schedule waits with precise, live subway departures. |
| **ML Delay Prediction Service** | Accepts formatted telemetry (date, cyclical hour, rush hour mapping, stops) and executes an inference tree to anticipate system-wide subway delays in seconds. |
| **Database Session Manager** | Creates, pools, and gracefully terminates asynchronous `asyncpg` connections mapped to PostgreSQL schemas ensuring safe concurrency states. |

---

## 10.4 Component Interface Identification

*Note: Interface IDs establish authoritative boundaries between the architecture's decoupled services.*

- **ID:** `IF-01`
- **Name:** `SubmitRouteQuery`
- **Description:** Sends validated origin/destination coordinates and user-defined constraints (preferred target line, max walking) securely over HTTPS via JSON payload.
- **Component 1:** Frontend User Interface
- **Component 2:** API Gateway / API Router

- **ID:** `IF-02`
- **Name:** `RequestDelayInference`
- **Description:** Sends raw localized features asynchronously via internal Docker network HTTP POST; awaits a scalar prediction response matching the expected delay impact.
- **Component 1:** Subway Routing Engine
- **Component 2:** ML Delay Prediction Service

- **ID:** `IF-03`
- **Name:** `QueryLiveFeeds`
- **Description:** Pulls aggregated protocol buffer files directly from the MTA server endpoint arrays, translating standard encoded GTFS data into workable application dictionaries.
- **Component 1:** GTFS Live Feed Integrator
- **Component 2:** External System (MTA API)

- **ID:** `IF-04`
- **Name:** `PersistStateInteraction`
- **Description:** Dispatches asynchronous SQL transactions to append or query favorite endpoints and user profile payloads.
- **Component 1:** Database Session Manager
- **Component 2:** Persistence Layer (PostgreSQL)

---

## 10.5 Software Component Concept of Execution

### API Gateway
- **Motive / Event:** The user initiates an HTTP request directly to the server to establish an authenticated session or query for a transit route.
- **Expected Outcome:** Validates the schema via Pydantic; routes the event to corresponding logic controllers and safely guarantees an HTTP 2xx or 4xx status response JSON is serialized and returned.

### Subway Routing Engine
- **Motive / Event:** Received instructions from the API Gateway to fulfill a `/plan` POST constraint set containing coordinate matrices.
- **Expected Outcome:** Iterates algorithmically through valid graph paths, pings the live feed and ML service for penalizations, and guarantees the return of a ranked JSON blob containing travel times, walking distances, and ordered routing lists.

### ML Delay Prediction Service
- **Motive / Event:** Awakens solely upon receiving a local HTTP callback trigger (`/predict`) from the backend architecture carrying standardized dictionary properties.
- **Expected Outcome:** Parses the cyclic time identifiers through Scikit-Learn transformers, executes the `.predict()` wrapper on the static Random Forest schema, and returns normalized seconds of expected delay stringently mapped to the requested train line.

### GTFS Live Feed Integrator
- **Motive / Event:** Executed continuously as requested by the Routing Engine or asynchronously via the `/live` public API gateway ping.
- **Expected Outcome:** Retrieves up-to-date protocol buffers, successfully extracting next-station wait times without thread blockage. Returns integer values representing immediate seconds-until-arrival.
