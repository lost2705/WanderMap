package io.github.lost2705.wandermap.travel.infrastructure.geocoding;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import io.github.lost2705.wandermap.travel.application.CitySearchResult;
import io.github.lost2705.wandermap.travel.application.GeocodingClient;
import io.github.lost2705.wandermap.travel.application.GeocodingUnavailableException;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class PhotonGeocodingClient implements GeocodingClient {

    static final int RESULT_LIMIT = 8;

    private final RestClient restClient;

    public PhotonGeocodingClient(@Qualifier("geocodingRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    @Override
    public List<CitySearchResult> searchCities(String query) {
        try {
            PhotonFeatureCollection response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api")
                            .queryParam("q", query)
                            .queryParam("limit", RESULT_LIMIT)
                            .queryParam("lang", "en")
                            .queryParam("layer", "city")
                            .queryParam("layer", "locality")
                            .build())
                    .retrieve()
                    .body(PhotonFeatureCollection.class);
            return mapResults(response);
        } catch (RestClientException exception) {
            throw new GeocodingUnavailableException(exception);
        }
    }

    private static List<CitySearchResult> mapResults(PhotonFeatureCollection response) {
        if (response == null || response.features() == null) {
            return List.of();
        }

        Map<ResultKey, CitySearchResult> uniqueResults = new LinkedHashMap<>();
        response.features().stream()
                .map(PhotonGeocodingClient::mapResult)
                .filter(Objects::nonNull)
                .limit(RESULT_LIMIT)
                .forEach(result -> uniqueResults.putIfAbsent(ResultKey.from(result), result));
        return List.copyOf(uniqueResults.values());
    }

    private static CitySearchResult mapResult(PhotonFeature feature) {
        if (feature == null || feature.properties() == null || feature.geometry() == null) {
            return null;
        }
        PhotonGeometry geometry = feature.geometry();
        if (!"Point".equals(geometry.type()) || geometry.coordinates() == null || geometry.coordinates().size() < 2) {
            return null;
        }

        try {
            PhotonProperties properties = feature.properties();
            return new CitySearchResult(
                    properties.name(),
                    properties.country(),
                    properties.state(),
                    properties.countrycode(),
                    geometry.coordinates().get(1),
                    geometry.coordinates().get(0));
        } catch (IllegalArgumentException | NullPointerException exception) {
            return null;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record PhotonFeatureCollection(List<PhotonFeature> features) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record PhotonFeature(PhotonProperties properties, PhotonGeometry geometry) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record PhotonProperties(String name, String country, String state, String countrycode) {
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    private record PhotonGeometry(String type, List<BigDecimal> coordinates) {
    }

    private record ResultKey(String name, String countryCode, BigDecimal latitude, BigDecimal longitude) {

        static ResultKey from(CitySearchResult result) {
            return new ResultKey(
                    result.name().toLowerCase(Locale.ROOT),
                    result.countryCode(),
                    result.latitude().stripTrailingZeros(),
                    result.longitude().stripTrailingZeros());
        }
    }
}
