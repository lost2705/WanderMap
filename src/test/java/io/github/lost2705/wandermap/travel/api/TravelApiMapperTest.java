package io.github.lost2705.wandermap.travel.api;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.lost2705.wandermap.travel.api.dto.TripMapOverviewResponse;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class TravelApiMapperTest {

    @Test
    void exposesLocatedStopsAsMarkersAndKeepsUnresolvedStopsValid() {
        Country italy = new Country("IT", "Italy");
        Trip trip = new Trip("Tuscany", null, null);
        trip.addStop(new City(
                italy,
                "Lucca",
                new CityLocation(new BigDecimal("43.8429"), new BigDecimal("10.5027"))));
        trip.addStop(new City(italy, "Unresolved village"));

        TripMapOverviewResponse overview = TravelApiMapper.toMapOverviewResponse(List.of(trip));

        assertThat(overview.visitedCountryCodes()).containsExactly("IT");
        assertThat(overview.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.cityName()).isEqualTo("Lucca");
            assertThat(marker.latitude()).isEqualByComparingTo("43.8429");
            assertThat(marker.longitude()).isEqualByComparingTo("10.5027");
            assertThat(marker.country().code()).isEqualTo("IT");
        });
    }
}
