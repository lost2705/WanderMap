package io.github.lost2705.wandermap.ai.application.tool;

import io.github.lost2705.wandermap.ai.application.AiToolDefinition;
import io.github.lost2705.wandermap.ai.application.TravelAgentTool;
import io.github.lost2705.wandermap.travel.application.Achievement;
import io.github.lost2705.wandermap.travel.application.TravelHighlights;
import io.github.lost2705.wandermap.travel.application.TravelProfile;
import io.github.lost2705.wandermap.travel.application.TravelProfileService;
import java.util.List;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class GetTravelProfileTool implements TravelAgentTool {

    public static final String NAME = "get_travel_profile";

    private final TravelProfileService travelProfileService;
    private final ObjectMapper objectMapper;

    public GetTravelProfileTool(TravelProfileService travelProfileService, ObjectMapper objectMapper) {
        this.travelProfileService = travelProfileService;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiToolDefinition definition() {
        return new AiToolDefinition(
                NAME,
                "Get aggregate travel statistics, highlights, and unlocked achievements for the current authenticated WanderMap user. Takes no arguments.",
                ToolArguments.emptyObjectSchema());
    }

    @Override
    public Object execute(String argumentsJson) {
        ToolArguments.requireEmptyObject(objectMapper, argumentsJson);
        TravelProfile profile = travelProfileService.getProfile();
        return new Result(
                profile.journeyCount(),
                profile.visitCount(),
                profile.uniqueCityCount(),
                profile.countryCount(),
                profile.travelDayCount(),
                profile.memoryCount(),
                profile.photoCount(),
                profile.revisitedCityCount(),
                profile.revisitedCountryCount(),
                Highlights.from(profile.highlights()),
                profile.achievements().stream()
                        .filter(Achievement::unlocked)
                        .map(achievement -> new UnlockedAchievement(
                                achievement.code(), achievement.title(), achievement.description()))
                        .toList());
    }

    public record Result(
            long journeyCount,
            long visitCount,
            long uniqueCityCount,
            long countryCount,
            long travelDayCount,
            long memoryCount,
            long photoCount,
            long revisitedCityCount,
            long revisitedCountryCount,
            Highlights highlights,
            List<UnlockedAchievement> unlockedAchievements) {
    }

    public record Highlights(
            String mostVisitedCity,
            String mostVisitedCountry,
            String longestJourney,
            String mostRecentJourney,
            String mostMemoryRichJourney) {

        static Highlights from(TravelHighlights source) {
            return new Highlights(
                    source.mostVisitedCity() == null
                            ? null
                            : source.mostVisitedCity().cityName() + ", " + source.mostVisitedCity().countryName()
                                    + " (" + source.mostVisitedCity().visitCount() + " visits)",
                    source.mostVisitedCountry() == null
                            ? null
                            : source.mostVisitedCountry().countryName() + " ("
                                    + source.mostVisitedCountry().visitCount() + " visits)",
                    source.longestJourney() == null
                            ? null
                            : source.longestJourney().journeyName() + " ("
                                    + source.longestJourney().dayCount() + " days)",
                    source.mostRecentJourney() == null
                            ? null
                            : source.mostRecentJourney().journeyName() + " ("
                                    + source.mostRecentJourney().startDate() + ")",
                    source.mostMemoryRichJourney() == null
                            ? null
                            : source.mostMemoryRichJourney().journeyName() + " ("
                                    + source.mostMemoryRichJourney().memoryCount() + " memories)");
        }
    }

    public record UnlockedAchievement(String code, String title, String description) {
    }
}
