package io.github.lost2705.wandermap.ai.application;

import java.math.BigDecimal;
import java.util.List;

public record TripPlanStop(
        String cityName,
        String countryCode,
        String countryName,
        BigDecimal latitude,
        BigDecimal longitude,
        int daysAtStop,
        String reason,
        List<String> activities,
        boolean bucketListMatch,
        boolean alreadyVisited) {

    public TripPlanStop {
        activities = activities == null ? List.of() : List.copyOf(activities);
    }
}
