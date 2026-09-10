# ADR 0003: Verified city boundaries with an opt-in provider and PostGIS cache

## Status

Accepted for WanderMap 0.7 Phase 1, 2026-09-06. **Milestone: DONE as of 2026-09-10.** Architecture, persistence, API, rendering and fallback remain provider-neutral and disabled by default. A pinned, self-hosted Nominatim 5.3.2 instance was used only for local qualification of the validated NL, FR, IT and LI semantic policies; Amsterdam, Paris, Rome and Vaduz resolve to verified municipal geometry, while Malbun retains the controlled glow fallback. No production endpoint is configured and no worldwide coverage, cross-country municipality ontology or provider-availability guarantee is claimed.

0.6 Agentic Trip Planner Phases 1, 2 and 3 are DONE and merged through PR #22. This work starts from its source HEAD `465509a` on `develop`; the PR's merge commit on `main` is `941752a`.

## Existing architecture and research

The existing World map has one MapLibre clustered GeoJSON feature per canonical visited City ID, three point-based glow layers, hover/click interactions, and optional global routes. Journey mode has country fill, route and numbered stop markers; repeat visits remain separate stops. Natural Earth supplies country geometry, OpenFreeMap Liberty supplies the basemap. Themes update paint on the existing style. Before this change, readiness handled only the first `style.load`. Authentication keys the React application by account ID.

City is shared reference data with UUID identity and immutable located coordinates; names alone are not identity. Country is shared reference data. Place Details and Map Overview select the current owner's visits. Travel Profile derives metrics from those same owned aggregates. Existing V1 already enables PostGIS, but City uses numeric latitude/longitude, with no spatial ORM mapping. Boot 4.1 resolves Hibernate 7.4.1; the existing JDBC/JPA datasource makes a narrow native PostGIS repository simpler than adding Hibernate Spatial. Old migrations and existing entities/read models are unchanged.

| Option | Assessment for this phase |
| --- | --- |
| OSM via a permitted Nominatim-compatible service | Administrative relation polygons, stable OSM type/ID reference, name/country search and GeoJSON without assembling relation members. Coverage and municipal semantics depend on OSM and the deployment. Selected behind an adapter. |
| Public OSMF Nominatim | Not an implicit application dependency. Its policy requires identification, aggregate throttling and caching, restricts systematic/bulk use and gives no SLA. Explicitly disabled; its hostname is rejected, not supplied as any profile's default. |
| Public Overpass | Raw OSM geometry could work, but assembling rings/holes correctly adds complexity. Public instances explicitly discourage use as a general application backend; quota/load shedding are unsuitable as an availability promise. No live calls or scraping. |
| GeoNames | Public CC BY 4.0 gazetteer extracts contain place coordinates and admin codes, not the needed municipal polygons. Its documented simplified shapes are country boundaries. Not selected. |
| geoBoundaries gbOpen | CC BY 4.0 country-level ADM0–ADM5 downloads are a possible future import source. An ADM number is relative to the country, not a universal city level. Large per-country downloads and a vetted municipality-level mapping/import pipeline exceed this narrow phase. |
| Natural Earth | Public-domain generalized country/urban geography; populated places are points, urban footprints are not municipal limits. Keep it for the existing country overlay, not this feature. |
| Hosted provider abstraction | Selected operational approach: the deployer supplies a permitted compatible service and accepts its terms, capacity and data freshness. No paid account or new server is provisioned by this change. |
| Browser lookup or memory-only cache | Rejected: direct lookup exposes browsing demand to another origin, fragments throttling and loses verified results on restart. Server-side persistence reuses shared public geography across users without sharing their visited sets. |

