# WanderMap

WanderMap is a visual travel journal for collecting trips and seeing their itineraries on an interactive world map. Trip stops can include journal dates, notes, and locally stored photo memories while map rendering remains driven by stable city and itinerary data.

> Screenshot placeholder: start the backend and frontend locally to see the interactive map.

## What it does today

- create, edit, and delete trips with optional dates and descriptions;
- search real cities and add one explicit result as an itinerary stop;
- reorder and remove itinerary stops;
- add stop dates, notes, and ordered JPEG, PNG, or WebP photo attachments;
- open a dedicated editorial Travel Profile with rich statistics, deterministic highlights, and achievement progress;
- ask a bounded, tool-enabled Travel Assistant for recommendations grounded in the current user's profile, Journeys, Bucket List, and short-term weather;
- keep the compact World map stats bar visible without turning the map into a dashboard;
- save canonical cities to a separate Want to visit list and open them through the existing Place Details flow;
- preserve all travel data in PostgreSQL across browser refreshes;
- create an account, sign in, restore the session after refresh, and sign out;
- keep each user's journeys, memories, photos, map, profile, and Want to visit list private;
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
SPRING_PROFILES_ACTIVE=local ./mvnw spring-boot:run
```

On PowerShell, set `$env:SPRING_PROFILES_ACTIVE = 'local'` and then run `.\mvnw.cmd spring-boot:run`.

Then start the frontend in another terminal:

```bash
cd frontend
pnpm install
pnpm dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Its development proxy forwards `/api` requests to Spring Boot at `http://localhost:8080`, so no permissive backend CORS configuration is needed.

To point the backend at another database, set `WANDERMAP_DB_URL`, `WANDERMAP_DB_USERNAME`, and `WANDERMAP_DB_PASSWORD`.

The WanderMap 0.5 Travel Assistant is disabled by default, so normal local development and CI do not need an AI provider key. To enable it locally, set `WANDERMAP_AI_ENABLED=true` and supply `OPENAI_API_KEY` through the environment; never place a real key in `.env.example` or source control. `WANDERMAP_AI_MODEL` selects the OpenAI model (default `gpt-5-mini`). `WANDERMAP_AI_MAX_TOOL_ITERATIONS` bounds the explicit model/tool loop (default `6`), `WANDERMAP_AI_MAX_TOOL_CALLS` caps total tool calls per request (default `12`), `WANDERMAP_AI_MAX_TOOL_RESULT_CHARACTERS` bounds cumulative serialized tool data (default `100000`), and `WANDERMAP_AI_MAX_OUTPUT_TOKENS` limits each provider response (default `4000`). The application uses the OpenAI Responses API through a provider-neutral `AiModelClient`; request storage is disabled, and opaque encrypted reasoning continuity is held only in memory for the current request. Open-Meteo powers the key-free, current short-term weather tool, with its base URL and timeouts available through the `WANDERMAP_WEATHER_*` properties.

WanderMap 0.6 Phase 1 adds a read-only Trip Planner on the same bounded `TravelAgent` loop. Natural-language requests produce a schema-constrained, application-owned `TripPlanDraft`, which the backend deserializes and validates before returning it to the SPA. The planner can use the authenticated user's profile, Journeys, Bucket List, short-term weather, and a provider-neutral place-search tool backed by the existing city-search service. Place search resolves names and coordinates; it is not treated as a recommendation ranking. Drafts are not persisted and cannot create or modify Journeys. This phase deliberately has no bookings, live prices, transport schedules, exact long-range weather, cost calculations, or automatic application of a draft. The decision is recorded in [`docs/adr/0002-structured-trip-planning.md`](docs/adr/0002-structured-trip-planning.md).

