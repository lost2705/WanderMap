# WanderMap

WanderMap is an AI-native personal travel map. This repository currently contains the Milestone 0.1 backend foundation only.

## Prerequisites

- Java 21
- Docker Desktop with Docker Compose
- Internet access on the first Maven Wrapper run

## Start PostgreSQL/PostGIS

Create a local environment file, then start the database:

```bash
cp .env.example .env
docker compose up -d
```

On PowerShell, use `Copy-Item .env.example .env`.

The defaults create a database named `wandermap` with username and password `wandermap`.

## Run the application

With the database running:

```bash
./mvnw spring-boot:run
```

On PowerShell:

```powershell
.\mvnw.cmd spring-boot:run
```

To use different connection values, set `WANDERMAP_DB_URL`, `WANDERMAP_DB_USERNAME`, and `WANDERMAP_DB_PASSWORD`.

## Run tests

Docker must be running because the integration test starts a PostGIS container with Testcontainers.

```bash
./mvnw --batch-mode verify
```

## Health check

After the application starts, call:

```bash
curl http://localhost:8080/api/health
```

The endpoint returns HTTP 200 with a response containing `"status":"UP"` when the application and database are healthy.
