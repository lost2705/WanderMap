# ADR 0002: Structured trip planning, refinement, review and apply

## Status

Accepted

## Context

WanderMap 0.5 introduced one authenticated, tool-enabled Travel Assistant with an explicit bounded loop. Phase 0.6 needs a real trip-planning capability that a later apply flow can consume reliably. A prose or Markdown itinerary would force the frontend to parse model text, while allowing the model to create a Journey would cross the current read-only product and security boundary.

The planner must be able to use existing personal travel facts and resolve new destinations without treating a geocoder as a recommendation engine. Its result also needs semantic checks that JSON Schema alone cannot express, including inclusive date duration, the sum of days allocated to stops, canonical place evidence, and consistency of personal-history flags.

## Decision

WanderMap will expose `POST /api/ai/trip-plan` as a contract distinct from the free-text assistant endpoint. It accepts natural language and returns a provider-neutral `TripPlanDraft`; it never returns raw model output.

Planning reuses the single `TravelAgent` orchestration loop and its existing iteration, tool-call, tool-result, and output-token limits. A separate planning instruction version, `wander-map-trip-planner-v1`, selects a strict structured-output definition while leaving the 0.5 assistant instructions and text response contract unchanged. `AiModelRequest` represents the schema through an application-owned abstraction; the OpenAI adapter translates it to the Responses API `text.format` JSON Schema contract with strict mode enabled. Tool-call continuation remains part of the same response flow.

The planner can call the existing profile, Journey, Bucket List, and short-term weather tools plus one `search_places` tool. The new tool delegates to `CitySearchService`, exposes only normalized place fields, accepts no user identifier or arbitrary URL, and resolves place identity rather than ranking destinations. Every final stop must be supported by successful tool evidence, with matching place names, ISO country code, and coordinates.

After deserialization, application validation enforces bounded strings and collections, 1–60 inclusive trip days, 1–12 unique resolved stops, valid coordinates and country codes, no duplicate physical city, no silently invented concrete dates, inclusive start/end consistency, and `sum(daysAtStop) == durationDays`. It also verifies the `bucketListMatch` and `alreadyVisited` flags against successful personal tool observations. The backend derives public source labels from those observations instead of trusting model-authored source claims.

Phase 1 is read-only. There is no plan entity, model write tool, model-generated SQL, booking, live price, route-time, cost, hotel, flight, or transport integration. Invalid structured output or semantic validation returns a controlled error without a hidden repair retry. Phase 3 adds explicit deterministic application of the reviewed draft as described below.

Phase 2 adds `POST /api/ai/trip-plan/refine`, which accepts the current `TripPlanDraft` plus one bounded natural-language instruction and returns a complete replacement draft. It uses the same `TravelAgent`, tools, structured-output schema, limits, and `TripPlanValidator`; `wander-map-trip-planner-refinement-v1` supplies refinement-specific instructions rather than introducing a second planner or orchestration loop.

The client-supplied draft is untrusted even when it was previously returned by WanderMap. The application first validates its structural and semantic bounds. It then sends a minimized proposal to the model containing only title, summary, duration, dates, destination, pace, ordered stop details, activities, and considerations. Client `sourcesUsed`, personal flags, run metadata, authentication data, and UI state are omitted. Coordinates and country data in that proposal are context only, never evidence. Every refinement run must successfully reacquire Journeys and Bucket List data, while every final stop must be resolved by those results or `search_places`. The common validator checks the final place evidence and personal flags, and the backend replaces `sourcesUsed` with labels derived from successful observations in that run.

Refinement remains ephemeral and read-only. A failure leaves the browser's existing draft intact, and an invalid provider draft returns `AI_INVALID_PLAN` without a hidden repair call. A malformed or semantically invalid client draft is rejected as a `400 INVALID_REQUEST` before the model is invoked.

### Phase 3: Review and apply

The completed workflow is Draft → Refine → Review → Apply. The current final draft is the review screen; only the explicit **Create Journey** button invokes `POST /api/ai/trip-plan/apply`. The request contains `{plan: TripPlanDraft, requestId: UUID}` and returns the existing `TripResponse` with HTTP 200 for both initial success and replay. There is no persistent plan, autosave, AI provenance column, or link from the created Journey back to a draft.

