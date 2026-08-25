# WanderMap

WanderMap is a visual travel journal for collecting trips and seeing their itineraries on an interactive world map. Trip stops can include journal dates, notes, and locally stored photo memories while map rendering remains driven by stable city and itinerary data.

> Screenshot placeholder: start the backend and frontend locally to see the interactive map.

## What it does today

- create, edit, and delete trips with optional dates and descriptions;
- search real cities and add one explicit result as an itinerary stop;
- reorder and remove itinerary stops;
- add stop dates, notes, and ordered JPEG, PNG, or WebP photo attachments;
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

Photo binaries use a provider-neutral `PhotoStorage` boundary. Local development stores generated keys beneath `WANDERMAP_PHOTOS_ROOT` (default `./data/photos`); PostgreSQL stores metadata only. `WANDERMAP_PHOTOS_MAX_SIZE` configures both the application and multipart limit and defaults to `10MB`. Original filenames are display metadata and are never used as storage paths.

City search uses the configurable `WANDERMAP_GEOCODING_BASE_URL` (default `https://photon.komoot.io`), identifies itself with `WANDERMAP_GEOCODING_USER_AGENT`, and uses connection/read timeouts configurable with `WANDERMAP_GEOCODING_CONNECT_TIMEOUT_MILLIS` and `WANDERMAP_GEOCODING_READ_TIMEOUT_MILLIS`.

## Map and coordinates

`cities.latitude` and `cities.longitude` are nullable `NUMERIC(8,6)` and `NUMERIC(9,6)` values, guarded by database checks for valid world bounds. The application never requires a coordinate in order to create a stop.

City autocomplete is mediated by the backend through the provider-neutral `GeocodingClient` boundary. The default adapter uses [Photon](https://github.com/komoot/photon), an open-source OpenStreetMap geocoder designed for search-as-you-type. The public Photon endpoint is suitable for modest development/demo usage but has no availability guarantee; configure `WANDERMAP_GEOCODING_BASE_URL` to use a self-hosted or other Photon-compatible endpoint as usage grows. The OSMF public Nominatim endpoint is intentionally not the default because its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) prohibits autocomplete.

Selecting a result sends its city name, ISO alpha-2 country code, latitude, and longitude to the existing stop endpoint. `TripService` persists those coordinates without depending on Photon DTOs. The previous `KnownCityLocationResolver` remains as a compatibility fallback for older coordinate-less API calls, and unknown coordinate-less cities remain valid itinerary entries without map markers.

The map uses [MapLibre GL JS](https://maplibre.org/) with the token-free [OpenFreeMap](https://openfreemap.org/) Liberty base style. Subtle country fills are fetched client-side from the versioned 1:50m [Natural Earth](https://www.naturalearthdata.com/) `natural-earth-vector` GeoJSON dataset and rendered as a native MapLibre layer below the base style's roads, administrative boundaries, and labels; Natural Earth data is public domain. Highlights use the stored country code and Natural Earth's `ISO_A2_EH` property, never display-name matching. Both map services need an internet connection when the visual frontend is open.

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

curl -X POST http://localhost:8080/api/trips/{tripId}/stops/{stopId}/photos \
  -F "file=@memory.jpg"

curl http://localhost:8080/api/trips/{tripId}/stops/{stopId}/photos/{photoId}/content

curl -X DELETE http://localhost:8080/api/trips/{tripId}/stops/{stopId}/photos/{photoId}
```

`GET /api/cities/search` returns only normalized application fields: `name`, `countryName`, optional `regionName`, `countryCode`, `latitude`, and `longitude`. The region label distinguishes same-name cities within one country but is not required for persistence. The stop endpoint keeps latitude/longitude optional for backward compatibility but requires both when either is supplied. `GET /api/trips/map-overview` remains the compact read model for visited country codes and located stop markers; each marker includes its stable `cityId` so clients can group repeated visits without relying on names or coordinates.

Photo uploads reject empty files, files over the configured limit, unsupported MIME types, and data whose signature does not match its declared type. JPEG and PNG files are decoded with the JDK image codecs with a 25-megapixel cap; WebP receives structural RIFF/WEBP validation because the application intentionally does not add a WebP codec in V1. Production hardening can add malware scanning and derivative thumbnails behind the same storage boundary.

File/database consistency favors never leaving a live database record pointing to a missing file. A newly stored file is deleted if its metadata transaction rolls back. Photo, stop, and trip deletion commit metadata first and remove the corresponding files immediately after commit. Local deletion is idempotent; a rare post-commit provider failure is logged and may leave an unreferenced file for a future reconciliation job.

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
  application/     travel use cases and provider-neutral geocoding/storage boundaries
  domain/          Trip aggregate, stops, photo metadata, City, Country, and coordinates
  infrastructure/  Photon/geocoding adapters and local photo storage
  persistence/     JPA repositories
frontend/
  src/api/         typed HTTP client
  src/components/  trip and itinerary UI
  src/features/map/ MapLibre view and map-data transforms
```

## Production build arrangement

The frontend is deliberately built separately in this milestone: `pnpm run build` writes static assets to `frontend/dist`, while Maven continues packaging the Spring Boot API unchanged. This keeps backend CI and Testcontainers stable and makes the frontend straightforward to deploy to any static host. Packaging the generated assets into the Boot artifact is intentionally deferred until a deployment target is chosen.
