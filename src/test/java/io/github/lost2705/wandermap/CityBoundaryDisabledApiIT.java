package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;

import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryClient;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryGeometry;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.infrastructure.boundary.NominatimBoundaryClient;
import io.github.lost2705.wandermap.travel.persistence.CityBoundaryRepository;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class CityBoundaryDisabledApiIT extends AuthenticatedIntegrationTestSupport {
    @MockitoSpyBean NominatimBoundaryClient provider;
    @Autowired CityRepository cities;
    @Autowired CountryRepository countries;
    @Autowired TripRepository trips;
    @Autowired CityBoundaryRepository cache;

    @Test
    void defaultLocalConfigurationStartsWithoutUpstreamAndServesFallbackOrPersistedGeometryWithoutCalls() throws Exception {
        var city = cities.saveAndFlush(new City(countries.findById("IT").orElseThrow(), "Disabled " + UUID.randomUUID(),
                new CityLocation(new BigDecimal("41.9"), new BigDecimal("12.5"))));
        var trip = new Trip(currentUser, "Disabled provider", null, null);
        trip.addStop(city);
        trips.saveAndFlush(trip);
        String path = "/api/places/" + city.getId() + "/boundary";
        var first = httpClient.send(authenticatedRequest(path).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(first.body()).contains("UNAVAILABLE", "\"geometry\":null");
        assertThat(cache.find(city.getId())).isEmpty();
        var geometry = CityBoundaryGeometry.fromJson(objectMapper.readTree("""
                {"type":"Polygon","coordinates":[[[12,41],[13,41],[13,42],[12,42],[12,41]]]}
                """));
        var verified = cache.verify(geometry, new CityBoundaryClient.Query(city.getName(), "IT", city.getLatitude(), city.getLongitude())).orElseThrow();
        Instant now = Instant.now();
        var lease = cache.claim(city.getId(), now).orElseThrow();
        cache.saveAvailable(city.getId(), new CityBoundaryClient.Candidate("test", "1", Set.of(city.getName()), "IT",
                CityBoundaryClient.Kind.MUNICIPALITY, geometry), verified, lease, now, Duration.ofDays(30));
        assertThat(httpClient.send(authenticatedRequest(path).GET().build(), HttpResponse.BodyHandlers.ofString()).body()).contains("AVAILABLE", "MultiPolygon");
        verifyNoInteractions(provider);
    }
}
