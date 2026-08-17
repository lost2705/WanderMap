package io.github.lost2705.wandermap.travel.api.dto;

import java.util.UUID;

public record TripStopPhotoResponse(
        UUID id,
        String originalFilename,
        String contentType,
        long size,
        int position,
        String contentUrl) {
}

