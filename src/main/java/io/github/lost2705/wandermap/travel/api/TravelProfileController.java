package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.api.dto.TravelProfileResponse;
import io.github.lost2705.wandermap.travel.application.TravelProfile;
import io.github.lost2705.wandermap.travel.application.TravelProfileService;
import io.github.lost2705.wandermap.travel.application.TravelHighlights;
import java.util.Locale;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/travel-profile")
public class TravelProfileController {

    private final TravelProfileService travelProfileService;

    public TravelProfileController(TravelProfileService travelProfileService) {
        this.travelProfileService = travelProfileService;
    }

    @GetMapping
    public TravelProfileResponse getProfile() {
        TravelProfile profile = travelProfileService.getProfile();
        return new TravelProfileResponse(
                profile.journeyCount(),
                profile.visitCount(),
                profile.uniqueCityCount(),
                profile.countryCount(),
                profile.travelDayCount(),
                profile.memoryCount(),
                profile.photoCount(),
                profile.revisitedCityCount(),
                profile.revisitedCountryCount(),
                toResponse(profile.highlights()),
                profile.achievements().stream()
                        .map(achievement -> new TravelProfileResponse.AchievementResponse(
                                achievement.code(),
                                achievement.title(),
                                achievement.description(),
                                achievement.category().name().toLowerCase(Locale.ROOT),
                                achievement.unlocked(),
                                achievement.currentValue(),
                                achievement.targetValue(),
                                achievement.progressPercent()))
                        .toList());
    }

    private static TravelProfileResponse.TravelHighlightsResponse toResponse(TravelHighlights highlights) {
        return new TravelProfileResponse.TravelHighlightsResponse(
                highlights.mostVisitedCity() == null ? null : new TravelProfileResponse.CityHighlightResponse(
                        highlights.mostVisitedCity().cityId(),
                        highlights.mostVisitedCity().cityName(),
                        highlights.mostVisitedCity().countryCode(),
                        highlights.mostVisitedCity().countryName(),
                        highlights.mostVisitedCity().visitCount()),
                highlights.mostVisitedCountry() == null ? null : new TravelProfileResponse.CountryHighlightResponse(
                        highlights.mostVisitedCountry().countryCode(),
                        highlights.mostVisitedCountry().countryName(),
                        highlights.mostVisitedCountry().visitCount()),
                highlights.longestJourney() == null ? null : new TravelProfileResponse.JourneyDurationHighlightResponse(
                        highlights.longestJourney().journeyId(),
                        highlights.longestJourney().journeyName(),
                        highlights.longestJourney().dayCount()),
                highlights.mostRecentJourney() == null ? null : new TravelProfileResponse.JourneyDateHighlightResponse(
                        highlights.mostRecentJourney().journeyId(),
                        highlights.mostRecentJourney().journeyName(),
                        highlights.mostRecentJourney().startDate()),
                highlights.mostMemoryRichJourney() == null
                        ? null
                        : new TravelProfileResponse.JourneyMemoryHighlightResponse(
                                highlights.mostMemoryRichJourney().journeyId(),
                                highlights.mostMemoryRichJourney().journeyName(),
                                highlights.mostMemoryRichJourney().memoryCount()));
    }
}