`TripPlanningController` delegates to `TripPlanApplyService`. This service depends on validation, canonical place resolution, normal `TripService` creation, current-user identity and a narrow idempotency repository. It has no `TravelAgent`, `AiModelClient`, tool registry, or provider dependency. Apply therefore works with AI disabled and requires no model call, repair, confirmation, or provider key. All five planning tools remain read-only, and Apply is not a tool.

All client draft fields remain untrusted. The common validator runs before any transaction or place search, including string/list bounds, 1–12 stops, 1–60 days, inclusive dates and allocation totals. Raw string lengths and decimal precision/scale are bounded before normalization. `sourcesUsed` and personal flags are validated as contract input but never become persisted business facts. Unknown ownership fields have no target in the explicit request DTO/application mapping.

`VerifiedCityResolutionService` first checks an existing City with the complete country-code/normalized-name/coordinate identity and matching country name. It reuses `City.normalizeName` (whitespace collapse and ROOT lower-case) and `CityLocation` (six decimal places, HALF_UP). If that identity is absent, it calls provider-neutral `CitySearchService` using only the bounded city name. All submitted identity fields must match a single result after the same normalization; only that result's values reach `CityResolutionService`. The service never combines a name from one result with another result's coordinates. Unknown combinations return `400 PLACE_UNRESOLVED`; a search outage retains `503 GEOCODING_UNAVAILABLE`.

Unlike the model-output validator's 0.01-degree evidence tolerance, Apply requires exact six-decimal identity. Sub-rounding differences reuse the same City; a larger arbitrary displacement is rejected unless it is independently verified as an actual search result. Aliases/transliteration and moved provider coordinates are not guessed. Same-name cities in different countries or at distinct coordinates remain independent; existing located coordinates are never overwritten. Legacy unlocated cities may be enriched using verified provider data through the established resolver. Duplicate resolved City IDs, or aliases at identical canonical coordinates within a country, are rejected before Journey creation.

Apply maps only title → Trip name, start/end → Trip dates, and the draft's list order → `Trip.addStop` positions 1..N. Both Journey dates can remain null; when present they must span `durationDays` inclusively. Summary, destination/pace, reasons, activities, considerations, sources and flags are not persisted. Although journal fields exist, planned suggestions are not travel memories. Per-stop dates/notes remain null: `daysAtStop` is validated draft allocation, not a journal arrival/departure promise. The resulting ordinary user-owned Journey uses all normal editing, stop, Memory, photo and map flows. Bucket List rows are unchanged; visited status, profile counts and achievements change only through their normal derived read models.

### Transaction and idempotency

Flyway V11 adds only `trip_plan_apply_requests`: composite primary key `(user_id, request_id)`, typed-payload SHA-256, nullable Trip FK, and creation time. It stores no draft or AI metadata. The key is scoped to `CurrentUserProvider`; different users may reuse a UUID independently. The hash covers a canonical typed draft, including otherwise ephemeral fields: Trip title is stripped, City/country names use domain normalization, coordinates use six-decimal HALF_UP identity, optional null/absent lists become empty, and the unique source-label set is sorted. JSON property order, numeric spelling and sub-rounding coordinate differences are immaterial. Stop, activity and consideration order remain meaningful; changing prose/flags also deliberately conflicts under the full-draft contract. A matching request returns the original Journey ID and its current ordinary Trip representation. Different payload → `409 CONFLICT`. Deleting the Journey sets its ledger FK to null and retains a tombstone, so replay cannot recreate deleted work. Keys have no expiry in Phase 3.

For local keys created before the focused audit, replay also accepts the original typed-payload hash. These existing rows are not rewritten or removed. Such legacy keys require the original draft representation: arbitrary equivalent historical decimal spellings cannot be reconstructed from a hash without retaining the draft. New keys use canonical hashing throughout.

`TransactionTemplate` uses the existing JPA transaction manager. PostgreSQL `INSERT ... ON CONFLICT DO NOTHING` claims the key through its unique constraint; a concurrent duplicate waits for the first transaction. A separate subsequent SELECT observes its committed result under PostgreSQL's default READ COMMITTED isolation. JPA Trip/City writes and the JDBC ledger participate in the same transaction. Trip/stops are flushed before the completion FK update. A resolution/stop/flush/commit failure rolls back the Journey, stops, newly created or enriched City state and key together; retry can claim the key again. Database failures return controlled `503 APPLY_UNAVAILABLE`, and the browser retains the same key for retry. A race to create the same new City under different keys may hit the existing City unique index; it cannot create duplicate identities, and the failed transaction can be retried safely.

