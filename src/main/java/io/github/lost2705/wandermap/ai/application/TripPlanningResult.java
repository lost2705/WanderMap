package io.github.lost2705.wandermap.ai.application;

import java.util.List;
import java.util.UUID;

public record TripPlanningResult(UUID runId, TripPlanDraft plan, List<String> toolsUsed) {

    public TripPlanningResult {
        toolsUsed = List.copyOf(toolsUsed);
    }
}
