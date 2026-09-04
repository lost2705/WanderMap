package io.github.lost2705.wandermap.ai.application;

import java.util.List;

public record AiModelRequest(List<AiMessage> messages, List<AiToolDefinition> tools) {

    public AiModelRequest {
        messages = List.copyOf(messages);
        tools = List.copyOf(tools);
    }
}
