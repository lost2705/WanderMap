package io.github.lost2705.wandermap.travel.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record TripResponse(
        UUID id,
        String name,
        LocalDate startDate,
        LocalDate endDate,
        String description,
        List<TripStopResponse> stops) {
}
