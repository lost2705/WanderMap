package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.CityLocation;
import java.util.Optional;

/**
 * Resolves an optional location for a normalized city name without exposing provider details to
 * the travel application.
 */
public interface CityLocationResolver {

    Optional<CityLocation> resolve(String countryCode, String normalizedCityName);
}
