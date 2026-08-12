package io.github.lost2705.wandermap.travel.api.dto;

import java.util.UUID;

public record TripStopResponse(UUID id, int position, CityResponse city) {
}
