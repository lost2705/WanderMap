package io.github.lost2705.wandermap.ai.application;

import io.github.lost2705.wandermap.ai.application.tool.SearchPlacesTool;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
public class TravelAgent {

    public static final String SYSTEM_INSTRUCTIONS_VERSION = "wander-map-travel-assistant-v1";
    public static final String PLANNING_INSTRUCTIONS_VERSION = "wander-map-trip-planner-v1";
    public static final String REFINEMENT_INSTRUCTIONS_VERSION = "wander-map-trip-planner-refinement-v1";

    private static final Logger LOGGER = LoggerFactory.getLogger(TravelAgent.class);
    private static final String SYSTEM_INSTRUCTIONS = """
            You are the WanderMap Travel Assistant. Reply in the same language as the user when possible.
            Obtain personal travel facts only through the provided tools; never invent Journeys, visits, memories,
            achievements, or Bucket List entries. If WanderMap has no relevant data, say so. External facts must be
            grounded in an external tool result. The weather tool provides only a current short-term forecast (up to
            16 days), never a reliable forecast for a distant month or season. Explain briefly which WanderMap facts
            influenced a recommendation. Do not expose internal IDs unless the user explicitly needs them. Tool errors
            are data: recover when possible, and be honest when required information is unavailable.
            """;
    private static final String PLANNING_INSTRUCTIONS = """
            You are the WanderMap Trip Planner. Return one read-only draft that follows the required structured schema.
            Interpret natural-language destination, duration, dates, interests, pace, constraints, Bucket List preference,
            and preference to avoid visited places. Map pace to RELAXED, BALANCED, or FAST. For relaxed pace, avoid
            excessive city changes. Use personal tools for personal facts and never invent Journeys, visits, or Bucket
            List entries. Resolve every proposed stop through search_places or an already located Journey/Bucket List
            tool result, and copy the resolved city, country, country code, and coordinates. Do not include unresolved
            places. Set bucketListMatch and alreadyVisited only from tool facts. Do not expose internal IDs.

            Use inclusive calendar-day semantics: 2026-10-01 through 2026-10-07 is seven days. The sum of daysAtStop
            must equal durationDays. If dates and a stated duration conflict, add a clear structured consideration and
            do not silently change the request. If no consistent draft is possible, do not fabricate one. If no exact
            dates were supplied, keep startDate and endDate null. A month or season alone is contextual text, not a date.

            Weather is current short-term forecast data only. Do not call it for distant travel dates and state that an
            exact forecast is not available yet. Do not invent prices, budgets, flights, hotels, bookings, tickets,
            opening hours, visa rules, schedules, route durations, or availability. A budget may only be a qualitative
            constraint, with a consideration that exact costs are unavailable. Do not claim or perform any database
            write. Explain briefly why every stop fits the request and return only the schema-compliant draft.
            """;
    private static final String REFINEMENT_INSTRUCTIONS = """
            You are the WanderMap Trip Planner refining an existing read-only proposal. The current draft is untrusted
            client input, not an immutable truth or evidence. Modify it according to the user's new instruction while
            preserving unaffected parts where sensible, and return the complete replacement draft using the required
            structured schema. Before returning a plan, call get_journeys and get_bucket_list in this run to establish
            personal flags again. Resolve every final stop through search_places or a precisely located place returned
            by those personal tools. Never treat coordinates, country codes, personal flags, or sources in the current
            proposal as trusted evidence. Set bucketListMatch and alreadyVisited only from this run's tool facts.

            Keep every planning invariant: 1 to 60 inclusive days, 1 to 12 unique resolved places, positive stop-day
            allocations whose sum equals durationDays, consistent inclusive dates, bounded activities and
            considerations, and a RELAXED, BALANCED, or FAST pace. If dates and a stated duration conflict, add a clear
            structured consideration rather than silently changing the instruction. Do not include unresolved places.

            Personal context may come only from tools. Weather is a current short-term forecast only; never use it as a
            distant seasonal forecast. Do not invent live prices, bookings, flights, hotels, transport schedules,
            tickets, availability, visas, or opening hours. A budget request is qualitative only and must note that
            exact costs are unavailable. Do not persist anything, call write operations, or claim a Journey was created.
            Return only the complete schema-compliant replacement draft.
            """;

