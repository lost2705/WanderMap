package io.github.lost2705.wandermap.travel.api.dto;

public record TravelProfileResponse(
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
