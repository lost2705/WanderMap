# ADR 0001: First AI travel agent architecture

- Status: Accepted
- Date: 2026-09-04

## Context

WanderMap 0.5 needs a first genuinely tool-enabled assistant that can make recommendations from an authenticated user's existing travel data and one external information source. A single prompt-to-text request would make personalization unverifiable, while direct model access to repositories, arbitrary URLs, or user identifiers would weaken the application's ownership boundary. The milestone is also intended to make the agent loop visible and testable rather than hide it behind a high-level AI framework.

The application runs on Java 21 and Spring Boot 4.1. It already has `RestClient`, user-scoped application services, and a `CurrentUserProvider` boundary. The OpenAI Responses API supports strict function tools and explicit `function_call` / `function_call_output` items, which match the required loop without another runtime dependency.

## Decision

WanderMap will use one `TravelAgent` application service with a provider-neutral `AiModelClient`. Application-owned message, tool-definition, tool-call, and response records isolate the core loop from OpenAI DTOs. The OpenAI adapter uses the existing HTTP stack and the Responses API; provider-side response storage is disabled. For stateless reasoning-model continuity, the adapter requests encrypted reasoning state and returns the opaque prior output items on the next loop iteration. This state exists only in memory for the current HTTP request, is never exposed by the public API, and is never logged.

The agent owns a short, versioned system instruction and runs an explicit bounded loop. On each iteration it asks the model for either final text or function calls, requires a completed provider response, validates each call envelope and run-unique call ID, executes known tools, appends structured results, and continues. The configurable defaults are six model iterations, twelve total tool calls per request, 100000 cumulative serialized tool-result characters, and 4000 output tokens per provider response. Final answers expose only text, a run UUID, and the stable names of successfully requested application tools.

Tools implement a small `TravelAgentTool` contract and are injected as an explicit registry. The initial registry contains:

- `get_travel_profile` — compact profile counters, highlights, and unlocked achievements;
- `get_journeys` — current-user Journeys and ordered, located stops;
- `get_bucket_list` — current-user saved places and visited/planned state;
- `get_weather` — coordinate-based current short-term Open-Meteo forecast.

Personal tools have schemas with no `userId` field and delegate to existing application services, which resolve the authenticated user through `CurrentUserProvider`. The model therefore cannot select another user. The weather adapter is behind a provider-neutral `WeatherClient`; there is no arbitrary HTTP-fetch tool.

Unknown tools, malformed arguments, and tool runtime failures become small structured error results that the model may handle. Invalid provider envelopes, provider timeouts/rate limits, and iteration exhaustion become controlled application errors. Logs record run IDs, prompt length, instruction version, iterations, requested tool names, execution duration/status, and completion/failure; they do not record prompts, tool payloads, model answers, credentials, cookies, or photo bytes.

## Alternatives considered

### Simple prompt completion

Rejected because the model could not reliably inspect current personal data or show which data informed an answer. Injecting all account data into every prompt would also be unnecessarily broad.

### High-level Spring AI agent/tool orchestration

Rejected for this milestone because its automatic tool-calling loop would obscure the lifecycle that WanderMap 0.5 is intended to make explicit. It would also add a larger framework surface for four focused tools.

### Official OpenAI Java SDK

Viable and compatible with Java 21, but not selected because the existing `RestClient` can express the small Responses API surface without adding a dependency. The provider remains replaceable behind `AiModelClient`.

### Direct repository or generic internal HTTP access

Rejected because it would bypass application ownership rules and make the model's authority too broad. Tools may call only explicit application capabilities.

### Multiple agents, RAG, embeddings, and persistent memory

Deferred because none is needed for the first recommendation flow. They would add orchestration, storage, privacy, and operational complexity before a concrete product requirement justifies it.

## Consequences

The explicit adapter and loop require more code than a one-call completion, but tool behavior, limits, current-user isolation, and failure handling are visible in tests and logs. Provider changes are localized to infrastructure, and future tools can reuse the small registry without changing the model boundary. The design does not yet provide persistent conversation history, long-term AI memory, destination search, historical climate guidance, budget/place/route tools, itinerary generation, or multi-agent collaboration.
