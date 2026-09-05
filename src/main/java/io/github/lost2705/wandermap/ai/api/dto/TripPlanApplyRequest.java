package io.github.lost2705.wandermap.ai.api.dto;

import io.github.lost2705.wandermap.ai.application.TripPlanDraft;
import jakarta.validation.constraints.NotNull;
import java.util.UUID;

public record TripPlanApplyRequest(@NotNull TripPlanDraft plan, @NotNull UUID requestId) {
}
