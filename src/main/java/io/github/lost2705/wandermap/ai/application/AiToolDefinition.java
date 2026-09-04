package io.github.lost2705.wandermap.ai.application;

import java.util.Map;

public record AiToolDefinition(String name, String description, Map<String, Object> inputSchema) {

    public AiToolDefinition {
        inputSchema = Map.copyOf(inputSchema);
    }
}
