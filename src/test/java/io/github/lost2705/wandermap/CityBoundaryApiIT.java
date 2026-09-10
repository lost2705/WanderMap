package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryClient;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryGeometry;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryLookupException;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.persistence.CityBoundaryRepository;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import java.math.BigDecimal;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "wandermap.city-boundaries.external-enabled=true")
class CityBoundaryApiIT extends AuthenticatedIntegrationTestSupport {
    @MockitoBean CityBoundaryClient provider;
    @Autowired CityRepository cities;
    @Autowired CountryRepository countries;
    @Autowired TripRepository trips;
    @Autowired CityBoundaryRepository boundaries;
    @Autowired JdbcClient jdbc;

    @Test
    void persistsPolygonAsWgs84MultiPolygonAndServesCacheAfterRepositoryRecreation() throws Exception {
        City city = visit();
        assertThat(boundaries.find(city.getId())).isEmpty();
        candidate(city, polygon());
        var response = get(city);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("cache-control")).contains("no-store");
        JsonNode body = objectMapper.readTree(response.body());
        assertThat(body.path("status").asText()).isEqualTo("AVAILABLE");
        assertThat(body.path("geometry").path("type").asText()).isEqualTo("MultiPolygon");
        assertThat(response.body()).doesNotContain("provider", "relation", "user", "trip", "visited");
        assertThat(jdbc.sql("SELECT ST_SRID(geometry) FROM city_boundaries WHERE city_id = ?").param(city.getId()).query(Integer.class).single()).isEqualTo(4326);
        assertThat(new CityBoundaryRepository(jdbc, objectMapper).find(city.getId()).orElseThrow().geometry()).isNotNull();
        assertThat(get(city).body()).contains("AVAILABLE");
        verify(provider, times(1)).findCandidates(any());
    }

    @Test
    void cacheMissUsesCountryPolicyAndPersistsTheSelectedMunicipality() throws Exception {
        City city = visit("NL", "Amsterdam " + UUID.randomUUID(), new BigDecimal("52.370216"),
                new BigDecimal("4.895168"));
        var geometry = CityBoundaryGeometry.fromJson(objectMapper.readTree(
                "{\"type\":\"Polygon\",\"coordinates\":[[[4,52],[5,52],[5,53],[4,53],[4,52]]]}"));
        when(provider.findCandidates(any())).thenReturn(List.of(
                new CityBoundaryClient.Candidate("test", "relation/271110", Set.of(city.getName()), "NL",
                        CityBoundaryClient.Kind.CITY, 16, 10, geometry),
                new CityBoundaryClient.Candidate("test", "relation/47811", Set.of(city.getName()), "NL",
                        CityBoundaryClient.Kind.MUNICIPALITY, 14, 8, geometry)));

        assertThat(boundaries.find(city.getId())).isEmpty();
        assertThat(objectMapper.readTree(get(city).body()).path("status").asText()).isEqualTo("AVAILABLE");
        assertThat(jdbc.sql("SELECT provider_boundary_id FROM city_boundaries WHERE city_id = ?")
                .param(city.getId()).query(String.class).single()).isEqualTo("relation/47811");
        assertThat(get(city).body()).contains("AVAILABLE");
        verify(provider, times(1)).findCandidates(any());
    }

    @Test
    void preservesMultiPolygonIslandsAndHolesThroughStorageAndSimplification() throws Exception {
        City city = visit();
        candidate(city, """
                {"type":"MultiPolygon","coordinates":[
                  [[[12,41],[13,41],[13,42],[12,42],[12,41]],[[12.1,41.1],[12.1,41.2],[12.2,41.2],[12.2,41.1],[12.1,41.1]]],
                  [[[14,41],[14.01,41],[14.01,41.01],[14,41.01],[14,41]]]]}
                """);
        assertThat(get(city).body()).contains("AVAILABLE");
        var geometry = boundaries.find(city.getId()).orElseThrow().geometry();
        assertThat(geometry.coordinates()).hasSize(2);
        assertThat(geometry.coordinates().getFirst()).hasSize(2);
        assertThat(jdbc.sql("SELECT ST_NumGeometries(display_geometry) FROM city_boundaries WHERE city_id = ?")
                .param(city.getId()).query(Integer.class).single()).isEqualTo(2);
    }

    @Test
    void negativeCacheExpiresAndProviderOutageDoesNotRemoveVerifiedGeometry() throws Exception {
        City city = visit();
        when(provider.findCandidates(any())).thenReturn(List.of());
        assertThat(get(city).body()).contains("UNAVAILABLE");
        assertThat(get(city).body()).contains("UNAVAILABLE");
        verify(provider, times(1)).findCandidates(any());
        expire(city);
        candidate(city, polygon());
        assertThat(get(city).body()).contains("AVAILABLE");
        expire(city);
        when(provider.findCandidates(any())).thenThrow(new CityBoundaryLookupException());
        var failedRefresh = objectMapper.readTree(get(city).body());
        assertThat(failedRefresh.path("status").asText()).isEqualTo("AVAILABLE");
        assertThat(failedRefresh.path("stale").asBoolean()).isTrue();
        assertThat(failedRefresh.path("geometry").isObject()).isTrue();
        assertThat(get(city).body()).contains("AVAILABLE");
        verify(provider, times(3)).findCandidates(any());
    }

    @Test
    void failureWithoutGeometryIsTemporaryNotNotFound() throws Exception {
        City city = visit();
        when(provider.findCandidates(any())).thenThrow(new CityBoundaryLookupException());
        assertThat(get(city).body()).contains("TEMPORARILY_UNAVAILABLE", "\"geometry\":null");
        get(city);
        verify(provider, times(1)).findCandidates(any());
    }

    @Test
    void rejectsInvalidTopologyOutsidePointsAndPointsInsideHoles() throws Exception {
        City city = visit();
        for (String geometry : List.of(
                "{\"type\":\"Polygon\",\"coordinates\":[[[12,41],[13,42],[13,41],[12,42],[12,41]]]}",
                "{\"type\":\"Polygon\",\"coordinates\":[[[10,41],[11,41],[11,42],[10,42],[10,41]]]}",
                "{\"type\":\"Polygon\",\"coordinates\":[[[12,41],[13,41],[13,42],[12,42],[12,41]],[[12.4,41.8],[12.4,41.95],[12.6,41.95],[12.6,41.8],[12.4,41.8]]]}")) {
            candidate(city, geometry);
            assertThat(objectMapper.readTree(get(city).body()).path("status").asText()).isEqualTo("UNAVAILABLE");
            expire(city);
        }
        assertThat(boundaries.find(city.getId()).orElseThrow().geometry()).isNull();
    }

    @Test
    void sharedGeometryRequiresEachUsersOwnVisitAndFollowsCityNotJourneyLifecycle() throws Exception {
        City city = visit();
        candidate(city, polygon());
        get(city);
        var alice = currentUser;
        authenticateTestUser();
        assertThat(get(city).statusCode()).isEqualTo(404);
        Trip bobTrip = new Trip(currentUser, "Bob boundary Journey", null, null);
        bobTrip.addStop(city);
        trips.saveAndFlush(bobTrip);
        assertThat(get(city).statusCode()).isEqualTo(200);
        verify(provider, times(1)).findCandidates(any());
        trips.deleteById(bobTrip.getId());
        assertThat(get(city).statusCode()).isEqualTo(404);
        assertThat(boundaries.find(city.getId())).isPresent();
        jdbc.sql("DELETE FROM trips WHERE user_id = ?").param(alice.getId()).update();
        cities.deleteById(city.getId());
        assertThat(boundaries.find(city.getId())).isEmpty();
    }

    @Test
    void requiresAuthenticationValidUuidAndAnOwnedKnownCity() throws Exception {
        City city = visit();
        var anonymous = HttpClient.newHttpClient().send(HttpRequest.newBuilder(uri(path(city))).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(anonymous.statusCode()).isEqualTo(401);
        assertThat(httpClient.send(authenticatedRequest("/api/places/not-a-uuid/boundary").GET().build(), HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        assertThat(httpClient.send(authenticatedRequest("/api/places/" + UUID.randomUUID() + "/boundary").GET().build(), HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(404);
        verifyNoInteractions(provider);
    }

    @Test
    void cacheLeaseIsExclusiveAndDoesNotChangeExistingGeometry() throws Exception {
        City city = visit();
        var now = java.time.Instant.now();
        assertThat(boundaries.claim(city.getId(), now)).isPresent();
        assertThat(boundaries.claim(city.getId(), now)).isEmpty();
        assertThat(boundaries.claim(city.getId(), now.plusSeconds(31))).isPresent();
    }

    @Test
    void expiredLookupCannotClearANewerVerifiedResult() {
        City city = visit();
        var now = java.time.Instant.parse("2026-09-06T00:00:00Z");
        var expiredLease = boundaries.claim(city.getId(), now).orElseThrow();
        var winningLease = boundaries.claim(city.getId(), now.plusSeconds(31)).orElseThrow();
        var geometry = CityBoundaryGeometry.fromJson(objectMapper.readTree(polygon()));
        var candidate = new CityBoundaryClient.Candidate("test", "new", Set.of(city.getName()), "IT",
                CityBoundaryClient.Kind.MUNICIPALITY, 16, 8, geometry);
        var verified = boundaries.verify(geometry, new CityBoundaryClient.Query(city.getName(), "IT", city.getLatitude(), city.getLongitude())).orElseThrow();
        assertThat(boundaries.saveAvailable(city.getId(), candidate, verified, winningLease,
                now.plusSeconds(32), java.time.Duration.ofDays(30))).isTrue();
        var winner = boundaries.find(city.getId()).orElseThrow();
        for (var status : List.of(io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryResult.Status.UNAVAILABLE,
                io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryResult.Status.TEMPORARILY_UNAVAILABLE)) {
            assertThat(boundaries.saveNegative(city.getId(), status, expiredLease,
                    now.plusSeconds(33), java.time.Duration.ofDays(1))).isFalse();
        }
        assertThat(boundaries.saveAvailable(city.getId(), candidate, verified, expiredLease,
                now.plusSeconds(34), java.time.Duration.ofDays(30))).isFalse();
        assertThat(boundaries.find(city.getId()).orElseThrow()).isEqualTo(winner);
        assertThat(winner.geometry()).isNotNull();
    }

    @Test
    void concurrentCacheMissesHaveOneWinnerAndOneRow() throws Exception {
        City city = visit();
        var now = java.time.Instant.now();
        var ready = new java.util.concurrent.CountDownLatch(6);
        var start = new java.util.concurrent.CountDownLatch(1);
        try (var executor = java.util.concurrent.Executors.newFixedThreadPool(6)) {
            var requests = new java.util.ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 6; i++) requests.add(executor.submit(() -> {
                ready.countDown();
                start.await();
                return boundaries.claim(city.getId(), now).isPresent();
            }));
            try { assertThat(ready.await(5, java.util.concurrent.TimeUnit.SECONDS)).isTrue(); }
            finally { start.countDown(); }
            int winners = 0;
            for (var request : requests) if (request.get(10, java.util.concurrent.TimeUnit.SECONDS)) winners++;
            assertThat(winners).isEqualTo(1);
        }
        assertThat(jdbc.sql("SELECT count(*) FROM city_boundaries WHERE city_id = ?").param(city.getId()).query(Long.class).single()).isEqualTo(1);
    }

    @Test
    void originalAndDisplayCoverEdgePointsAndNearDatelinePolygonsWithoutSwappingAxes() {
        for (String json : List.of(polygon(),
                "{\"type\":\"Polygon\",\"coordinates\":[[[179.8,41],[180,41],[180,42],[179.8,42],[179.8,41]]]}")) {
            var geometry = CityBoundaryGeometry.fromJson(objectMapper.readTree(json));
            var lon = BigDecimal.valueOf(geometry.coordinates().getFirst().getFirst().getFirst().getFirst());
            var verified = boundaries.verify(geometry, new CityBoundaryClient.Query("Edge", "IT", new BigDecimal("41.5"), lon)).orElseThrow();
            for (String encoded : List.of(verified.original(), verified.display())) {
                assertThat(jdbc.sql("SELECT ST_IsValid(ST_GeomFromGeoJSON(?)) AND ST_Covers(ST_GeomFromGeoJSON(?), ST_SetSRID(ST_MakePoint(?, 41.5), 4326))")
                        .param(encoded).param(encoded).param(lon).query(Boolean.class).single()).isTrue();
            }
        }
    }

    @Test
    void topologyPreservingSimplificationReducesVerticesWithoutDroppingTheIsland() {
        var points = new java.util.ArrayList<List<Double>>();
        for (int i = 0; i < 100; i++) points.add(List.of(12d + i / 100d, 41d));
        points.addAll(List.of(List.of(13d, 41d), List.of(13d, 42d), List.of(12d, 42d), List.of(12d, 41d)));
        var geometry = new CityBoundaryGeometry("MultiPolygon", List.of(List.of(points)));
        var verified = boundaries.verify(geometry, new CityBoundaryClient.Query("Rome", "IT", new BigDecimal("41.9"), new BigDecimal("12.5"))).orElseThrow();
        assertThat(verified.display().length()).isLessThan(verified.original().length());
        assertThat(CityBoundaryGeometry.fromJson(objectMapper.readTree(verified.display())).coordinates()).hasSize(1);
    }

    private City visit() {
        return visit("IT", "Rome " + UUID.randomUUID(), new BigDecimal("41.9"), new BigDecimal("12.5"));
    }
    private City visit(String countryCode, String name, BigDecimal latitude, BigDecimal longitude) {
        City city = cities.saveAndFlush(new City(countries.findById(countryCode).orElseThrow(), name,
                new CityLocation(latitude, longitude)));
        Trip trip = new Trip(currentUser, "Boundary test", null, null);
        trip.addStop(city);
        trips.saveAndFlush(trip);
        return city;
    }
    private void candidate(City city, String geometry) {
        when(provider.findCandidates(any())).thenReturn(List.of(new CityBoundaryClient.Candidate("test", "123", Set.of(city.getName()), "IT",
                CityBoundaryClient.Kind.MUNICIPALITY, 16, 8, CityBoundaryGeometry.fromJson(objectMapper.readTree(geometry)))));
    }
    private void expire(City city) {
        jdbc.sql("UPDATE city_boundaries SET retry_at = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE city_id = ?").param(city.getId()).update();
    }
    private HttpResponse<String> get(City city) throws Exception {
        return httpClient.send(authenticatedRequest(path(city)).GET().build(), HttpResponse.BodyHandlers.ofString());
    }
    private static String path(City city) { return "/api/places/" + city.getId() + "/boundary"; }
    private static String polygon() { return "{\"type\":\"Polygon\",\"coordinates\":[[[12,41],[13,41],[13,42],[12,42],[12,41]]]}"; }
}
