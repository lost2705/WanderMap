package io.github.lost2705.wandermap.travel.application;

/** Stable travel counters used by the profile and deterministic achievement rules. */
public record TravelProfileMetrics(
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
