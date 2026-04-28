# 12. Deployment Architecture

## 12.1 Physical Deployment Architecture Diagram

The physical deployment architecture for the OnTime transit application leverages a single-node cloud deployment model hosted on Amazon Web Services (AWS). It utilizes Docker containerization to orchestrate the internal microservices, database engine, and frontend web server securely within an isolated virtual network bridge.

```mermaid
flowchart TD
    classDef transparentBkg fill:transparent,stroke:#888,stroke-width:2px;

    MTA[MTA Open Data API]

    subgraph Client [Client Environment]
        Browser[Web Browser]
    end

    subgraph AWS [AWS Cloud Infrastructure]
        subgraph EC2 [EC2 Production Instance<br/>Ubuntu Linux]
            Certs[Let's Encrypt SSL Volume]
            DataVolume[(PostgreSQL Persistent Volume)]

            subgraph Docker [Docker Engine Network]
                Front[Nginx Reverse Proxy<br/>React SPA]
                Back[Core FastAPI<br/>Application]
                ML[LightGBM FastAPI<br/>Microservice]
                DB[(PostgreSQL 15)]
            end
        end
    end

    class Client,AWS,EC2,Docker transparentBkg;

    Browser -- "HTTPS (Port 443)" --> Front
    Front -- "Reverse Proxy (Port 8000)" --> Back
    Back -- "Internal HTTP (Port 8001)" --> ML
    Back -- "asyncpg (Port 5432)" --> DB
    Back -- "External HTTP GET" --> MTA

    Front -.->|"Reads keys via read-only mount"| Certs
    DB -.->|"Persists state to block storage"| DataVolume
```

### 12.1.1 Deployment Node Descriptions

**1. AWS EC2 Production Instance (Ubuntu Linux)**
*   **Role:** The primary physical execution environment (Virtual Machine). It provides the underlying compute logic, network security groups, and memory required to host the platform.
*   **Persistent Storage:** Maintains physical block storage (`ontime_postgres_prod_data`) to ensure relational data outlives container lifecycles, and maintains local Let's Encrypt SSL certificates.

**2. Docker Engine (Container Orchestration)**
*   **Role:** Acts as the virtualized execution layer isolating dependencies. It wraps the application logic into four independent nodes (`db`, `backend`, `ml_service`, `frontend`), bridging them internally so they can communicate without exposing the database or internal APIs to the public web.

**3. Client Environment**
*   **Role:** The end-user physical node. It downloads the compiled React application (HTML/JS/CSS) and Mapbox GL geometries over a secure HTTPS connection, rendering the user interface locally on their device processors.

**4. MTA Open Data API**
*   **Role:** The external third-party infrastructure node providing real-time GTFS transit feeds to the backend system.
