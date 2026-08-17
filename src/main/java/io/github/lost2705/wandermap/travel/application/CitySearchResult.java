package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.CityLocation;
import java.math.BigDecimal;
import java.util.Locale;

/** A concrete city choice that contains everything needed to create and locate a stop. */
public record CitySearchResult(
        String name,
        String countryName,
        String regionName,
        String countryCode,
        BigDecimal latitude,
        BigDecimal longitude) {

    public CitySearchResult {
        name = requireText(name, "city name", 160);
        countryName = requireText(countryName, "country name", 100);
        regionName = optionalText(regionName, 160);
        countryCode = normalizeCountryCode(countryCode);
        CityLocation location = new CityLocation(latitude, longitude);
        latitude = location.latitude();
        longitude = location.longitude();
    }

    private static String requireText(String value, String label, int maximumLength) {
        if (value == null || value.strip().isEmpty()) {
            throw new IllegalArgumentException(label + " must not be blank");
        }
        String normalized = value.strip();
        if (normalized.length() > maximumLength) {
            throw new IllegalArgumentException(label + " must not exceed " + maximumLength + " characters");
        }
        return normalized;
    }

    private static String optionalText(String value, int maximumLength) {
        if (value == null || value.strip().isEmpty()) {
            return null;
        }
        String normalized = value.strip();
        return normalized.length() <= maximumLength ? normalized : null;
    }

    private static String normalizeCountryCode(String countryCode) {
        if (countryCode == null) {
            throw new IllegalArgumentException("country code must not be null");
        }
        String normalized = countryCode.strip().toUpperCase(Locale.ROOT);
        if (!normalized.matches("[A-Z]{2}")) {
            throw new IllegalArgumentException("country code must contain two letters");
        }
        return normalized;
    }
}
