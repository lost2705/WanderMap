package io.github.lost2705.wandermap.travel.api.dto;

import jakarta.validation.constraints.Min;

public record MoveTripStopRequest(@Min(1) int position) {
}