The PostgreSQL behavior is documented in [transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html); Spring supports shared JDBC/JPA connections through [JpaTransactionManager](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/orm/jpa/JpaTransactionManager.html). This narrow durable ledger is preferred to an in-memory lock, button disabling alone, or a generic idempotency framework. Existing migrations/data are preserved.

Legacy unlocated City enrichment takes a row-level pessimistic write lock while selecting the still-unlocated row. Under READ COMMITTED a concurrent loser rechecks the null-coordinate predicate after waiting, so two different verified places cannot overwrite one City and move each other's saved stops. All resolver write callers already supply a transaction; located lookups and coordinate-less fallback behavior are unchanged. Lock/uniqueness failures during Apply retain the controlled rollback/retry contract. PostgreSQL integration tests force overlapping key claims, competing new-City inserts, and different-location enrichment using latches/database locks rather than relying on scheduling alone.

### Frontend and security

Creation retains the visible plan, disables Apply/refinement/reset controls and announces progress. Network/5xx failure preserves the draft/instruction and retries the same request ID; a successful refinement or New plan starts a new key. A `409 CONFLICT` disables Apply for that draft and asks the user to check Journeys before explicitly replacing the draft; it never silently rotates the key. Success closes Planner, upserts the returned Journey, selects it, and independently refreshes map overview, Travel Profile and Bucket List visited state without a page reload or MapView remount. A secondary refresh failure does not turn successful creation into an Apply failure or resurrect its draft/key. No automatic persistence occurs after generation/refinement or from Enter in the refinement textarea.

Authentication and CSRF use the normal write-endpoint policy. Ownership comes only from `CurrentUserProvider`, while shared City identity grants no access to another user's Trip. The authenticated React tree is keyed by user ID, and Apply completion additionally checks component lifetime and client session generation. The central request helper refuses to dispatch after a session change while awaiting CSRF. Late Alice responses cannot trigger Bob's navigation, refresh or success state.

`trip_plan_apply.started`, `.completed` and `.failed` log only counts, elapsed time and exception category. Completion is logged after transaction commit. They contain no payload, coordinates, text, account identifiers, cookies or tool history.

The datasource also disables pgJDBC `logServerErrorDetail`: an ordinary City uniqueness race otherwise makes Hibernate log the conflicting row's name and coordinates even when application logging is safe. This keeps minimal error/SQLState diagnostics but omits sensitive server detail from JDBC messages ([driver documentation](https://jdbc.postgresql.org/documentation/use/)). An integration assertion captures the real failure log. Database-server logging is separately administered; do not enable SQL bind-value logging in production.

## Alternatives considered

### Free-form Markdown itinerary

Rejected because parsing presentation text cannot provide a stable or safely validated application contract.

### A direct `create_trip` tool

Rejected because database writes require a deterministic application service after an explicit user action, even when the draft was generated by a model.

### Persisted TripPlan entity

Deferred because Phase 1 only needs an ephemeral draft and persistence semantics would expand the data model and lifecycle.

### A second planner agent loop

Rejected because it would duplicate limits, continuation, tool execution, security, and observability already owned by `TravelAgent`.

### Frontend parsing and validation

Rejected because model output is untrusted and the backend must own the stable API and semantic safety boundary.

## Consequences

- The frontend receives a stable typed draft that can be rendered without Markdown, raw JSON, or provider concepts.
- Explicit Apply revalidates untrusted drafts and maps only verified canonical places into ordinary Journey commands.
- Backend validation and place-evidence tracking add code and tests, but keep hallucinated or inconsistent stops out of the API.
- The planner remains subject to the availability and limits of the configured model, city search, and short-term weather providers.
- Drafts disappear when the planner view or authenticated session is replaced; persistence and adjustment history remain future work.
- Iterative refinement is an editor workflow rather than a persisted conversation: the browser keeps only the latest validated draft and the server keeps no refinement thread or provider continuation state between requests.
- Re-establishing Journeys and Bucket List evidence on every refinement adds tool cost, but prevents client-supplied flags and sources from becoming trusted personal facts.
- Apply requires no model, but new place verification still depends on the city-search provider. Database uniqueness remains the last guard against cross-request City races.
- Durable idempotency costs one small row per successful apply and retains deleted-Journey tombstones. Draft persistence, a manual drag/drop planner editor, localization, richer planner fields and ledger retention administration remain deferred.