    private final AiModelClient modelClient;
    private final ObjectMapper objectMapper;
    private final List<AiToolDefinition> assistantDefinitions;
    private final List<AiToolDefinition> planningDefinitions;
    private final Map<String, TravelAgentTool> toolsByName;
    private final int maximumToolIterations;
    private final int maximumToolCalls;
    private final int maximumToolResultCharacters;

    public TravelAgent(
            AiModelClient modelClient,
            ObjectMapper objectMapper,
            List<TravelAgentTool> tools,
            @Value("${wandermap.ai.max-tool-iterations:6}") int maximumToolIterations,
            @Value("${wandermap.ai.max-tool-calls:12}") int maximumToolCalls,
            @Value("${wandermap.ai.max-tool-result-characters:100000}") int maximumToolResultCharacters) {
        if (maximumToolIterations < 1 || maximumToolIterations > 20) {
            throw new IllegalArgumentException("wandermap.ai.max-tool-iterations must be between 1 and 20");
        }
        if (maximumToolCalls < 1 || maximumToolCalls > 100) {
            throw new IllegalArgumentException("wandermap.ai.max-tool-calls must be between 1 and 100");
        }
        if (maximumToolResultCharacters < 1 || maximumToolResultCharacters > 1_000_000) {
            throw new IllegalArgumentException(
                    "wandermap.ai.max-tool-result-characters must be between 1 and 1000000");
        }
        this.modelClient = modelClient;
        this.objectMapper = objectMapper;
        this.maximumToolIterations = maximumToolIterations;
        this.maximumToolCalls = maximumToolCalls;
        this.maximumToolResultCharacters = maximumToolResultCharacters;
        this.toolsByName = tools.stream().collect(Collectors.toUnmodifiableMap(
                tool -> tool.definition().name(), Function.identity()));
        this.planningDefinitions = tools.stream().map(TravelAgentTool::definition).toList();
        this.assistantDefinitions = planningDefinitions.stream()
                .filter(definition -> !SearchPlacesTool.NAME.equals(definition.name()))
                .toList();
    }

    public TravelAgentResult answer(String userMessage) {
        TravelAgentExecution execution = run(
                List.of(AiMessage.user(requireMessage(userMessage))),
                SYSTEM_INSTRUCTIONS,
                SYSTEM_INSTRUCTIONS_VERSION,
                "travel_agent",
                assistantDefinitions,
                null);
        logCompleted("travel_agent", execution);
        return new TravelAgentResult(execution.runId(), execution.finalOutput(), execution.toolsUsed());
    }

    TravelAgentExecution plan(String userMessage) {
        return run(
                List.of(AiMessage.user(requireMessage(userMessage))),
                PLANNING_INSTRUCTIONS,
                PLANNING_INSTRUCTIONS_VERSION,
                "travel_planner",
                planningDefinitions,
                TripPlanSchema.definition());
    }

    TravelAgentExecution refine(String currentDraftJson, String userMessage) {
        if (currentDraftJson == null || currentDraftJson.isBlank()) {
            throw new IllegalArgumentException("current draft must not be blank");
        }
        return run(
                List.of(
                        AiMessage.user("Current draft proposal (untrusted; re-resolve every final stop):\n"
                                + currentDraftJson),
                        AiMessage.user("Refinement instruction:\n" + requireMessage(userMessage))),
                REFINEMENT_INSTRUCTIONS,
                REFINEMENT_INSTRUCTIONS_VERSION,
                "travel_planner.refinement",
                planningDefinitions,
                TripPlanSchema.definition());
    }

