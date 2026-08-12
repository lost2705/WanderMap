# WanderMap

WanderMap is a visual travel journal for collecting trips and seeing their itineraries on an interactive world map. Milestone 0.3 adds a React + MapLibre application to the existing Spring Boot Travel Core: saved countries are highlighted, known cities appear as markers, and trips can be created and managed from the browser.

> Screenshot placeholder: start the backend and frontend locally to see the interactive map.

## What it does today

- create, edit, and delete trips with optional dates;
- add, reorder, and remove itinerary stops;
- preserve all travel data in PostgreSQL across browser refreshes;
- highlight persisted ISO country codes on a world map;
- show and focus city markers when stored coordinates are available.

## Prerequisites

- Java 21
- Docker Desktop with Docker Compose
- Node.js 24 and pnpm 11 (for the frontend)

## Run locally

Create a local environment file and start PostgreSQL/PostGIS:

```bash
cp .env.example .env
docker compose up -d
```

On PowerShell, use `Copy-Item .env.example .env`.

Start the backend in one terminal:

```bash
./mvnw spring-boot:run
```

On PowerShell, use `./mvnw.cmd spring-boot:run`.

Then start the frontend in another terminal:

```bash
cd frontend
pnpm install
pnpm dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Its development proxy forwards `/api` requests to Spring Boot at `http://localhost:8080`, so no permissive backend CORS configuration is needed.

To point the backend at another database, set `WANDERMAP_DB_URL`, `WANDERMAP_DB_USERNAME`, and `WANDERMAP_DB_PASSWORD`.

## Map and coordinates

`cities.latitude` and `cities.longitude` are nullable `NUMERIC(8,6)` and `NUMERIC(9,6)` values, guarded by database checks for valid world bounds. The application never requires a coordinate in order to create a stop.

For this milestone, `KnownCityLocationResolver` supplies a small, deterministic catalog of common cities (including Rome, Florence, Bologna, Venice, Paris, Madrid, London, Tokyo, and Sydney). It makes the visual application demonstrable without an API key, external geocoding calls, or nondeterministic tests. Unknown cities are stored normally and are listed in the itinerary without a marker.

The application boundary is `CityLocationResolver`; a future configured provider can be added as an infrastructure adapter without coupling the domain or `TripService` to HTTP or provider DTOs. No external geocoder is enabled today.

The map uses [MapLibre GL JS](https://maplibre.org/) with the token-free [OpenFreeMap](https://openfreemap.org/) Liberty base style. Country boundary overlays are fetched client-side from [Natural Earth](https://www.naturalearthdata.com/)'s `natural-earth-vector` GeoJSON dataset; Natural Earth data is public domain. Highlights use the stored country code and Natural Earth's `ISO_A2_EH` property, never display-name matching. Both map services need an internet connection when the visual frontend is open.

## API quick start

The existing Travel Core endpoints remain stable:

```bash
curl -X POST http://localhost:8080/api/trips \
  -H "Content-Type: application/json" \
  -d '{"name":"Italy 2026","startDate":"2026-05-10","endDate":"2026-05-21"}'

curl -X POST http://localhost:8080/api/trips/{tripId}/stops \
  -H "Content-Type: application/json" \
  -d '{"countryCode":"IT","cityName":"Rome"}'

curl http://localhost:8080/api/trips/{tripId}
curl http://localhost:8080/api/trips/map-overview
curl http://localhost:8080/api/countries
curl http://localhost:8080/api/health
```

City payloads now add nullable `latitude` and `longitude` fields. `GET /api/trips/map-overview` is a compact read model for the frontend: it returns visited country codes and only the located stop markers, avoiding a request for every full itinerary during initial map load.

## Tests and builds

Docker must be running for backend integration tests because they start one JVM-wide PostGIS Testcontainer.

```bash
./mvnw --batch-mode verify

cd frontend
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm test
pnpm run build
```

The GitHub Actions workflow runs these backend and frontend checks independently and caches Maven and pnpm dependencies.

## Project structure

```text
src/main/java/.../travel/
  api/             HTTP controllers and response DTOs
  application/     travel use cases and the CityLocationResolver boundary
  domain/          Trip aggregate, City, Country, and coordinates
  infrastructure/  deterministic city-location adapter
  persistence/     JPA repositories
frontend/
  src/api/         typed HTTP client
  src/components/  trip and itinerary UI
  src/features/map/ MapLibre view and map-data transforms
```

## Production build arrangement

The frontend is deliberately built separately in this milestone: `pnpm run build` writes static assets to `frontend/dist`, while Maven continues packaging the Spring Boot API unchanged. This keeps backend CI and Testcontainers stable and makes the frontend straightforward to deploy to any static host. Packaging the generated assets into the Boot artifact is intentionally deferred until a deployment target is chosen.
