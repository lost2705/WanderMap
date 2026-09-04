package io.github.lost2705.wandermap.ai.application;

import java.util.List;
import java.util.UUID;

public record TravelAgentResult(UUID runId, String answer, List<String> toolsUsed) {

    public TravelAgentResult {
        toolsUsed = List.copyOf(toolsUsed);
    }
}