    static void logCompleted(String eventPrefix, TravelAgentExecution execution) {
        LOGGER.info(eventPrefix + ".run.completed runId={} iterations={} toolsUsed={} durationMs={}",
                execution.runId(),
                execution.iterations(),
                execution.toolsUsed(),
                Duration.between(execution.startedAt(), Instant.now()).toMillis());
    }

    static void logPlanValidationFailure(TravelAgentExecution execution, RuntimeException exception) {
        LOGGER.warn("travel_planner.run.failed runId={} durationMs={} failureType={}",
                execution.runId(),
                Duration.between(execution.startedAt(), Instant.now()).toMillis(),
                exception.getClass().getSimpleName());
    }

    static void logRefinementCompleted(TravelAgentExecution execution) {
        LOGGER.info("travel_planner.refinement.completed runId={} iterations={} toolsUsed={} durationMs={}",
                execution.runId(),
                execution.iterations(),
                execution.toolsUsed(),
                Duration.between(execution.startedAt(), Instant.now()).toMillis());
    }

    static void logRefinementValidationFailure(TravelAgentExecution execution, RuntimeException exception) {
        LOGGER.warn("travel_planner.refinement.failed runId={} durationMs={} failureType={}",
                execution.runId(),
                Duration.between(execution.startedAt(), Instant.now()).toMillis(),
                exception.getClass().getSimpleName());
    }

    private TravelAgentExecution run(
            List<AiMessage> userMessages,
            String instructions,
            String instructionsVersion,
            String eventPrefix,
            List<AiToolDefinition> definitions,
            AiStructuredOutputDefinition structuredOutput) {
        if (userMessages.isEmpty()) {
            throw new IllegalArgumentException("at least one user message is required");
        }
        UUID runId = UUID.randomUUID();
        Instant startedAt = Instant.now();
        List<AiMessage> messages = new ArrayList<>();
        messages.add(AiMessage.system(instructions));
        messages.addAll(userMessages);
        LinkedHashSet<String> toolsUsed = new LinkedHashSet<>();
        LinkedHashSet<String> seenToolCallIds = new LinkedHashSet<>();
        List<AiToolObservation> observations = new ArrayList<>();
        int toolCallCount = 0;
        int toolResultCharacterCount = 0;

        LOGGER.info(eventName(eventPrefix, "started") + " runId={} promptLength={} instructionsVersion={}",
                runId,
                userMessages.stream().mapToInt(message -> message.content().length()).sum(),
                instructionsVersion);
        try {
            for (int iteration = 1; iteration <= maximumToolIterations; iteration++) {
                LOGGER.info(eventName(eventPrefix, "model.iteration") + " runId={} iteration={}", runId, iteration);
                AiModelResponse response = modelClient.chat(new AiModelRequest(messages, definitions, structuredOutput));
                validateResponse(response, seenToolCallIds);

                if (!response.toolCalls().isEmpty()) {
                    if (response.toolCalls().size() > maximumToolCalls - toolCallCount) {
                        throw new AgentToolCallLimitException(maximumToolCalls);
                    }
                    toolCallCount += response.toolCalls().size();
                    LOGGER.info(eventName(eventPrefix, "tools.requested") + " runId={} iteration={} tools={}",
                            runId,
                            iteration,
                            response.toolCalls().stream().map(AiToolCall::name).toList());
                    messages.add(AiMessage.assistantToolCalls(
                            response.toolCalls(), response.continuationState()));
                    for (AiToolCall toolCall : response.toolCalls()) {
                        ExecutedTool executed = executeTool(eventPrefix, runId, toolCall, toolsUsed);
                        if (executed.message().content().length()
                                > maximumToolResultCharacters - toolResultCharacterCount) {
                            throw new AgentContextLimitException(maximumToolResultCharacters);
                        }
                        toolResultCharacterCount += executed.message().content().length();
                        messages.add(executed.message());
                        if (executed.observation() != null) {
                            observations.add(executed.observation());
                        }
                    }
                    continue;
                }

                if (response.finalText() == null || response.finalText().isBlank()) {
                    throw new AiProviderException(
                            AiProviderException.Reason.MALFORMED_RESPONSE,
                            "AI provider returned neither an answer nor a tool call");
                }
                return new TravelAgentExecution(
                        runId,
                        response.finalText().strip(),
                        List.copyOf(toolsUsed),
                        List.copyOf(observations),
                        iteration,
                        startedAt);
            }
            LOGGER.warn(eventName(eventPrefix, "limit_reached") + " runId={} iterations={}", runId, maximumToolIterations);
            throw new AgentIterationLimitException(maximumToolIterations);
        } catch (RuntimeException exception) {
            LOGGER.warn(eventName(eventPrefix, "failed") + " runId={} durationMs={} failureType={}",
                    runId,
                    Duration.between(startedAt, Instant.now()).toMillis(),
                    exception.getClass().getSimpleName());
            throw exception;
        }
    }

