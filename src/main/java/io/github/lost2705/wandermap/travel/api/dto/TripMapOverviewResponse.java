package io.github.lost2705.wandermap.travel.api.dto;

import java.util.List;

/** Map data that avoids loading every full itinerary on application start. */
public record TripMapOverviewResponse(
        List<String> visitedCountryCodes,
        List<TripMapMarkerResponse> markers,
        long memoryCount) {
}
