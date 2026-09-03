package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;

class AchievementEngineTest {

    private final AchievementEngine engine = new AchievementEngine();

    @Test
    void returnsStableLockedAchievementsForAnEmptyProfile() {
        List<Achievement> achievements = engine.evaluate(metrics(0, 0, 0, 0, 0, 0, 0, 0));

        assertThat(achievements).hasSize(12);
        assertThat(achievements).extracting(Achievement::code).containsExactly(
                "FIRST_JOURNEY",
                "JOURNEY_KEEPER",
                "COUNTRY_EXPLORER",
                "WORLD_WANDERER",
                "CITY_HOPPER",
                "URBAN_EXPLORER",
                "MEMORY_KEEPER",
                "STORY_COLLECTOR",
                "TRAVEL_MONTH",
                "RETURN_VISITOR",
                "BACK_FOR_MORE",
                "PHOTO_JOURNAL");
        assertThat(achievements).allSatisfy(achievement -> {
            assertThat(achievement.unlocked()).isFalse();
            assertThat(achievement.currentValue()).isZero();
            assertThat(achievement.progressPercent()).isZero();
        });
    }

    @Test
    void unlocksExactlyAtThresholdAndCapsProgressAboveThreshold() {
        List<Achievement> achievements = engine.evaluate(metrics(5, 10, 5, 30, 5, 3, 25, 1));

        assertThat(achievement(achievements, "JOURNEY_KEEPER"))
                .extracting(Achievement::unlocked, Achievement::currentValue,
                        Achievement::targetValue, Achievement::progressPercent)
                .containsExactly(true, 5L, 5L, 100);
        assertThat(achievement(achievements, "FIRST_JOURNEY"))
                .extracting(Achievement::unlocked, Achievement::currentValue,
                        Achievement::targetValue, Achievement::progressPercent)
                .containsExactly(true, 5L, 1L, 100);
        assertThat(achievements).allSatisfy(achievement ->
                assertThat(achievement.progressPercent()).isBetween(0, 100));
    }

    @Test
    void reportsDeterministicLockedProgressFromTheRelevantMetric() {
        List<Achievement> achievements = engine.evaluate(metrics(2, 4, 3, 12, 2, 1, 5, 0));

        assertThat(achievement(achievements, "JOURNEY_KEEPER").progressPercent()).isEqualTo(40);
        assertThat(achievement(achievements, "COUNTRY_EXPLORER").progressPercent()).isEqualTo(60);
        assertThat(achievement(achievements, "TRAVEL_MONTH").progressPercent()).isEqualTo(40);
        assertThat(achievement(achievements, "PHOTO_JOURNAL").progressPercent()).isEqualTo(20);
    }

    private static Achievement achievement(List<Achievement> achievements, String code) {
        return achievements.stream().filter(achievement -> achievement.code().equals(code)).findFirst().orElseThrow();
    }

    private static TravelProfileMetrics metrics(
            long journeys,
            long places,
            long countries,
            long travelDays,
            long memories,
            long revisitedCountries,
            long photos,
            long revisitedCities) {
        return new TravelProfileMetrics(
                journeys,
                places,
                places,
                countries,
                travelDays,
                memories,
                photos,
                revisitedCities,
                revisitedCountries);
    }
}
