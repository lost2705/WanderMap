package io.github.lost2705.wandermap.travel.api.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record TravelProfileResponse(
        long journeyCount,
        long visitCount,
        long uniqueCityCount,
        long countryCount,
        long travelDayCount,
        long memoryCount,
        long photoCount,
        long revisitedCityCount,
        long revisitedCountryCount,
        TravelHighlightsResponse highlights,
        List<AchievementResponse> achievements) {

    public record TravelHighlightsResponse(
            CityHighlightResponse mostVisitedCity,
            CountryHighlightResponse mostVisitedCountry,
            JourneyDurationHighlightResponse longestJourney,
            JourneyDateHighlightResponse mostRecentJourney,
            JourneyMemoryHighlightResponse mostMemoryRichJourney) {
    }

    public record CityHighlightResponse(
            UUID cityId,
            String cityName,
            String countryCode,
            String countryName,
            long visitCount) {
    }

    public record CountryHighlightResponse(String countryCode, String countryName, long visitCount) {
    }

    public record JourneyDurationHighlightResponse(UUID journeyId, String journeyName, long dayCount) {
    }

    public record JourneyDateHighlightResponse(UUID journeyId, String journeyName, LocalDate startDate) {
    }

    public record JourneyMemoryHighlightResponse(UUID journeyId, String journeyName, long memoryCount) {
    }

    public record AchievementResponse(
            String code,
            String title,
            String description,
            String category,
            boolean unlocked,
            long currentValue,
            long targetValue,
            int progressPercent) {
    }
}
