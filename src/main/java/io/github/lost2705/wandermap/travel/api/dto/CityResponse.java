package io.github.lost2705.wandermap.travel.api.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record CityResponse(UUID id, String name, BigDecimal latitude, BigDecimal longitude, CountryResponse country) {
}
