package io.github.lost2705.wandermap.travel.api.dto;

import java.util.List;

public record PlaceDetailsResponse(
        CityResponse city,
        int visitCount,
        List<PlaceVisitResponse> visits) {
}
