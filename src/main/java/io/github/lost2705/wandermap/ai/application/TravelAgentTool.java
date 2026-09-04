package io.github.lost2705.wandermap.ai.application;

public interface TravelAgentTool {

    AiToolDefinition definition();

    Object execute(String argumentsJson);
}
