package io.github.lost2705.wandermap.travel.application;

import java.util.List;

/** Searches populated places without exposing a provider-specific response model. */
public interface GeocodingClient {

    List<CitySearchResult> searchCities(String query);
}