Authentication uses a short-lived signed JWT in the HttpOnly `WANDERMAP_SESSION` cookie. The explicit `local` Spring profile permits a fresh random signing key when `WANDERMAP_JWT_SECRET` is omitted and sets the cookie's `Secure` flag to `false` for localhost HTTP; local sessions therefore intentionally stop working after a backend restart. In the default/non-local configuration, startup fails unless `WANDERMAP_JWT_SECRET` is valid Base64 containing at least 32 decoded random bytes, and session cookies are `Secure` by default. Production deployments require HTTPS and must provide the signing secret outside the repository; `WANDERMAP_AUTH_COOKIE_SECURE` may be configured explicitly but should remain `true`. `WANDERMAP_AUTH_TOKEN_TTL` controls the token lifetime and defaults to `12h`. Registration rejects passwords exceeding BCrypt's 72 UTF-8 byte limit instead of silently truncating them.

The SPA and API are same-origin through the Vite proxy in development. The session cookie is `HttpOnly`, `SameSite=Strict`, scoped to `/api`, and never exposed to JavaScript. Spring Security CSRF protection issues a separate readable `XSRF-TOKEN` cookie; the centralized frontend client sends its value as `X-XSRF-TOKEN` for unsafe requests. No access token or password is stored in `localStorage`.

Photo binaries use a provider-neutral `PhotoStorage` boundary. Local development stores generated keys beneath `WANDERMAP_PHOTOS_ROOT` (default `./data/photos`); PostgreSQL stores metadata only. Authenticated photo-content responses use `Cache-Control: no-store` so private bytes are not retained across user sessions. `WANDERMAP_PHOTOS_MAX_SIZE` configures both the application and multipart limit and defaults to `10MB`. Original filenames are display metadata and are never used as storage paths.

City search uses the configurable `WANDERMAP_GEOCODING_BASE_URL` (default `https://photon.komoot.io`), identifies itself with `WANDERMAP_GEOCODING_USER_AGENT`, and uses connection/read timeouts configurable with `WANDERMAP_GEOCODING_CONNECT_TIMEOUT_MILLIS` and `WANDERMAP_GEOCODING_READ_TIMEOUT_MILLIS`.

## Map and coordinates

`cities.latitude` and `cities.longitude` are nullable `NUMERIC(8,6)` and `NUMERIC(9,6)` values, guarded by database checks for valid world bounds. The application never requires a coordinate in order to create a stop.

