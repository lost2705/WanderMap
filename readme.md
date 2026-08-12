# WanderMap

WanderMap is an AI-native personal travel map. It currently exposes the Milestone 0.2 Travel Core REST API.

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

## Travel Core API quick start

Create a trip, add a stop, and retrieve its itinerary:

```bash
curl -X POST http://localhost:8080/api/trips \
  -H "Content-Type: application/json" \
  -d '{"name":"Italy 2026","startDate":"2026-05-10","endDate":"2026-05-21"}'

curl -X POST http://localhost:8080/api/trips/{tripId}/stops \
  -H "Content-Type: application/json" \
  -d '{"countryCode":"IT","cityName":"Rome"}'

curl http://localhost:8080/api/trips/{tripId}
curl http://localhost:8080/api/countries
curl http://localhost:8080/api/health
```

`PATCH /api/trips/{tripId}` replaces trip details: `name` is required, while omitted or `null` dates clear the corresponding date. It is not JSON Merge Patch. Unknown JSON fields are rejected with a `400` ProblemDetail response.
