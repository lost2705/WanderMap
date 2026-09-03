package io.github.lost2705.wandermap.travel.application;

public record Achievement(
        String code,
        String title,
        String description,
        AchievementCategory category,
        boolean unlocked,
        long currentValue,
        long targetValue,
        int progressPercent) {
}
