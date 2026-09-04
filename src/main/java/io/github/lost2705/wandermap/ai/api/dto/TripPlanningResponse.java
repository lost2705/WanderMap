package io.github.lost2705.wandermap.ai.api.dto;

import io.github.lost2705.wandermap.ai.application.TripPlanDraft;
import java.util.List;
import java.util.UUID;

public record TripPlanningResponse(UUID runId, TripPlanDraft plan, List<String> toolsUsed) {

    public TripPlanningResponse {
        toolsUsed = List.copyOf(toolsUsed);
    }
}
