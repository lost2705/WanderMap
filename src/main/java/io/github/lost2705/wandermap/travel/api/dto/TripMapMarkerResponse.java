package io.github.lost2705.wandermap.travel.api.dto;

import java.math.BigDecimal;
import java.util.UUID;

/** A compact marker read model for the interactive map. */
public record TripMapMarkerResponse(
        UUID tripId,
        UUID stopId,
        int position,
        String cityName,
        BigDecimal latitude,
        BigDecimal longitude,
        CountryResponse country) {
}
