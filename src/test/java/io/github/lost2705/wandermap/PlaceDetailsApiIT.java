package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PlaceDetailsApiIT extends PostgresIntegrationTestSupport {

    private final HttpClient httpClient = HttpClient.newHttpClient();

    @LocalServerPort
    private int port;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private CountryRepository countryRepository;

    @Autowired
    private CityRepository cityRepository;

    @Autowired
    private TripRepository tripRepository;

    @Test
    void returnsCompletePlaceHistoryWithoutCollapsingStopsOrLeakingStorageDetails() throws Exception {
        Country unitedStates = countryRepository.findById("US").orElseThrow();
        City florence = cityRepository.saveAndFlush(new City(
                unitedStates,
                "Florence details " + UUID.randomUUID(),
                new CityLocation(new BigDecimal("34.7998"), new BigDecimal("-87.6773"))));
        City distinctPlaceAtSameCoordinates = cityRepository.saveAndFlush(new City(
                unitedStates,
                "Florence historic " + UUID.randomUUID(),
                new CityLocation(new BigDecimal("34.7998"), new BigDecimal("-87.6773"))));

        Trip winterTrip = new Trip(
                "Winter memories " + UUID.randomUUID(),
                LocalDate.of(2025, 12, 1),
                LocalDate.of(2025, 12, 8),
                "A quiet winter visit.");
        TripStop winterVisit = winterTrip.addStop(florence);
        winterVisit.addPhoto("private/" + UUID.randomUUID(), "first.jpg", "image/jpeg", 101);
        winterVisit.addPhoto("private/" + UUID.randomUUID(), "second.png", "image/png", 202);
        tripRepository.saveAndFlush(winterTrip);

        Trip springTrip = new Trip(
                "Spring memories " + UUID.randomUUID(),
                LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 12));
        TripStop laterVisit = springTrip.addStop(
                florence,
                LocalDate.of(2026, 5, 8),
                LocalDate.of(2026, 5, 9),
                "A return to the river.");
        TripStop earlierVisit = springTrip.addStop(
                florence,
                LocalDate.of(2026, 5, 3),
                LocalDate.of(2026, 5, 4),
                "The first spring stop.");
        tripRepository.saveAndFlush(springTrip);

        Trip legacyTrip = new Trip("Legacy visit " + UUID.randomUUID(), null, null);
        TripStop legacyVisit = legacyTrip.addStop(florence);
        tripRepository.saveAndFlush(legacyTrip);

        Trip otherPlaceTrip = new Trip("Other place " + UUID.randomUUID(), null, null);
        otherPlaceTrip.addStop(distinctPlaceAtSameCoordinates);
        tripRepository.saveAndFlush(otherPlaceTrip);

        HttpResponse<String> response = get("/api/places/" + florence.getId());

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(response.body());
        assertThat(body.path("city").path("id").asText()).isEqualTo(florence.getId().toString());
        assertThat(body.path("city").path("name").asText()).isEqualTo(florence.getName());
        assertThat(body.path("city").path("country").path("name").asText()).isEqualTo("United States");
        assertThat(body.path("visitCount").asInt()).isEqualTo(4);
        assertThat(body.path("visits")).hasSize(4);
        assertThat(body.path("visits").get(0).path("stopId").asText()).isEqualTo(winterVisit.getId().toString());
        assertThat(body.path("visits").get(1).path("stopId").asText()).isEqualTo(earlierVisit.getId().toString());
        assertThat(body.path("visits").get(2).path("stopId").asText()).isEqualTo(laterVisit.getId().toString());
        assertThat(body.path("visits").get(3).path("stopId").asText()).isEqualTo(legacyVisit.getId().toString());
        assertThat(body.path("visits").get(2).path("note").asText()).isEqualTo("A return to the river.");
        assertThat(body.path("visits").get(0).path("photos")).hasSize(2);
        assertThat(body.path("visits").get(0).path("photos").get(0).path("position").asInt()).isEqualTo(1);
        assertThat(body.path("visits").get(0).path("photos").get(1).path("position").asInt()).isEqualTo(2);
        assertThat(body.path("visits").get(0).path("photos").get(0).path("contentUrl").asText())
                .isEqualTo("/api/trips/%s/stops/%s/photos/%s/content".formatted(
                        winterTrip.getId(), winterVisit.getId(), winterVisit.getPhotos().getFirst().getId()));
        assertThat(body.path("visits").get(3).path("arrivalDate").isNull()).isTrue();
        assertThat(body.path("visits").get(3).path("note").isNull()).isTrue();
        assertThat(response.body()).doesNotContain("storageKey", "private/", "filesystem", "LocalPhotoStorage");

        HttpResponse<String> isolatedResponse = get("/api/places/" + distinctPlaceAtSameCoordinates.getId());
        JsonNode isolatedBody = objectMapper.readTree(isolatedResponse.body());
        assertThat(isolatedResponse.statusCode()).isEqualTo(200);
        assertThat(isolatedBody.path("visitCount").asInt()).isEqualTo(1);
        assertThat(isolatedBody.path("visits").get(0).path("tripId").asText())
                .isEqualTo(otherPlaceTrip.getId().toString());
    }

    @Test
    void returnsAControlledProblemForANonexistentPlace() throws Exception {
        HttpResponse<String> response = get("/api/places/" + UUID.randomUUID());

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(objectMapper.readTree(response.body()).path("code").asText()).isEqualTo("PLACE_NOT_FOUND");
    }

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET().build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
