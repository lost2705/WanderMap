package io.github.lost2705.wandermap.ai.application;

import java.util.Map;

public record AiStructuredOutputDefinition(
        String name,
        String description,
        Map<String, Object> schema) {

    public AiStructuredOutputDefinition {
        schema = Map.copyOf(schema);
    }
}