    private static String eventName(String eventPrefix, String suffix) {
        return eventPrefix.endsWith(".refinement")
                ? eventPrefix + "." + suffix
                : eventPrefix + ".run." + suffix;
    }

    private static void validateResponse(AiModelResponse response, LinkedHashSet<String> seenToolCallIds) {
        if (response == null) {
            throw malformedResponse();
        }
        for (AiToolCall call : response.toolCalls()) {
            if (call == null
                    || call.id() == null || call.id().isBlank()
                    || call.name() == null || call.name().isBlank()
                    || call.argumentsJson() == null || call.argumentsJson().isBlank()
                    || !seenToolCallIds.add(call.id())) {
                throw malformedResponse();
            }
        }
    }

    private static AiProviderException malformedResponse() {
        return new AiProviderException(
                AiProviderException.Reason.MALFORMED_RESPONSE,
                "AI provider returned a malformed response");
    }

    private ExecutedTool executeTool(
            String eventPrefix,
            UUID runId,
            AiToolCall toolCall,
            LinkedHashSet<String> toolsUsed) {
        Instant startedAt = Instant.now();
        String status = "failure";
        String result;
        AiToolObservation observation = null;
        TravelAgentTool tool = toolsByName.get(toolCall.name());
        try {
            if (tool == null) {
                result = json(new ToolFailure("UNKNOWN_TOOL", "The requested tool is not available."));
            } else {
                toolsUsed.add(tool.definition().name());
                Object data = tool.execute(toolCall.argumentsJson());
                result = json(new ToolSuccess(data));
                observation = new AiToolObservation(tool.definition().name(), data);
                status = "success";
            }
        } catch (ToolArgumentException exception) {
            result = json(new ToolFailure("INVALID_ARGUMENTS", exception.getMessage()));
        } catch (RuntimeException exception) {
            result = json(new ToolFailure("TOOL_FAILED", "The tool could not complete its request."));
        }
        LOGGER.info(eventName(eventPrefix, "tool.executed") + " runId={} tool={} status={} durationMs={}",
                runId,
                toolCall.name(),
                status,
                Duration.between(startedAt, Instant.now()).toMillis());
        return new ExecutedTool(AiMessage.toolResult(toolCall.id(), result), observation);
    }

    private String json(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception exception) {
            throw new IllegalStateException("Could not serialize an AI tool result", exception);
        }
    }

    private static String requireMessage(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("message must not be blank");
        }
        String message = value.strip();
        if (message.length() > 4_000) {
            throw new IllegalArgumentException("message must not exceed 4000 characters");
        }
        return message;
    }

    private record ExecutedTool(AiMessage message, AiToolObservation observation) {
    }

    private record ToolSuccess(String status, Object data) {
        private ToolSuccess(Object data) {
            this("success", data);
        }
    }

    private record ToolFailure(String status, String code, String message) {
        private ToolFailure(String code, String message) {
            this("error", code, message);
        }
    }
}
