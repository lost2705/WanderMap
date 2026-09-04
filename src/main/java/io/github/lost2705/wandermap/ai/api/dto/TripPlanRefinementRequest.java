package io.github.lost2705.wandermap.ai.api.dto;

import io.github.lost2705.wandermap.ai.application.TripPlanDraft;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record TripPlanRefinementRequest(
        @NotNull(message = "plan must not be null")
        TripPlanDraft plan,
        @NotBlank(message = "message must not be blank")
        @Size(max = 4000, message = "message must not exceed 4000 characters")
        String message) {
}
