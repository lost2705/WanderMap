package io.github.lost2705.wandermap.travel.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record PlaceVisitResponse(
        UUID tripId,
        String tripName,
        LocalDate tripStartDate,
        LocalDate tripEndDate,
        String tripDescription,
        UUID stopId,
        int position,
        LocalDate arrivalDate,
        LocalDate departureDate,
        String note,
        List<TripStopPhotoResponse> photos) {
}
