package io.github.lost2705.wandermap.travel.application;

record AchievementDefinition(
        String code,
        String title,
        String description,
        AchievementCategory category,
        AchievementMetric metric,
        long targetValue) {
}
