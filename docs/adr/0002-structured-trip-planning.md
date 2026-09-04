# ADR 0002: Structured trip planning and refinement

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

Phase 1 is read-only. There is no plan entity, model write tool, Journey mutation, model-generated SQL, booking, live price, route-time, cost, hotel, flight, or transport integration. Invalid structured output or semantic validation returns a controlled error without a hidden repair retry. Applying a validated draft to a Journey is deferred.

Phase 2 adds `POST /api/ai/trip-plan/refine`, which accepts the current `TripPlanDraft` plus one bounded natural-language instruction and returns a complete replacement draft. It uses the same `TravelAgent`, tools, structured-output schema, limits, and `TripPlanValidator`; `wander-map-trip-planner-refinement-v1` supplies refinement-specific instructions rather than introducing a second planner or orchestration loop.

The client-supplied draft is untrusted even when it was previously returned by WanderMap. The application first validates its structural and semantic bounds. It then sends a minimized proposal to the model containing only title, summary, duration, dates, destination, pace, ordered stop details, activities, and considerations. Client `sourcesUsed`, personal flags, run metadata, authentication data, and UI state are omitted. Coordinates and country data in that proposal are context only, never evidence. Every refinement run must successfully reacquire Journeys and Bucket List data, while every final stop must be resolved by those results or `search_places`. The common validator checks the final place evidence and personal flags, and the backend replaces `sourcesUsed` with labels derived from successful observations in that run.

Refinement remains ephemeral and read-only. A failure leaves the browser's existing draft intact, and an invalid provider draft returns `AI_INVALID_PLAN` without a hidden repair call. A malformed or semantically invalid client draft is rejected as a `400 INVALID_REQUEST` before the model is invoked.

## Alternatives considered

### Free-form Markdown itinerary

Rejected because parsing presentation text cannot provide a stable or safely validated application contract.

### A direct `create_trip` tool

Rejected because it would let a model mutate persisted user data before an explicit review-and-apply workflow exists.

### Persisted TripPlan entity

Deferred because Phase 1 only needs an ephemeral draft and persistence semantics would expand the data model and lifecycle.

### A second planner agent loop

Rejected because it would duplicate limits, continuation, tool execution, security, and observability already owned by `TravelAgent`.

### Frontend parsing and validation

Rejected because model output is untrusted and the backend must own the stable API and semantic safety boundary.

## Consequences

- The frontend receives a stable typed draft that can be rendered without Markdown, raw JSON, or provider concepts.
- A future explicit apply flow can map an already validated draft into Journey commands.
- Backend validation and place-evidence tracking add code and tests, but keep hallucinated or inconsistent stops out of the API.
- The planner remains subject to the availability and limits of the configured model, city search, and short-term weather providers.
- Drafts disappear when the planner view or authenticated session is replaced; persistence and adjustment history remain future work.
- Iterative refinement is an editor workflow rather than a persisted conversation: the browser keeps only the latest validated draft and the server keeps no refinement thread or provider continuation state between requests.
- Re-establishing Journeys and Bucket List evidence on every refinement adds tool cost, but prevents client-supplied flags and sources from becoming trusted personal facts.
