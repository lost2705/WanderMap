package io.github.lost2705.wandermap.ai.application;

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

    private final AiModelClient modelClient;
    private final ObjectMapper objectMapper;
    private final List<AiToolDefinition> definitions;
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
        this.definitions = tools.stream().map(TravelAgentTool::definition).toList();
    }

    public TravelAgentResult answer(String userMessage) {
        String message = requireMessage(userMessage);
        UUID runId = UUID.randomUUID();
        Instant startedAt = Instant.now();
        List<AiMessage> messages = new ArrayList<>();
        messages.add(AiMessage.system(SYSTEM_INSTRUCTIONS));
        messages.add(AiMessage.user(message));
        LinkedHashSet<String> toolsUsed = new LinkedHashSet<>();
        LinkedHashSet<String> seenToolCallIds = new LinkedHashSet<>();
        int toolCallCount = 0;
        int toolResultCharacterCount = 0;

        LOGGER.info("travel_agent.run.started runId={} promptLength={} instructionsVersion={}",
                runId, message.length(), SYSTEM_INSTRUCTIONS_VERSION);
        try {
            for (int iteration = 1; iteration <= maximumToolIterations; iteration++) {
                LOGGER.info("travel_agent.model.iteration runId={} iteration={}", runId, iteration);
                AiModelResponse response = modelClient.chat(new AiModelRequest(messages, definitions));
                validateResponse(response, seenToolCallIds);

                if (!response.toolCalls().isEmpty()) {
                    if (response.toolCalls().size() > maximumToolCalls - toolCallCount) {
                        throw new AgentToolCallLimitException(maximumToolCalls);
                    }
                    toolCallCount += response.toolCalls().size();
                    LOGGER.info("travel_agent.tools.requested runId={} iteration={} tools={}",
                            runId,
                            iteration,
                            response.toolCalls().stream().map(AiToolCall::name).toList());
                    messages.add(AiMessage.assistantToolCalls(
                            response.toolCalls(), response.continuationState()));
                    for (AiToolCall toolCall : response.toolCalls()) {
                        AiMessage toolResult = executeTool(runId, toolCall, toolsUsed);
                        if (toolResult.content().length()
                                > maximumToolResultCharacters - toolResultCharacterCount) {
                            throw new AgentContextLimitException(maximumToolResultCharacters);
                        }
                        toolResultCharacterCount += toolResult.content().length();
                        messages.add(toolResult);
                    }
                    continue;
                }

                if (response.finalText() == null || response.finalText().isBlank()) {
                    throw new AiProviderException(
                            AiProviderException.Reason.MALFORMED_RESPONSE,
                            "AI provider returned neither an answer nor a tool call");
                }
                LOGGER.info("travel_agent.run.completed runId={} iterations={} toolsUsed={} durationMs={}",
                        runId,
                        iteration,
                        toolsUsed,
                        Duration.between(startedAt, Instant.now()).toMillis());
                return new TravelAgentResult(runId, response.finalText().strip(), List.copyOf(toolsUsed));
            }
        } catch (RuntimeException exception) {
            LOGGER.warn("travel_agent.run.failed runId={} durationMs={} failureType={}",
                    runId,
                    Duration.between(startedAt, Instant.now()).toMillis(),
                    exception.getClass().getSimpleName());
            throw exception;
        }

        LOGGER.warn("travel_agent.run.limit_reached runId={} iterations={}", runId, maximumToolIterations);
        throw new AgentIterationLimitException(maximumToolIterations);
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

    private AiMessage executeTool(UUID runId, AiToolCall toolCall, LinkedHashSet<String> toolsUsed) {
        Instant startedAt = Instant.now();
        String status = "failure";
        String result;
        TravelAgentTool tool = toolsByName.get(toolCall.name());
        try {
            if (tool == null) {
                result = json(new ToolFailure("UNKNOWN_TOOL", "The requested tool is not available."));
            } else {
                toolsUsed.add(tool.definition().name());
                result = json(new ToolSuccess(tool.execute(toolCall.argumentsJson())));
                status = "success";
            }
        } catch (ToolArgumentException exception) {
            result = json(new ToolFailure("INVALID_ARGUMENTS", exception.getMessage()));
        } catch (RuntimeException exception) {
            result = json(new ToolFailure("TOOL_FAILED", "The tool could not complete its request."));
        }
        LOGGER.info("travel_agent.tool.executed runId={} tool={} status={} durationMs={}",
                runId,
                toolCall.name(),
                status,
                Duration.between(startedAt, Instant.now()).toMillis());
        return AiMessage.toolResult(toolCall.id(), result);
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
