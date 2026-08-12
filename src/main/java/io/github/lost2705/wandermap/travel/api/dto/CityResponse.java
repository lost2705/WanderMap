package io.github.lost2705.wandermap.travel.api.dto;

import java.util.UUID;

public record CityResponse(UUID id, String name, CountryResponse country) {
}
