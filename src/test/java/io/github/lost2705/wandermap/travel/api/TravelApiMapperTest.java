package io.github.lost2705.wandermap.travel.api;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.lost2705.wandermap.travel.api.dto.TripMapOverviewResponse;
import io.github.lost2705.wandermap.travel.api.dto.PlaceDetailsResponse;
import io.github.lost2705.wandermap.travel.application.PlaceDetails;
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
        City lucca = new City(
                italy,
                "Lucca",
                new CityLocation(new BigDecimal("43.8429"), new BigDecimal("10.5027")));
        trip.addStop(lucca);
        trip.addStop(new City(italy, "Unresolved village"));

        TripMapOverviewResponse overview = TravelApiMapper.toMapOverviewResponse(List.of(trip));

        assertThat(overview.visitedCountryCodes()).containsExactly("IT");
        assertThat(overview.markers()).singleElement().satisfies(marker -> {
            assertThat(marker.cityId()).isEqualTo(lucca.getId());
            assertThat(marker.cityName()).isEqualTo("Lucca");
            assertThat(marker.latitude()).isEqualByComparingTo("43.8429");
            assertThat(marker.longitude()).isEqualByComparingTo("10.5027");
            assertThat(marker.country().code()).isEqualTo("IT");
        });
    }

    @Test
    void exposesTheSameStableCityIdWhenMultipleTripsVisitOneCity() {
        Country italy = new Country("IT", "Italy");
        City rome = new City(
                italy,
                "Rome",
                new CityLocation(new BigDecimal("41.9028"), new BigDecimal("12.4964")));
        Trip firstTrip = new Trip("Italy 2026", null, null);
        Trip secondTrip = new Trip("Europe 2027", null, null);
        firstTrip.addStop(rome);
        secondTrip.addStop(rome);

        TripMapOverviewResponse overview = TravelApiMapper.toMapOverviewResponse(List.of(firstTrip, secondTrip));

        assertThat(overview.markers()).hasSize(2).allSatisfy(marker -> {
            assertThat(marker.cityId()).isEqualTo(rome.getId());
            assertThat(marker.cityName()).isEqualTo("Rome");
            assertThat(marker.latitude()).isEqualByComparingTo("41.9028");
            assertThat(marker.longitude()).isEqualByComparingTo("12.4964");
            assertThat(marker.country().code()).isEqualTo("IT");
        });
    }

    @Test
    void mapsPlaceVisitsWithJournalAndSafeOrderedPhotoMetadata() {
        Country italy = new Country("IT", "Italy");
        City rome = new City(
                italy,
                "Rome",
                new CityLocation(new BigDecimal("41.9028"), new BigDecimal("12.4964")));
        Trip trip = new Trip(
                "Italy 2026",
                java.time.LocalDate.of(2026, 5, 1),
                java.time.LocalDate.of(2026, 5, 12),
                "A spring journey");
        var stop = trip.addStop(
                rome,
                java.time.LocalDate.of(2026, 5, 3),
                java.time.LocalDate.of(2026, 5, 5),
                "Evening walks through Trastevere.");
        var firstPhoto = stop.addPhoto("private/first", "first.jpg", "image/jpeg", 101);
        var secondPhoto = stop.addPhoto("private/second", "second.png", "image/png", 202);

        PlaceDetailsResponse response = TravelApiMapper.toResponse(new PlaceDetails(rome, List.of(stop)));

        assertThat(response.city().id()).isEqualTo(rome.getId());
        assertThat(response.city().country().name()).isEqualTo("Italy");
        assertThat(response.visitCount()).isEqualTo(1);
        assertThat(response.visits()).singleElement().satisfies(visit -> {
            assertThat(visit.tripId()).isEqualTo(trip.getId());
            assertThat(visit.tripName()).isEqualTo("Italy 2026");
            assertThat(visit.tripDescription()).isEqualTo("A spring journey");
            assertThat(visit.arrivalDate()).isEqualTo(java.time.LocalDate.of(2026, 5, 3));
            assertThat(visit.departureDate()).isEqualTo(java.time.LocalDate.of(2026, 5, 5));
            assertThat(visit.note()).isEqualTo("Evening walks through Trastevere.");
            assertThat(visit.photos()).extracting(photo -> photo.id())
                    .containsExactly(firstPhoto.getId(), secondPhoto.getId());
            assertThat(visit.photos()).extracting(photo -> photo.contentUrl())
                    .containsExactly(
                            "/api/trips/%s/stops/%s/photos/%s/content".formatted(
                                    trip.getId(), stop.getId(), firstPhoto.getId()),
                            "/api/trips/%s/stops/%s/photos/%s/content".formatted(
                                    trip.getId(), stop.getId(), secondPhoto.getId()));
        });
    }
}
