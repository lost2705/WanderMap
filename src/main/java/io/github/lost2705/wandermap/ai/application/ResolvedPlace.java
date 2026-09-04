package io.github.lost2705.wandermap.ai.application;

import java.math.BigDecimal;

record ResolvedPlace(
        String cityName,
        String countryCode,
        String countryName,
        BigDecimal latitude,
        BigDecimal longitude,
        boolean bucketListMatch,
        boolean alreadyVisited) {
}