References: [Nominatim search](https://nominatim.org/release-docs/latest/api/Search/), [output formats](https://nominatim.org/release-docs/latest/api/Output/), [public usage policy](https://operations.osmfoundation.org/policies/nominatim/), [Overpass resource model](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html), [GeoNames extract schema](https://download.geonames.org/export/dump/readme.txt), [geoBoundaries API](https://www.geoboundaries.org/api.html), [Natural Earth populated places](https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/).

## Decision and configuration

`CityBoundaryController → CityBoundaryService → CityBoundaryClient → NominatimBoundaryClient`. Application records contain only canonical place input, candidate names/country, geographic kind, geometry and source identity; no Nominatim URL, parameters or DTOs enter application/API code. The service also uses `CityBoundaryRepository` for verified shared geography.

Both normal and local profiles default to:

```yaml
wandermap:
  city-boundaries:
    external-enabled: false
    base-url: ""
    user-agent: ""
```

Configure `WANDERMAP_CITY_BOUNDARIES_EXTERNAL_ENABLED=true`, `WANDERMAP_CITY_BOUNDARIES_BASE_URL` and `WANDERMAP_CITY_BOUNDARIES_USER_AGENT` only after obtaining a permitted Nominatim-compatible deployment. The URL is its API base, without `/search`, query parameters, credentials or fragment. HTTPS is required except loopback HTTP for local testing/self-hosted access. Supply an identifying application/operator contact in the User-Agent. No endpoint is inferred. Public OSMF Nominatim is rejected even if explicitly configured. A third-party service may impose additional attribution/usage requirements that must be reviewed before enabling it.

Disabled mode starts normally and makes **zero external calls**. Existing persisted geometry is still served, even stale. With no cached record the response is controlled UNAVAILABLE, without writing a permanent negative entry. Existing negative/failure cache states remain distinguishable.

## Boundary semantics and trusted matching

Phase 1 means the administrative relation representing the named municipality/local government area that contains the canonical visited City point. It does not mean a merely registered settlement or `woonplaats`, built-up land, neighbourhood, district/arrondissement, department/province, metropolitan region, travel footprint, jurisdictional/legal guarantee, or official government endorsement of OSM data.

The adapter requests documented `jsonv2` search output (`category`, not legacy JSON `class`), polygon GeoJSON, address/name/extra tags, English display names, an exact country filter and at most eight candidates. It performs provider-format and structural rejection: an administrative **relation**, an explicit integral search rank and admin level, bounded classification fields, and Polygon/MultiPolygon geometry are required. It does not decide that one universal rank or admin level means municipality. Nominatim documents that its OSM category/type classifications follow tagging and are not a stable cross-country taxonomy; OSM administrative levels are country-specific. A full result page is treated as indeterminate instead of silently selecting from a possibly incomplete candidate set. There is no pagination, details scraping or name-only first-result selection.

Stage B demonstrated why the former universal locality/rank gate was insufficient. Amsterdam returned both relation 47811 (the `gemeente`, admin level 8, rank 14) and relation 271110 (the `woonplaats`, admin level 10, rank 16); both names and geometries passed, so treating both locality-shaped results as equal produced a false ambiguity. Paris exposed a different mismatch: provider `addresstype` and rank do not reliably encode the commune boundary, while the same name can also identify the department and subdivisions. Widening the rank interval or selecting the first result would admit broader or narrower polygons.

Stage C therefore applies a small provider-neutral `MunicipalityBoundaryPolicy` after trusted name/country checks and before the existing PostGIS verification. The validated policies are intentionally limited to:

| Country | Accepted municipal semantics | Explicitly not selected |
| --- | --- | --- |
| NL | admin level 8 municipality (`gemeente`) | admin level 10 `woonplaats`/settlement |
| FR | admin level 8 commune, including a provider result classified as a subdivision | department, region and arrondissement/district candidates |
| IT | admin level 8 `comune` | province/metropolitan city and region |
| LI | admin level 8 `Gemeinde` | subordinate settlement/locality polygons |

Within an accepted country rule, explicit municipality classification is preferred over city/town/village classification where both describe the same allowed municipal level. The French commune allowance is deliberately lower priority than an explicit municipal classification. Candidates still have to match the canonical bounded name set and country, then pass `ST_IsValid`, nonempty geometry, and `ST_Covers` for the canonical point. Selection is the unique highest semantic preference only. Provider order, area, centroid distance, or numeric rank alone never breaks a tie; equally preferred distinct candidates remain UNAVAILABLE. Duplicate copies of the same source identity are coalesced only when all candidate metadata and geometry agree.

Unknown countries retain a conservative generic policy: only city/town/village/municipality relations with an explicit admin level from 4 through 10 and rank from 13 through 18 are eligible. This fallback is not a claim of worldwide municipality semantics. If exactly one safe best candidate cannot be established, the API returns UNAVAILABLE and the existing visited-place glow remains visible.

The application checks the canonical country code and normalized City name against bounded current `name`/`name:*` fields (not historic names or arbitrary display addresses). Then PostGIS must establish `ST_IsValid`, nonempty geometry, and `ST_Covers(geometry, canonical point)`. Covers includes a point exactly on the edge and rejects points in holes or outside disconnected components ([PostGIS Covers](https://postgis.net/docs/ST_Covers.html)). More than one distinct verified source identity is ambiguous and falls back; duplicate copies of an identical source object are coalesced. Contradictory geometry under the same source identity is a temporary response failure.

Only longitude/latitude WGS84 coordinates are accepted. Polygon is promoted to MultiPolygon; rings, holes, islands and disconnected components are never flattened. Ring closure, exact two-dimensional points, finite values, coordinate bounds and total point count are checked before SQL. Dateline-crossing edges and multipart extents over five degrees in either axis are conservatively rejected. PostGIS additionally rejects area over 20,000 km². These limits may exclude legitimate large municipalities: coverage loss is preferable to silently painting an entire region. They do not generate or modify a polygon using a radius.

## Storage, simplification and cache

V12 adds only `city_boundaries`: City UUID primary key/FK with ON DELETE CASCADE, lookup status, original and display `geometry(MultiPolygon,4326)`, source name/reference, checked and retry timestamps. It stores no raw upstream response, account IDs or Journey IDs. Geometry remains after a Journey is deleted and disappears if its shared City is deleted. PK lookup needs no GIS index. Original geometry remains intact; the display geometry is cached once after validation to avoid simplifying repeatedly for each reader.

Display simplification uses `ST_SimplifyPreserveTopology` with a single **0.0001 degree** tolerance (at most roughly 11 m north/south, longitude distance latitude-dependent). This is a cartographic generalization, not a survey-accuracy claim. Holes/components are preserved by the topology-preserving operation. If simplification excludes the canonical point, original geometry is used instead if it fits display limits. No automatic ST_MakeValid repair occurs. See [PostGIS simplification](https://postgis.net/docs/ST_SimplifyPreserveTopology.html). GeoJSON is serialized by Jackson/PostGIS, never concatenated from provider text, and served with 15-decimal coordinate output.

Limits: 3 MB upstream bytes, JSON depth 16, strings 4,096 characters, number tokens 40 characters, 25,000 original positions; display at most 10,000 positions and 500,000 bytes. Oversized or malformed upstream payloads produce a temporary failure, not established absence. Invalid/noncontaining topology or excessive display complexity produces no acceptable geometry. Tests exercise real PostGIS topology and persistence rather than mocking these predicates.

Positive cache: 30 days. Established no-match/ambiguity: 1 day. Temporary provider/network/parse failure: 5 minutes. Expired entries retry lazily on demand; no scheduler, preload or background fetcher exists. An atomic insert/upsert takes a 30-second refresh lease, so concurrent cache misses normally share one lookup; a crashed process becomes retryable. No database transaction or row lock spans external HTTP. Cache writes are atomic statements. A failed refresh retains the last verified geometry and the API reports AVAILABLE with `stale=true`; without geometry it reports TEMPORARILY_UNAVAILABLE. Successful no-match refresh clears obsolete geometry. A deployer should coordinate provider capacity across replicas; the adapter's conservative 15-second request-admission interval is per instance, not an aggregate fleet quota.

Stage C adds no persistent semantic-version column. V13 performs a targeted one-time rollout invalidation by deleting complete boundary-cache rows whose canonical City country is NL, FR, IT or LI. This includes both positive rows, which may contain a different administrative relation accepted by the former generic resolver, and negative rows, which may be false negatives under the country-aware policy. Boundary cache is reconstructable derived data, so the next demand-driven request requalifies those cities under the new semantics. Countries outside the four changed policies remain untouched; normal 30-day positive, one-day negative and five-minute temporary TTL behavior is unchanged after migration.

## API, privacy and HTTP safety

`GET /api/places/{cityId}/boundary` accepts only a City UUID and requires the authenticated user's own visit, consistent with Place Details. A nonvisited or unknown City returns the existing 404 PLACE_NOT_FOUND; invalid UUID is 400, anonymous access 401. It never accepts userId, geometry, provider ID, admin level or provider URL. Responses use `Cache-Control: no-store` because access is associated with the current account even though geography itself is shared.

```typescript
{
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'TEMPORARILY_UNAVAILABLE',
  geometry: { type: 'MultiPolygon', coordinates: number[][][][] } | null,
  stale: boolean,
  retryAfterSeconds: number
}
```

Provider status is independent of Journey/map availability. The API exposes no source internals, raw entity or private visit metadata. Only canonical city name/country are sent upstream; stored coordinates remain backend matching input. No account identifier or visit history is sent. The provider will still observe the application's IP and aggregate lookup demand, which operators must consider.

HTTP uses a 3-second connect timeout and 10-second absolute completion deadline, including slow bodies. A streaming subscriber cancels above the byte ceiling; redirects are disabled, there is no automatic application retry, and a fixed configured origin owns URL construction. Logs contain only boundary outcome/category, never geometry, response JSON, query URL, user identifiers or upstream exception causes. Disabling integration does not disable the normal map or other APIs.

## Frontend and lifecycle

One `visited-city-boundaries` combined GeoJSON source carries only City IDs as feature properties. Fill and subtle outline use existing semantic visited-area/core tokens for all six themes. No CSS redesign, DOM labels, SVG/canvas overlay or per-city sources were added.

Only World mode loads/render boundaries, at zoom **8+**, after distant native clustering ends at zoom 7. On moveend/idle/data changes the controller considers up to twelve nearest visible unique visited points and permits two in-flight API requests. Results are reused by retry timestamps; there is no startup bulk load, timer or request per frame. Cache is per map/session, capped at 64 entries / 4 MB of geometry; byte-pressure eviction retains retry metadata to prevent request loops. Rendered geometry is capped at 2 MB / 50,000 positions, with glow fallback for omitted cities. Viewport inclusion uses the City's point rather than an exhaustive spatial intersection query; a very large polygon whose point is outside the viewport is not loaded in Phase 1.

Loaded/rendered real geometry excludes only that City's approximate glow layers at close zoom. The original clustered World source is never rewritten to implement this exclusion. At far zoom the boundary source is emptied and point glow/clusters remain. Backend failure, disabled mode or unavailable geometry keeps the fallback. Routes remain opt-in globally. Journey retains country fill, route, exact numbered stops and repeat visits; it receives no city polygons. Place Details opens from polygon hover/click with the same exact City identity and existing visit-count popup. A special selected-city outline was intentionally not added.

Actual ordering follows the existing style: country fill below roads/boundaries; fallback outer/middle glows and city fill/outline before useful basemap labels; routes above the basemap and below interactive World cores/clusters; existing Bucket and DOM Journey markers retain their ordering. Opaque land cannot cover the city polygons. Country fill remains zero in World.

MapView now observes every style.load and refreshes style-dependent layer/data effects via a revision. Camera and DOM marker effects do not depend on that revision. One MapLibre instance/canvas survives theme and navigation changes. Theme switches update paint, not setStyle. The boundary controller and interaction handlers live once per map, restore cached data after style reload, and clean up on unmount. Idle handles source loading without adding React state on move. Session-generation guards reject late responses, while the existing account-keyed app unmount clears the visited association. Bob cannot receive Alice's rendered visited set from a browser-global geometry cache.

Responsive shell, keyboard navigation, focus traps, Appearance control, Memory and Place Details accessibility are unchanged. Geometry is a visual enhancement, not the sole indication that a City was visited. OSM boundary attribution is explicitly attached to the new MapLibre source; it is not assumed to be covered merely because the basemap is OSM-derived.

## Licensing and operational limits

OSM data is ODbL. The new source supplies a visible MapLibre attribution entry linking to the OSM copyright/license page and naming city boundaries. Operators distributing OSM-derived data must also comply with applicable database/license obligations, and review any extra provider terms. [OSM copyright and attribution](https://www.openstreetmap.org/copyright). Local browser qualification confirmed the boundary attribution with Amsterdam and Paris geometry; mobile presentation was not separately requalified in Stage C. Existing attribution styling was not changed.

There is no production source SLA, broad real-world coverage matrix, municipality-level guarantee outside the validated country policies, background repair/import, spatial search endpoint, admin-boundary editor, vector tile pipeline or provider marketplace. Antimeridian normalization and additional country policies/adapters are deferred. Refresh lease fencing was completed by the focused audit below. Geometry is geographic context and must not be used for legal boundaries.

## Initial verification and remaining work — 2026-09-06

New tests cover disabled mode, positive/negative/expired cache, outage/stale retention, exact identity, ambiguous/wrong candidates, malformed/oversized/timeout payloads, Polygon/MultiPolygon/holes, PostGIS validity/Covers/SRID/simplification, persistence across repository recreation, auth/ownership/deletion, bounded frontend loading, fallback, route/Journey regressions, all theme tokens, style reload, one canvas, late session responses and cleanup. CI uses a fake client or loopback HTTP server only; no live boundary provider is called.

At that point Real City Boundaries stayed **PARTIAL** pending real-provider and authenticated visual qualification. The initial browser attempt at `http://127.0.0.1:5174/` returned `net::ERR_CONNECTION_REFUSED`; no visual result was claimed for that run. Stage C results are recorded below.

Verification on 2026-09-06: `mvnw.cmd --batch-mode verify` passed with **242 unit tests + 89 PostgreSQL/PostGIS integration tests**, no failures/errors/skips. `npm run typecheck`, `npm test -- --run` (**290 tests, 28 files**) and `npm run build` passed. `git diff --check` and `git diff --cached --check` passed; new untracked files were also scanned for trailing whitespace. New boundary-specific coverage adds 43 backend unit cases, 10 integration cases and 16 frontend cases. Production JavaScript is 1,255.13 kB / 336.83 kB gzip, versus the previously recorded 1,247.90 / 334.80 kB (+7.23 / +2.03 kB); the existing >500 kB chunk warning remains. These tests and bounded synthetic stress cases are not real-provider latency/coverage or browser frame-rate measurements.

Retained backlog: representative provider/admin-level coverage and attribution smoke; Full World Framing; premium basemap polish; antimeridian route refinement; bundle splitting; RU/EN; idempotency TTL/retention; persistent planner drafts; richer AI travel data and upstream AI HTTP byte ceiling; mobile after the web application is complete.

## 0.7 Phase 1 focused audit — 2026-09-06

**Verdict: APPROVE WITH FIXES — PR READY. Milestone remains PARTIAL.** No live provider was enabled or called. No dependency, endpoint contract, migration, shell design, Journey behavior or unrelated feature was changed. The existing dirty Phase 1 implementation was preserved. Branch remains `develop`, HEAD `465509a`; nothing staged/committed/pushed.

### Confirmed findings and fixes

| Group / severity | Confirmed problem | Local correction and evidence |
| --- | --- | --- |
| B / MAJOR | An expired lookup could finish after a newer lookup and overwrite its valid geometry, including clearing it with UNAVAILABLE. | Claim returns the exact PostgreSQL `retry_at` lease value. Both positive and negative updates compare that value atomically. Late losers update zero rows and the service reads current cache state. Real PostGIS regression reproduced the original loss; positive, negative and temporary late writes now lose safely. Six concurrent claimants yield one winner/row. No V12 change. |
| C / MAJOR | A trailing DNS root dot bypassed the public OSMF hostname block. | Parsed hostname is lowercased and terminal root dots stripped before checking the public host/subdomains. Regression cases cover dotted/cased hosts, ports, paths, query, userinfo, HTTP and HTTPS. Trusted deployment origins remain configurable; this is not a network-wide DNS/IP denylist. |
| B, F / MAJOR | Boundary-cache JDBC failure escaped as an unhandled server error and could expose internal exception context in server logs. | After ownership is established, cache access failures produce controlled TEMPORARILY_UNAVAILABLE, or previously read geometry as AVAILABLE/stale. Log only a constant cache-access category, not the exception. Read/write failure regressions cover both paths. Authorization failures are not swallowed. |
| C / MINOR | Oversized Content-Length was not rejected until streaming/the deadline. | Reject non-200 or declared oversized bodies at response headers; cancel before requesting body buffers. Streaming still enforces 3 MB for chunked responses. A headers-only oversized response test failed before the fix and now completes without waiting for the 10-second deadline. Tests also cover 429/500/503, redirects, slow bodies and outages. |
| C / MINOR | Non-integral/string locality ranks could be coerced into accepted integer ranks. | Require an integral, int-range rank when supplied; malformed ranks yield controlled temporary failure. Three malformed-rank regressions; missing rank still cannot establish a municipality. |
| C / MINOR | Disabled adapter unnecessarily constructed an HTTP client. | No HttpClient or endpoint is constructed while disabled. The existing disabled test now verifies both in addition to no dispatch/startup without configuration. |
| B / MINOR | A minimum 30-second API retry delay overstated near-expiry cache time. | Report remaining whole seconds, clamped at zero. Deterministic Clock tests cover 0/5/29/100 seconds and temporary-cache recovery exactly at expiry. Frontend retains its independent 30-second anti-churn floor. |
| D / MINOR | Requests for cities that left the viewport continued and cached late results. | Abort requests outside the current bounded visible set, including zoom-out; aborted work stays in the two-request budget until settled and cannot populate cache. Regression pans between disjoint viewports and verifies cancellation, ignored completions and no hidden queue. |
| D / MINOR | Rejected requests bypassed the 64-entry frontend cache trim. | Run the same bounded trim on failures. A 70-city sequential-pan failure regression proves oldest entries are evicted without changing fallback. |
| D / MINOR | Empty boundary layers kept their source in use and displayed boundary attribution without geometry. | Start both layers hidden and set visibility from actual rendered features. MapLibre 6.3's installed `Style.update` marks sources used only by visible layers; `AttributionControl` includes only used sources and deduplicates attribution. This uses supported layout updates, not internal mutations, source recreation or custom controls. Tests cover empty/visible/Journey/zoom-out state and attribution restored on style reload. |

Reproduction before fixes: backend focused run recorded four assertion failures and two errors in 41 unit cases, plus the lost-geometry integration failure; frontend recorded three failures in 11 controller cases. A separate malformed-rank regression also failed before correction. The initial backend reproduction intentionally used Maven's failure-ignore switch to collect unit and integration failures in one run; its final BUILD SUCCESS is **not** a passing verification. Final verification below used no failure-ignore flags.

### Areas with no additional issue

- **A / GIS:** Both original/display columns are MultiPolygon SRID 4326. Polygon promotion preserves ring nesting; original geometry is not replaced by simplification. `ST_Covers` checks canonical longitude/latitude against original and display, including edge points. Invalid/self-intersecting polygons, points in holes and outside points are rejected. Existing real PostGIS tests preserve holes/islands; the audit adds coverage for exact edge points and non-crossing geometry next to longitude 180. True dateline crossing and wide multipart shapes safely fall back, not repaired. Bounded JSON/positions and the existing area/display caps remain conservative coverage limits, not administrative certainty.
- **E / access:** API checks the current user's own visit before reading shared cache. Anonymous 401, invalid UUID 400 and unknown/nonvisited 404 remain tested. A shared City/cache grants no personal access. Late Alice success **and failure** cannot mutate Bob's geometry, glow filters, attribution visibility, source count or fetch count, tested even with a replacement controller on the same map. The application already keys its UI by account ID, intentionally unmounting/remounting on actual account change; the boundary subsystem does not introduce a map remount or change that authentication architecture.
- **D / lifecycle:** One combined source/two layers per style; no theme-driven setStyle/remount, no extra camera fit/refetch on reload, no World-source rewrite. World/Journey/World, exact City selection, routes, clusters, markers, six semantic theme palettes, cleanup and fallback remain tested. MapView mocks now reject duplicate source/layer additions instead of silently overwriting them. No React move state, background preload, surviving timers or new per-city DOM elements.
- **F / privacy:** Boundary code logs only constant outcome/category strings; no geometry, provider response, URL/query, account/session, or upstream exception cause is logged or exposed in the DTO. Transient loss of the shared authentication database still fails closed; the frontend boundary request remains an isolated enhancement and catches errors without a global application error.
- **G / migration:** V12 unchanged, SHA-256 `FA883520C727BD23B0CD7DE1F9C6F6DF40D63A1EAE02131D6ADDB8A26CB7138B`. The full run applies and validates V1 through V12 in fresh PostGIS. V12 only creates the cache table: no rewrite of existing City/Trip/user rows. City PK/FK cascade, nonempty/valid paired geometry, constrained status, timezone-aware timestamps and primary-key lookup remain appropriate. Real persistence/auth/delete integration tests pass.
- **H / tests:** No live provider or keys; enabled boundary integration uses a mocked provider, HTTP tests bind loopback only. CI has no boundary endpoint configured and default/local integration remains disabled. Real database predicates and races are not mocked. HTTP deadlines and concurrency tests use bounded waits; cache-expiry tests use explicit times rather than sleeps.

### Explicit review decision

1. Architecture PR-ready: **yes**, provider-neutral application/cache/API with the infrastructure adapter isolated.
2. PostGIS cache: **yes after fixes**, atomic fenced writes and persistence reuse; no HTTP-spanning transaction.
3. GIS validation: **trustworthy for this narrow conservative scope**, not proof of municipality taxonomy/coverage worldwide.
4. Disabled mode: **safe**, no HTTP client/request construction; cached geometry or controlled fallback.
5. SSRF/public OSMF protection: **yes for the stated threat model**; cityId-only API, trusted server configuration, parsed host checks, HTTPS except loopback and no redirects. Operators remain responsible for permitted endpoint/DNS/egress configuration.
6. Stale/negative/temporary semantics: **correct after fixes**, 30 days / 1 day / 5 minutes, stale retention and nonnegative actual backend retry time.
7. Alice/Bob isolation: **yes**, backend visit authorization plus frontend generation/disposal guards.
8. MapLibre lifecycle: **yes in automated tests**, with the existing account-keyed application behavior noted above.
9. Fallback: **yes**, old valid geometry on temporary refresh failure, otherwise existing glow; cache failures do not break map rendering.
10. Attribution: **correct in source/layout lifecycle**, restored/deduplicated by MapLibre and absent for unused empty boundary layers. Current adapter supplies OSM data; any future non-OSM adapter would need its own verified attribution contract. Actual desktop/mobile presentation remains unverified.
11. Merge while PARTIAL: **yes**, disabled-by-default feature with implemented architecture and fallback, explicitly without a production coverage claim.
12. DONE blockers: permitted real endpoint/operator identification, representative provider and authenticated visual smoke, country-specific admin accuracy, attribution presentation and production provider availability.

**Final verification:** `mvnw.cmd --batch-mode verify` PASS: **261 unit + 92 integration tests**, zero failures/errors/skips. Fresh V1→V12 migration chain succeeded. Frontend `npm run typecheck`, `npm test -- --run` (**294 tests / 28 files**) and `npm run build` PASS. JavaScript 1,255.30 kB / 336.84 kB gzip; existing >500 kB chunk warning only. `git diff --check` and `git diff --cached --check` PASS. Added 19 backend unit cases, 3 integration cases and 4 frontend cases in this audit, with existing assertions strengthened. No real-provider/browser smoke was performed in this focused audit; no real-world coverage or visual contrast claim is made.

**Outstanding severity:** BLOCKER 0, MAJOR 0, MINOR 0 within the audited implementation. The deferred real-provider/visual checks are explicit milestone acceptance work, not represented as passing tests. Retained backlog above is unchanged except refresh-lease fencing is no longer deferred. 0.6 Agentic Trip Planner remains merged and DONE.

Audit-only changed files (relative to the already dirty Phase 1 baseline):

```text
docs/adr/0003-real-city-boundaries.md
frontend/src/features/map/MapView.test.tsx
frontend/src/features/map/cityBoundaryController.test.ts
frontend/src/features/map/cityBoundaryController.ts
frontend/src/features/map/cityBoundaryLayers.ts
src/main/java/io/github/lost2705/wandermap/travel/application/boundary/CityBoundaryService.java
src/main/java/io/github/lost2705/wandermap/travel/infrastructure/boundary/NominatimBoundaryClient.java
src/main/java/io/github/lost2705/wandermap/travel/persistence/CityBoundaryRepository.java
src/test/java/io/github/lost2705/wandermap/CityBoundaryApiIT.java
src/test/java/io/github/lost2705/wandermap/CityBoundaryDisabledApiIT.java
src/test/java/io/github/lost2705/wandermap/travel/application/boundary/CityBoundaryServiceTest.java
src/test/java/io/github/lost2705/wandermap/travel/infrastructure/boundary/NominatimBoundaryClientTest.java
```

## Stage C country-aware boundary resolution — 2026-09-10

**Verdict: 0.7 Phase 1 Real City Boundaries — DONE.** The milestone acceptance set now has deterministic automated coverage plus local real-provider and browser qualification. External lookup remains disabled by default and no production provider or worldwide coverage promise is introduced.

### Root cause and final semantics

The original resolver treated all locality-shaped administrative relations within one universal Nominatim rank interval as semantically equal. That produced a false ambiguity between Amsterdam's municipality and `woonplaats`, while Paris showed that provider `addresstype`/rank alone do not identify the commune and can also expose department or district objects with the same name.

WanderMap now defines a City Boundary as the administrative relation representing the named municipality/local government area containing the canonical visited City point. It excludes metropolitan areas, regions, departments/provinces, districts/arrondissements, neighbourhoods and merely registered settlement/`woonplaats` boundaries. This definition is implemented as country policy, not inferred from one universal `admin_level`, search rank or provider result order.

### Country policy and deterministic selection

- **NL:** admin level 8 municipality (`gemeente`); admin level 10 `woonplaats` is rejected.
- **FR:** admin level 8 commune; the known provider subdivision classification is accepted at that municipal level, while department and district/arrondissement candidates are rejected.
- **IT:** admin level 8 `comune`; province/metropolitan-city and region candidates are rejected.
- **LI:** admin level 8 `Gemeinde`; subordinate locality candidates are rejected.
- **Other countries:** the previous conservative generic locality policy remains: relation, city/town/village/municipality kind, rank 13–18 and admin level 4–10. It is explicitly a safe fallback, not a worldwide municipality ontology.

The provider adapter remains responsible only for bounded Nominatim-compatible parsing and provider-neutral candidate metadata. The application policy rejects semantically impossible candidates and assigns a small explicit preference. Existing exact name/country, source identity and PostGIS validity/coverage checks still apply. A result is selected only when it is the unique highest semantic preference; an equal best score remains UNAVAILABLE. Area, centroid, numeric rank and provider order never break ambiguity.

### Acceptance evidence

| Place | Result | Evidence |
| --- | --- | --- |
| Amsterdam, NL | AVAILABLE | relation 47811, municipality, rank 14, admin 8 selected over relation 271110, `woonplaats`/city, rank 16, admin 10 |
| Paris, FR | AVAILABLE | commune relation 7444, rank 15, admin 8 selected; department relation 71525, rank 12/admin 6 and district relation 1641193, rank 14/admin 7 rejected |
| Rome, IT | AVAILABLE | `comune` relation 41485, rank 16, admin 8 retained; broader Italian levels remain ineligible |
| Vaduz, LI | AVAILABLE | Gemeinde relation 1155956, admin 8 regression remains passing, including MultiPolygon GIS behavior |
| Malbun, LI | UNAVAILABLE | no acceptable named municipality candidate; existing visited-place glow remains the honest fallback |
| Equal-best ambiguity | UNAVAILABLE | deterministic regression proves provider order cannot pick a winner |

The final local smoke used the pinned `mediagis/nominatim` 5.3.2 image by digest, loopback port 8095 and retained regional admin-only datasets. It did not call public OSMF Nominatim. Fresh targeted cache qualification produced:

| Place | First / second status | Provider calls | First / cached latency | Stored geometry |
| --- | --- | --- | --- | --- |
| Amsterdam | AVAILABLE / AVAILABLE | 1 → 2 → 2 | 611.1 ms / 15.8 ms | valid covering MultiPolygon, relation 47811 |
| Paris | AVAILABLE / AVAILABLE | 1 → 2 → 2 | 397.5 ms / 14.3 ms | valid covering MultiPolygon, relation 7444 |
| Rome | AVAILABLE / AVAILABLE | 3 → 4 → 4 | 412.6 ms / 20.8 ms | valid covering MultiPolygon, relation 41485 |

The unchanged PostGIS persistence stored all three as EPSG:4326 MultiPolygons, `ST_IsValid=true` and `ST_Covers(canonical City point)=true`. Second requests added no provider call, proving persistent positive-cache reuse after requalification. During the original smoke, only each test City's local cache row was invalidated. For deployment rollout, V13 now invalidates all existing positive and negative boundary rows for NL, FR, IT and LI once, while leaving every other country's cache intact; subsequent lazy lookups repopulate verified results.

Authenticated browser qualification rendered the restrained real municipality polygons for Amsterdam and Paris at close World zoom, suppressed each City's approximate glow, kept clusters/markers and the single MapLibre canvas, opened exact Place Details from the Amsterdam polygon, and displayed `© OpenStreetMap contributors (city boundaries, ODbL)`. No frontend file changed in Stage C.

### Tests, verification and limits

Focused regressions cover Amsterdam/Paris candidate sets in both provider orders, Rome and Vaduz preservation, Malbun-like no-match, equal-best ambiguity, unknown-country conservative behavior, and Nominatim parsing of the provider-neutral rank/admin/kind metadata. Final backend verification passed **269 unit + 92 PostgreSQL/PostGIS integration tests**, zero failures/errors/skips, including fresh V1→V12 migrations. Frontend confidence verification passed typecheck, **294 tests in 28 files**, and production build; the existing chunk-size warning is unchanged. CI still uses fixtures, fake clients or loopback servers and never calls a live boundary provider.

Validated semantic policy scope is only NL, FR, IT and LI. Production provider availability, broad real-world coverage, admin-level correctness in other countries and mobile visual presentation are not claimed. Unknown or ambiguous places continue to return controlled UNAVAILABLE and use the existing glow. There are **0 BLOCKER, 0 MAJOR and 0 MINOR** outstanding findings within Stage C acceptance; future country expansion remains explicit deferred work rather than implicit guessing.

### PR #24 cache rollout correction — 2026-09-10

Review found that a fresh 30-day AVAILABLE row could bypass the new `MunicipalityBoundaryPolicy`, so expiry of negative entries alone was insufficient rollout protection. V13 uses `DELETE ... USING cities` to remove only `city_boundaries` rows linked to canonical City country codes NL, FR, IT and LI. It deletes no City, Country, Journey, TripStop or user data and makes no provider call. Both positive and negative rows are removed because either can encode a decision made by the former generic policy.

Migration integration coverage runs an isolated schema to V12, inserts populated positive and negative affected rows plus Journey/TripStop references, then upgrades to V13 and verifies only cache rows disappear. A separate US case verifies an unaffected cache row and City remain. The normal application migration run verifies a fresh V1→V13 chain, and an authenticated API integration regression verifies that an Amsterdam cache miss invokes the fake provider, applies the country policy, persists relation 47811 and serves the second request from cache. Final verification passed 269 unit and 95 PostgreSQL/PostGIS integration tests; frontend typecheck, 294 tests in 28 files and production build also passed. No runtime semantic-version column, TTL, resolver scoring, provider parsing, frontend code or endpoint contract changed.
