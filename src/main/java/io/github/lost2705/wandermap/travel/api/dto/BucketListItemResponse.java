package io.github.lost2705.wandermap.travel.api.dto;

import java.time.Instant;
import java.util.UUID;

public record BucketListItemResponse(UUID id, CityResponse city, Instant createdAt, boolean visited) {
}
