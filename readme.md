# WanderMap

WanderMap is a visual travel journal for collecting trips and seeing their itineraries on an interactive world map. The current milestone adds real city search to the React + MapLibre application: a selected geocoding result supplies the country and coordinates needed to persist a stop and display its marker.

> Screenshot placeholder: start the backend and frontend locally to see the interactive map.

## What it does today

- create, edit, and delete trips with optional dates;
- search real cities and add one explicit result as an itinerary stop;
- reorder and remove itinerary stops;
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

City search uses the configurable `WANDERMAP_GEOCODING_BASE_URL` (default `https://photon.komoot.io`), identifies itself with `WANDERMAP_GEOCODING_USER_AGENT`, and uses connection/read timeouts configurable with `WANDERMAP_GEOCODING_CONNECT_TIMEOUT_MILLIS` and `WANDERMAP_GEOCODING_READ_TIMEOUT_MILLIS`.

## Map and coordinates

`cities.latitude` and `cities.longitude` are nullable `NUMERIC(8,6)` and `NUMERIC(9,6)` values, guarded by database checks for valid world bounds. The application never requires a coordinate in order to create a stop.

City autocomplete is mediated by the backend through the provider-neutral `GeocodingClient` boundary. The default adapter uses [Photon](https://github.com/komoot/photon), an open-source OpenStreetMap geocoder designed for search-as-you-type. The public Photon endpoint is suitable for modest development/demo usage but has no availability guarantee; configure `WANDERMAP_GEOCODING_BASE_URL` to use a self-hosted or other Photon-compatible endpoint as usage grows. The OSMF public Nominatim endpoint is intentionally not the default because its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) prohibits autocomplete.

Selecting a result sends its city name, ISO alpha-2 country code, latitude, and longitude to the existing stop endpoint. `TripService` persists those coordinates without depending on Photon DTOs. The previous `KnownCityLocationResolver` remains as a compatibility fallback for older coordinate-less API calls, and unknown coordinate-less cities remain valid itinerary entries without map markers.

The map uses [MapLibre GL JS](https://maplibre.org/) with the token-free [OpenFreeMap](https://openfreemap.org/) Liberty base style. Country boundary overlays are fetched client-side from [Natural Earth](https://www.naturalearthdata.com/)'s `natural-earth-vector` GeoJSON dataset; Natural Earth data is public domain. Highlights use the stored country code and Natural Earth's `ISO_A2_EH` property, never display-name matching. Both map services need an internet connection when the visual frontend is open.

## API quick start

The existing Travel Core endpoints remain stable:

```bash
curl 'http://localhost:8080/api/cities/search?q=Flo'

curl -X POST http://localhost:8080/api/trips \
  -H "Content-Type: application/json" \
  -d '{"name":"Italy 2026","startDate":"2026-05-10","endDate":"2026-05-21"}'

curl -X POST http://localhost:8080/api/trips/{tripId}/stops \
  -H "Content-Type: application/json" \
  -d '{"countryCode":"IT","cityName":"Florence","latitude":43.7696,"longitude":11.2558}'

curl http://localhost:8080/api/trips/{tripId}
curl http://localhost:8080/api/trips/map-overview
curl http://localhost:8080/api/countries
curl http://localhost:8080/api/health
```

`GET /api/cities/search` returns only normalized application fields: `name`, `countryName`, optional `regionName`, `countryCode`, `latitude`, and `longitude`. The region label distinguishes same-name cities within one country but is not required for persistence. The stop endpoint keeps latitude/longitude optional for backward compatibility but requires both when either is supplied. `GET /api/trips/map-overview` remains the compact read model for visited country codes and located stop markers.

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
  application/     travel use cases and provider-neutral geocoding boundaries
  domain/          Trip aggregate, City, Country, and coordinates
  infrastructure/  Photon client and deterministic legacy city-location adapter
  persistence/     JPA repositories
frontend/
  src/api/         typed HTTP client
  src/components/  trip and itinerary UI
  src/features/map/ MapLibre view and map-data transforms
```

## Production build arrangement

The frontend is deliberately built separately in this milestone: `pnpm run build` writes static assets to `frontend/dist`, while Maven continues packaging the Spring Boot API unchanged. This keeps backend CI and Testcontainers stable and makes the frontend straightforward to deploy to any static host. Packaging the generated assets into the Boot artifact is intentionally deferred until a deployment target is chosen.