City autocomplete is mediated by the backend through the provider-neutral `GeocodingClient` boundary. The default adapter uses [Photon](https://github.com/komoot/photon), an open-source OpenStreetMap geocoder designed for search-as-you-type. The public Photon endpoint is suitable for modest development/demo usage but has no availability guarantee; configure `WANDERMAP_GEOCODING_BASE_URL` to use a self-hosted or other Photon-compatible endpoint as usage grows. The OSMF public Nominatim endpoint is intentionally not the default because its [usage policy](https://operations.osmfoundation.org/policies/nominatim/) prohibits autocomplete.

Selecting a result sends its city name, ISO alpha-2 country code, latitude, and longitude to the relevant stop or Bucket List endpoint. The shared `CityResolutionService` persists and reuses canonical cities without depending on Photon DTOs. The previous `KnownCityLocationResolver` remains as a compatibility fallback for older coordinate-less API calls, and unknown coordinate-less cities remain valid itinerary or Bucket List entries without map markers.

The map uses [MapLibre GL JS](https://maplibre.org/) with the token-free [OpenFreeMap](https://openfreemap.org/) Liberty base style. Visited World places use one native clustered GeoJSON feature per stable `cityId`; clusters count cities rather than visits. At medium and close zooms each unclustered visited place becomes a soft, zoom-scaled editorial glow that indicates an approximate visited area, not an administrative boundary or measured travel footprint. Want to visit cities use a separate unclustered GeoJSON source and a theme-aware ring; a city that is both visited and saved keeps its glow plus the ring. Bucket markers are World-only and do not alter Journey markers, visited clustering, routes, or camera fitting. Global Journey routes are opt-in while a selected Journey always keeps its ordered route and individual TripStop markers.

World overview is a single north-up Mercator atlas (`renderWorldCopies: false`). Its camera uses the map container, excluding the sidebar, with a nominal longitude span of -168° to +180° and center 6°E / 18°N. Tall containers must fit a full Mercator world vertically: the minimum zoom increases and latitude moves toward the equator, so narrower views crop peripheral geography (including part of Alaska/the Aleutians). The native `transformCameraUpdate` hook holds this visible envelope at maximum zoom-out, then continuously releases it to MapLibre's single-world extent over one zoom level. A starting center and minimum zoom alone do not constrain wheel anchors or pan: they previously allowed the western dateline geometry and polar framing back into view. This is a camera-only presentation constraint; the OpenMapTiles coastline and Natural Earth relief remain unchanged. Normal zoomed-in pan works, and Journey cameras retain their stop-based fitting; manual Journey zoom-out shares the atlas floor/constraint. Explicit World navigation restores the overview; themes, routes, and Place/Memory opening do not reset the camera. Resize updates the viewport constraint and zoom floor without a stop/world refit, though a newly restrictive floor may constrain the current camera. Cross-antimeridian routes such as Tokyo–Honolulu need future geometry splitting/shortest-path handling; the current straight longitude segments are not an antimeridian routing solution.

Future V2 — true city boundaries: the current Visited Area Glow remains an approximate MVP visualization. The intended pipeline is City → stable external boundary identity → offline OSM/equivalent boundary pipeline → verified Polygon/MultiPolygon → simplified cached geometry → MapLibre native fill/outline. This is documentation only, not a runtime feature. It must not use name-only matching, fake polygons/circles presented as administrative boundaries, or runtime geometry requests to public Nominatim/Overpass.

Country fills are fetched client-side from the versioned 1:50m [Natural Earth](https://www.naturalearthdata.com/) `natural-earth-vector` GeoJSON dataset and rendered as a native MapLibre layer below the base style's roads, administrative boundaries, and labels; Natural Earth data is public domain. Highlights use the stored country code and Natural Earth's `ISO_A2_EH` property, never display-name matching. The overlay is hidden in World so the city-level footprint remains primary, and is enabled for a selected Journey. Both map services need an internet connection when the visual frontend is open.

Country geometry is a deliberate trade-off. Natural Earth's 1:10m countries improve coastline detail but its official download is roughly 4.7 MB versus roughly 0.78 MB for 1:50m before GeoJSON expansion, and both resolutions can still disagree with the OSM-derived base map. The [OpenMapTiles boundary schema](https://openmaptiles.org/schema/#boundary) exposes administrative boundaries as lines, not a generic ISO-addressable country polygon fill. Exact matching would therefore require hosting and updating a polygon tileset generated from the same OSM snapshot and worldview as the base map. Until that infrastructure exists, the stable, generic, lighter 1:50m overlay is safer than a third-party polygon service, client-side OSM relation assembly, or country-specific geometry exceptions.

## API quick start

Create or restore a session through the frontend for normal use. The compact auth API is:

- `POST /api/auth/register` — create an account and session (`201`);
- `POST /api/auth/login` — create a session (`200`);
- `POST /api/auth/logout` — expire the session cookie (`204`);
- `GET /api/me` — return the authenticated user;
- `GET /api/auth/csrf` — initialize the SPA CSRF cookie/token.
- `POST /api/ai/travel-assistant` — ask the authenticated, tool-enabled Travel Assistant (`message` is required and limited to 4000 characters).
- `POST /api/ai/trip-plan` — create a validated, read-only structured trip draft from a natural-language request (same message limit).

All personal APIs, including Trips, Stops, photos, Map Overview, Travel Profile, Place Details, Bucket List, city search, and countries, require authentication. `/api/health` and the auth bootstrap endpoints remain public. Unsafe requests also require the `X-XSRF-TOKEN` cookie value in the `X-XSRF-TOKEN` header. A command-line client should first call `/api/auth/csrf` with a cookie jar, then preserve that jar for registration/login and subsequent requests. The existing Travel Core endpoint paths and payloads remain stable; ownership is never accepted from the client:

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
curl http://localhost:8080/api/travel-profile
curl http://localhost:8080/api/bucket-list
curl http://localhost:8080/api/countries
curl http://localhost:8080/api/health

curl -X POST http://localhost:8080/api/ai/travel-assistant \
  -H "Content-Type: application/json" \
  -d '{"message":"Which place from my bucket list should I consider next?"}'

curl -X POST http://localhost:8080/api/ai/trip-plan \
  -H "Content-Type: application/json" \
  -d '{"message":"Plan 7 relaxed days in Italy focused on food and architecture."}'

curl -X POST http://localhost:8080/api/trips/{tripId}/stops/{stopId}/photos \
  -F "file=@memory.jpg"

curl http://localhost:8080/api/trips/{tripId}/stops/{stopId}/photos/{photoId}/content

curl -X DELETE http://localhost:8080/api/trips/{tripId}/stops/{stopId}/photos/{photoId}

curl -X POST http://localhost:8080/api/bucket-list \
  -H "Content-Type: application/json" \
  -d '{"countryCode":"JP","cityName":"Kyoto","latitude":35.0116,"longitude":135.7681}'

curl -X DELETE http://localhost:8080/api/bucket-list/{bucketListItemId}
```

Unauthenticated access returns `401` with `code = AUTH_REQUIRED`. A resource UUID owned by another user behaves as not found rather than disclosing that the resource exists. Invalid credentials return `401`, duplicate normalized email registration returns `409`, and normal validation remains `400`.

`GET /api/cities/search` returns only normalized application fields: `name`, `countryName`, optional `regionName`, `countryCode`, `latitude`, and `longitude`. The region label distinguishes same-name cities within one country but is not required for persistence. The stop endpoint keeps latitude/longitude optional for backward compatibility but requires both when either is supplied. `GET /api/trips/map-overview` remains the compact read model for visited country codes and located stop markers; each marker includes its stable `cityId` so clients can group repeated visits without relying on names or coordinates.

`GET /api/travel-profile` is the single user-scoped read model used by both the compact World summary and the dedicated Profile View. It returns the nine established counters plus `highlights` and `achievements`. Places and city revisits use stable `cityId`; a country is revisited only when it occurs in more than one distinct Journey. Travel days retain their existing semantics: distinct inclusive calendar dates across Journey date ranges, with overlapping trips counted once, one explicitly known endpoint contributing one date, and undated or reversed legacy ranges contributing none. Memories remain TripStops with a note and/or photo.

Profile highlights are deterministic and derived from the authenticated user's persisted travel only. Most visited city and country count TripStops; longest Journey requires both dates and uses inclusive duration; most recent Journey uses the greatest non-null `startDate`; and most memory-rich Journey counts memory-bearing stops and is absent when every count is zero. Equal values use normalized/display name and stable identity tie-breaks. The profile is calculated with a fixed small query set: Journeys with Stops/Cities/Countries, memory counts grouped by Journey, and total photo count, avoiding a query per highlight or achievement.

WanderMap 0.4 Phase 3 achievements are derived read-model data, not persisted state. Twelve stable achievement codes cover Journeys, countries, places, Memories, Photos, travel days, and revisits. The backend owns every threshold and returns current value, target, unlocked state, and capped progress; the frontend only presents that evaluation. Persistent achievement history, `unlockedAt`, and notifications are intentionally deferred until event and persistence semantics are designed.

The map remains the hero in World View: its compact floating bar still shows Countries, Places, Journeys, Travel days, and Memories without permanent profile cards over the atlas. The full Profile View opens from the authenticated user area as a separate responsive presentation, keeps the live map mounted underneath, and returns to the same World/Journey state. It adds identity, hero metrics, highlights, achievements, and secondary counters without changing map behavior. Bucket List changes never affect historical profile metrics.

Bucket List persistence is intentionally separate from travel history. Each Bucket List item references one shared canonical `City`, and a database uniqueness constraint permits one item per `(userId, cityId)`; different users can save the same City while display names are never used as identity. A city may be visited-only, bucket-only, or both. Adding a TripStop never auto-removes its Bucket List item, and removing a Bucket List item never deletes its City or TripStops. `GET /api/bucket-list` derives `visited` from the current user's TripStops without per-item queries. Bucket-only changes do not contribute to Personal Travel Profile counts. Phase 1 deliberately has no note/PATCH field and no automatic first-stop handoff into New Journey; a future planning bridge should prefill the existing city-selection input and keep Journey creation/add-stop failure semantics explicit.

WanderMap 0.5 adds one Travel Assistant rather than a general AI framework. Its application-owned loop supplies four explicit tools: `get_travel_profile`, `get_journeys`, `get_bucket_list`, and coordinate-based `get_weather`. Personal tools accept no user identifier and call existing user-scoped application services, so the model cannot choose an account. Tool arguments and provider responses are validated, unknown tools and tool failures become structured results, and configurable iteration, total tool-call, and output-token ceilings bound each request. Structured logs record run IDs, iterations, tool names, durations, and outcomes without prompts, secrets, cookies, or returned personal data. There is no direct repository access, generic URL-fetch tool, persistent chat history, RAG, embeddings, or multi-agent orchestration. The architecture decision is recorded in [`docs/adr/0001-first-ai-agent-architecture.md`](docs/adr/0001-first-ai-agent-architecture.md).

The 0.6 planner requests strict JSON Schema output through the existing provider-neutral model port and adds only one tool, `search_places`. Its `daysAtStop` values must sum to `durationDays`; concrete start/end dates use inclusive calendar-day semantics and must agree with that duration, while unspecified dates remain null. Plans are limited to 1–60 days, 1–12 resolved unique places, at most 8 activities per stop, and at most 10 considerations. Country codes, coordinates, strings, list sizes, dates, personal-history flags, and place-resolution evidence are validated application-side in addition to the provider schema. Invalid model output becomes the controlled `AI_INVALID_PLAN` response and is never exposed as raw JSON. Exact future weather remains unavailable beyond the current forecast horizon.

## Identity and ownership

`UserAccount` is the authentication identity and stores a normalized unique email, BCrypt password hash, display name, and creation time. `Trip` is the user-owned travel aggregate root. TripStops, journal memories, and photo metadata inherit ownership through their parent Trip; they do not duplicate `user_id`. `BucketListItem` is owned directly by a user. Country and City remain shared canonical reference data, so two users selecting the same physical place reuse the same City without sharing any personal visits, memories, map state, or bucket state.

Application services obtain the authenticated owner through the `CurrentUserProvider` boundary. Travel controllers never accept a user ID, and owner-scoped repository queries are used for reads and mutations. Travel Profile, Map Overview, Place Details visits, photo content, and Bucket `visited` status are all calculated from the current user's aggregates. The frontend restores `/api/me` before loading any personal data; a protected-request `401` unmounts the authenticated app and clears its in-memory state. A different user receives a fresh authenticated app instance while the browser-global visual theme may remain.

Flyway migration `V10__add_user_ownership.sql` preserves pre-authentication data under deterministic user `legacy@wandermap.local`, then makes Trip and Bucket ownership non-null and adds foreign keys and owner-focused indexes. The migration account has no published or known password and is therefore not a default login. A future explicit account-claim/recovery workflow can transfer that data; V0.4 intentionally does not add account administration. User deletion is not exposed, and the database rejects deleting a user while owned aggregates exist, preventing accidental loss while never cascading into shared City/Country rows.

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
src/main/java/.../identity/
  api/             registration, login, logout, CSRF bootstrap, and current-user DTOs
  application/     authentication use cases and CurrentUserProvider boundary
  domain/          UserAccount
  security/        JWT cookie creation and Spring Security configuration
src/main/java/.../ai/
  api/             authenticated Assistant/Trip Planner endpoints and safe error mapping
  application/     one bounded agent loop, structured planning validation, provider-neutral ports, and tools
  infrastructure/  OpenAI Responses API and Open-Meteo adapters
frontend/
  src/api/         typed HTTP client with credentials, CSRF, and centralized 401 handling
  src/components/  auth, trip, itinerary, place, and memory UI
  src/features/map/ MapLibre view and map-data transforms
```

## Production build arrangement

The frontend is deliberately built separately in this milestone: `pnpm run build` writes static assets to `frontend/dist`, while Maven continues packaging the Spring Boot API unchanged. This keeps backend CI and Testcontainers stable. Because authentication deliberately uses strict same-origin cookies and no permissive CORS, production should serve the static frontend and `/api` behind one origin (for example through a reverse proxy). Packaging generated assets into the Boot artifact is intentionally deferred until a deployment target is chosen.
