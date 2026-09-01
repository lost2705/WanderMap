package io.github.lost2705.wandermap.travel.application;

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
        long revisitedCountryCount) {
}
