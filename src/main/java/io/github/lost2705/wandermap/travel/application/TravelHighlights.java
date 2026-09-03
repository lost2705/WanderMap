package io.github.lost2705.wandermap.travel.application;

import java.time.LocalDate;
import java.util.UUID;

public record TravelHighlights(
        CityHighlight mostVisitedCity,
        CountryHighlight mostVisitedCountry,
        JourneyDurationHighlight longestJourney,
        JourneyDateHighlight mostRecentJourney,
        JourneyMemoryHighlight mostMemoryRichJourney) {

    public record CityHighlight(
            UUID cityId,
            String cityName,
            String countryCode,
            String countryName,
            long visitCount) {
    }

    public record CountryHighlight(String countryCode, String countryName, long visitCount) {
    }

    public record JourneyDurationHighlight(UUID journeyId, String journeyName, long dayCount) {
    }

    public record JourneyDateHighlight(UUID journeyId, String journeyName, LocalDate startDate) {
    }

    public record JourneyMemoryHighlight(UUID journeyId, String journeyName, long memoryCount) {
    }
}
