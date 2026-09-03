package io.github.lost2705.wandermap.travel.application;

import java.util.List;
import org.springframework.stereotype.Component;

@Component
public class AchievementEngine {

    private static final List<AchievementDefinition> DEFINITIONS = List.of(
            definition("FIRST_JOURNEY", "First chapter", "Create your first Journey.",
                    AchievementCategory.JOURNEYS, AchievementMetric.JOURNEYS, 1),
            definition("JOURNEY_KEEPER", "Journey keeper", "Keep five Journeys in your atlas.",
                    AchievementCategory.JOURNEYS, AchievementMetric.JOURNEYS, 5),
            definition("COUNTRY_EXPLORER", "Country explorer", "Visit five countries.",
                    AchievementCategory.EXPLORATION, AchievementMetric.COUNTRIES, 5),
            definition("WORLD_WANDERER", "World wanderer", "Visit ten countries.",
                    AchievementCategory.EXPLORATION, AchievementMetric.COUNTRIES, 10),
            definition("CITY_HOPPER", "City hopper", "Discover ten distinct places.",
                    AchievementCategory.EXPLORATION, AchievementMetric.PLACES, 10),
            definition("URBAN_EXPLORER", "Urban explorer", "Discover twenty-five distinct places.",
                    AchievementCategory.EXPLORATION, AchievementMetric.PLACES, 25),
            definition("MEMORY_KEEPER", "Memory keeper", "Record five travel memories.",
                    AchievementCategory.MEMORIES, AchievementMetric.MEMORIES, 5),
            definition("STORY_COLLECTOR", "Story collector", "Record twenty travel memories.",
                    AchievementCategory.MEMORIES, AchievementMetric.MEMORIES, 20),
            definition("TRAVEL_MONTH", "A month of travel", "Collect thirty distinct travel days.",
                    AchievementCategory.TIME, AchievementMetric.TRAVEL_DAYS, 30),
            definition("RETURN_VISITOR", "Return visitor", "Return to a place you know.",
                    AchievementCategory.EXPLORATION, AchievementMetric.REVISITED_CITIES, 1),
            definition("BACK_FOR_MORE", "Back for more", "Revisit three countries on separate Journeys.",
                    AchievementCategory.EXPLORATION, AchievementMetric.REVISITED_COUNTRIES, 3),
            definition("PHOTO_JOURNAL", "Photo journal", "Add twenty-five photos to your memories.",
                    AchievementCategory.MEMORIES, AchievementMetric.PHOTOS, 25));

    public List<Achievement> evaluate(TravelProfileMetrics metrics) {
        return DEFINITIONS.stream().map(definition -> evaluate(definition, metrics)).toList();
    }

    private static Achievement evaluate(AchievementDefinition definition, TravelProfileMetrics metrics) {
        long currentValue = Math.max(0, definition.metric().value(metrics));
        long cappedValue = Math.min(currentValue, definition.targetValue());
        int progressPercent = (int) ((cappedValue * 100) / definition.targetValue());
        return new Achievement(
                definition.code(),
                definition.title(),
                definition.description(),
                definition.category(),
                currentValue >= definition.targetValue(),
                currentValue,
                definition.targetValue(),
                progressPercent);
    }

    private static AchievementDefinition definition(
            String code,
            String title,
            String description,
            AchievementCategory category,
            AchievementMetric metric,
            long targetValue) {
        return new AchievementDefinition(code, title, description, category, metric, targetValue);
    }
}
