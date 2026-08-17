package io.github.lost2705.wandermap.travel.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record TripStopResponse(
        UUID id,
        int position,
        LocalDate arrivalDate,
        LocalDate departureDate,
        String note,
        CityResponse city,
        List<TripStopPhotoResponse> photos) {
}
