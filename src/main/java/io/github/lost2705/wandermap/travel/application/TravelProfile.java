package io.github.lost2705.wandermap.travel.application;

import java.util.List;

/**
 * Single-user travel statistics derived from persisted journeys and memories.
 */
public record TravelProfile(
        long journeyCount,
        long visitCount,
        long uniqueCityCount,
        long countryCount,
        long travelDayCount,
        long memoryCount,
        long photoCount,
        long revisitedCityCount,
        long revisitedCountryCount,
        TravelHighlights highlights,
        List<Achievement> achievements) {

    public TravelProfile {
        achievements = List.copyOf(achievements);
    }
}
