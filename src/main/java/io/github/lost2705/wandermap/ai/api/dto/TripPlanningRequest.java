package io.github.lost2705.wandermap.ai.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record TripPlanningRequest(
        @NotBlank(message = "message must not be blank")
        @Size(max = 4000, message = "message must not exceed 4000 characters")
        String message) {
}
