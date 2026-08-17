package io.github.lost2705.wandermap.travel.application;

import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class CitySearchService {

    static final int MINIMUM_QUERY_LENGTH = 2;
    static final int MAXIMUM_QUERY_LENGTH = 160;

    private final GeocodingClient geocodingClient;

    public CitySearchService(GeocodingClient geocodingClient) {
        this.geocodingClient = geocodingClient;
    }

    public List<CitySearchResult> searchCities(String query) {
        String normalizedQuery = normalizeQuery(query);
        if (normalizedQuery.length() < MINIMUM_QUERY_LENGTH) {
            return List.of();
        }
        return List.copyOf(geocodingClient.searchCities(normalizedQuery));
    }

    static String normalizeQuery(String query) {
        if (query == null) {
            return "";
        }
        String normalized = query.strip().replaceAll("\\s+", " ");
        if (normalized.length() > MAXIMUM_QUERY_LENGTH) {
            throw new IllegalArgumentException("city search query must not exceed 160 characters");
        }
        return normalized;
    }
}
