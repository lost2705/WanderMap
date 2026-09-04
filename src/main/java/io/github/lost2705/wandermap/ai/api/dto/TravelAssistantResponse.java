package io.github.lost2705.wandermap.ai.api.dto;

import java.util.List;
import java.util.UUID;

public record TravelAssistantResponse(UUID runId, String answer, List<String> toolsUsed) {
}
