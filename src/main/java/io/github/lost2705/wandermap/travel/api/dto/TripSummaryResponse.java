package io.github.lost2705.wandermap.travel.api.dto;

import java.time.LocalDate;
import java.util.UUID;

public record TripSummaryResponse(
        UUID id, String name, LocalDate startDate, LocalDate endDate, String description, int stopCount) {
}
