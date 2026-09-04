package io.github.lost2705.wandermap.ai.infrastructure.openai;

import io.github.lost2705.wandermap.ai.application.AiMessage;
import io.github.lost2705.wandermap.ai.application.AiModelClient;
import io.github.lost2705.wandermap.ai.application.AiModelRequest;
import io.github.lost2705.wandermap.ai.application.AiModelResponse;
import io.github.lost2705.wandermap.ai.application.AiProviderException;
import io.github.lost2705.wandermap.ai.application.AiStructuredOutputDefinition;
import io.github.lost2705.wandermap.ai.application.AiToolCall;
import io.github.lost2705.wandermap.ai.application.AiToolDefinition;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

public class OpenAiResponsesClient implements AiModelClient {

    private final RestClient restClient;
    private final String model;
    private final int maxOutputTokens;
    private final ObjectMapper objectMapper;

    public OpenAiResponsesClient(
            RestClient restClient,
            String model,
            int maxOutputTokens,
            ObjectMapper objectMapper) {
        this.restClient = restClient;
        this.model = model;
        this.maxOutputTokens = maxOutputTokens;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiModelResponse chat(AiModelRequest request) {
        try {
            JsonNode response = restClient.post()
                    .uri("/v1/responses")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(requestBody(request))
                    .retrieve()
                    .body(JsonNode.class);
            return parseResponse(response);
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 429) {
                throw new AiProviderException(
                        AiProviderException.Reason.RATE_LIMITED,
                        "AI provider rate limit reached",
                        exception);
            }
            throw new AiProviderException(
                    AiProviderException.Reason.UNAVAILABLE,
                    "AI provider request failed",
                    exception);
        } catch (ResourceAccessException exception) {
            throw new AiProviderException(
                    AiProviderException.Reason.UNAVAILABLE,
                    "AI provider timed out",
                    exception);
        } catch (RestClientException exception) {
            throw new AiProviderException(
                    AiProviderException.Reason.UNAVAILABLE,
                    "AI provider is unavailable",
                    exception);
        }
    }

    private Map<String, Object> requestBody(AiModelRequest request) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("instructions", request.messages().stream()
                .filter(message -> message.role() == AiMessage.Role.SYSTEM)
                .map(AiMessage::content)
                .reduce((left, right) -> left + "\n" + right)
                .orElse(""));
        body.put("input", input(request.messages()));
        body.put("tools", request.tools().stream().map(OpenAiResponsesClient::tool).toList());
        body.put("parallel_tool_calls", true);
        body.put("max_output_tokens", maxOutputTokens);
        body.put("store", false);
        body.put("include", List.of("reasoning.encrypted_content"));
        if (request.structuredOutput() != null) {
            body.put("text", Map.of("format", structuredFormat(request.structuredOutput())));
        }
        return body;
    }

    private static Map<String, Object> structuredFormat(AiStructuredOutputDefinition definition) {
        Map<String, Object> format = new LinkedHashMap<>();
        format.put("type", "json_schema");
        format.put("name", definition.name());
        format.put("description", definition.description());
        format.put("strict", true);
        format.put("schema", definition.schema());
        return format;
    }

    private List<Object> input(List<AiMessage> messages) {
        List<Object> input = new ArrayList<>();
        for (AiMessage message : messages) {
            switch (message.role()) {
                case SYSTEM -> {
                    // Responses API receives system instructions through the dedicated instructions field.
                }
                case USER -> input.add(Map.of(
                        "type", "message",
                        "role", "user",
                        "content", message.content()));
                case ASSISTANT -> appendAssistantState(input, message);
                case TOOL -> input.add(Map.of(
                        "type", "function_call_output",
                        "call_id", message.toolCallId(),
                        "output", message.content()));
            }
        }
        return input;
    }

    private void appendAssistantState(List<Object> input, AiMessage message) {
        if (message.continuationState() == null || message.continuationState().isBlank()) {
            message.toolCalls().forEach(call -> input.add(Map.of(
                    "type", "function_call",
                    "call_id", call.id(),
                    "name", call.name(),
                    "arguments", call.argumentsJson())));
            return;
        }
        try {
            JsonNode state = objectMapper.readTree(message.continuationState());
            if (!state.isArray()) {
                throw malformed();
            }
            state.forEach(input::add);
        } catch (AiProviderException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new AiProviderException(
                    AiProviderException.Reason.MALFORMED_RESPONSE,
                    "AI provider continuation state is malformed",
                    exception);
        }
    }

    private static Map<String, Object> tool(AiToolDefinition definition) {
        return Map.of(
                "type", "function",
                "name", definition.name(),
                "description", definition.description(),
                "parameters", definition.inputSchema(),
                "strict", true);
    }

    private static AiModelResponse parseResponse(JsonNode response) {
        if (response == null
                || !"completed".equals(response.path("status").asText())
                || !response.path("output").isArray()) {
            throw malformed();
        }
        List<AiToolCall> calls = new ArrayList<>();
        List<String> textParts = new ArrayList<>();
        for (JsonNode item : response.path("output")) {
            String type = item.path("type").asText();
            if ("function_call".equals(type)) {
                String callId = item.path("call_id").asText();
                String name = item.path("name").asText();
                String arguments = item.path("arguments").asText();
                if (callId.isBlank() || name.isBlank() || arguments.isBlank()) {
                    throw malformed();
                }
                calls.add(new AiToolCall(callId, name, arguments));
            } else if ("message".equals(type) && item.path("content").isArray()) {
                for (JsonNode content : item.path("content")) {
                    if ("output_text".equals(content.path("type").asText())) {
                        String text = content.path("text").asText();
                        if (!text.isBlank()) {
                            textParts.add(text);
                        }
                    }
                }
            }
        }
        if (!calls.isEmpty()) {
            return new AiModelResponse(null, calls, response.path("output").toString());
        }
        if (!textParts.isEmpty()) {
            return AiModelResponse.finalAnswer(String.join("\n", textParts));
        }
        throw malformed();
    }

    private static AiProviderException malformed() {
        return new AiProviderException(
                AiProviderException.Reason.MALFORMED_RESPONSE,
                "AI provider returned a malformed response");
    }
}
