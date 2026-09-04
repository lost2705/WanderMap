package io.github.lost2705.wandermap.ai.application;

import java.util.List;

public record AiModelResponse(String finalText, List<AiToolCall> toolCalls, String continuationState) {

    public AiModelResponse {
        toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
    }

    public AiModelResponse(String finalText, List<AiToolCall> toolCalls) {
        this(finalText, toolCalls, null);
    }

    public static AiModelResponse finalAnswer(String text) {
        return new AiModelResponse(text, List.of(), null);
    }

    public static AiModelResponse toolCalls(AiToolCall... calls) {
        return new AiModelResponse(null, List.of(calls), null);
    }
}
