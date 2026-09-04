package io.github.lost2705.wandermap.ai.application;

import java.util.List;
import java.util.Objects;

public record AiMessage(
        Role role,
        String content,
        List<AiToolCall> toolCalls,
        String toolCallId,
        String continuationState) {

    public AiMessage {
        Objects.requireNonNull(role, "role must not be null");
        toolCalls = toolCalls == null ? List.of() : List.copyOf(toolCalls);
    }

    public static AiMessage system(String content) {
        return new AiMessage(Role.SYSTEM, content, List.of(), null, null);
    }

    public static AiMessage user(String content) {
        return new AiMessage(Role.USER, content, List.of(), null, null);
    }

    public static AiMessage assistantToolCalls(List<AiToolCall> toolCalls) {
        return assistantToolCalls(toolCalls, null);
    }

    public static AiMessage assistantToolCalls(List<AiToolCall> toolCalls, String continuationState) {
        return new AiMessage(Role.ASSISTANT, null, toolCalls, null, continuationState);
    }

    public static AiMessage toolResult(String toolCallId, String content) {
        return new AiMessage(Role.TOOL, content, List.of(), toolCallId, null);
    }

    public enum Role {
        SYSTEM,
        USER,
        ASSISTANT,
        TOOL
    }
}
