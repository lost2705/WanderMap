package io.github.lost2705.wandermap.travel.application;

/**
 * Raised when a requested country code does not exist.
 */
public class CountryNotFoundException extends RuntimeException {

    public CountryNotFoundException(String countryCode) {
        super("country not found: " + countryCode);
    }
}
