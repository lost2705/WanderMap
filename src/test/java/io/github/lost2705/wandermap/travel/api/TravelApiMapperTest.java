package io.github.lost2705.wandermap.travel.api;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.lost2705.wandermap.TestUsers;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.api.dto.TripMapOverviewResponse;
import io.github.lost2705.wandermap.travel.api.dto.PlaceDetailsResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripStopResponse;
import io.github.lost2705.wandermap.travel.application.PlaceDetails;
import io.github.lost2705.wandermap.travel.application.TripMapOverview;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.domain.TripStopPhoto;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class TravelApiMapperTest {

    private static final UserAccount USER = TestUsers.user();

    @Test
    void exposesLocatedStopsAsMarkersAndKeepsUnresolvedStopsValid() {
        Country italy = new Country("IT", "Italy");
        Trip trip = new Trip(USER, "Tuscany", null, null);
        City lucca = new City(
                italy,
                "Lucca",
                new CityLocation(new BigDecimal("43.8429"), new BigDecimal("10.5027")));
        trip.addStop(lucca);
        trip.addStop(new City(italy, "Unresolved village"));

        TripMapOverviewResponse overview = TravelApiMapper.toMapOverviewResponse(new TripMapOverview(List.of(trip), 2));

        assertThat(overview.visitedCountryCodes()).containsExactly("IT");
        assertThat(overview.memoryCount()).isEqualTo(2);
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
        Trip firstTrip = new Trip(USER, "Italy 2026", null, null);
        Trip secondTrip = new Trip(USER, "Europe 2027", null, null);
        firstTrip.addStop(rome);
        secondTrip.addStop(rome);

        TripMapOverviewResponse overview = TravelApiMapper.toMapOverviewResponse(
                new TripMapOverview(List.of(firstTrip, secondTrip), 0));

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
        Trip trip = new Trip(USER,
                "Italy 2026",
                java.time.LocalDate.of(2026, 5, 1),
                java.time.LocalDate.of(2026, 5, 12),
                "A spring journey");
        var stop = trip.addStop(
                rome,
                java.time.LocalDate.of(2026, 5, 3),
                java.time.LocalDate.of(2026, 5, 5),
                "Evening walks through Trastevere.");
        List<TripStopPhoto> orderedPhotos = addPhotosAndReorderCollection(stop);

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
            assertThat(visit.photos()).extracting(photo -> photo.position()).containsExactly(1, 2, 3);
            assertThat(visit.photos()).extracting(photo -> photo.id()).containsExactlyElementsOf(
                    orderedPhotos.stream().map(TripStopPhoto::getId).toList());
            assertThat(visit.photos()).extracting(photo -> photo.contentUrl())
                    .containsExactly(
                            "/api/trips/%s/stops/%s/photos/%s/content".formatted(
                                    trip.getId(), stop.getId(), orderedPhotos.get(0).getId()),
                            "/api/trips/%s/stops/%s/photos/%s/content".formatted(
                                    trip.getId(), stop.getId(), orderedPhotos.get(1).getId()),
                            "/api/trips/%s/stops/%s/photos/%s/content".formatted(
                                    trip.getId(), stop.getId(), orderedPhotos.get(2).getId()));
        });
    }

    @Test
    void mapsTripStopPhotosByPositionRegardlessOfEntityCollectionOrder() {
        Trip trip = new Trip(USER, "Italy photos", null, null);
        TripStop stop = trip.addStop(new City(new Country("IT", "Italy"), "Rome"));
        List<TripStopPhoto> orderedPhotos = addPhotosAndReorderCollection(stop);

        TripStopResponse response = TravelApiMapper.toResponse(stop);

        assertThat(response.photos()).extracting(photo -> photo.position()).containsExactly(1, 2, 3);
        assertThat(response.photos()).extracting(photo -> photo.id()).containsExactlyElementsOf(
                orderedPhotos.stream().map(TripStopPhoto::getId).toList());
    }

    @SuppressWarnings("unchecked")
    private static List<TripStopPhoto> addPhotosAndReorderCollection(TripStop stop) {
        TripStopPhoto first = stop.addPhoto("private/first", "first.jpg", "image/jpeg", 101);
        TripStopPhoto second = stop.addPhoto("private/second", "second.png", "image/png", 202);
        TripStopPhoto third = stop.addPhoto("private/third", "third.webp", "image/webp", 303);
        List<TripStopPhoto> entityPhotos = (List<TripStopPhoto>) ReflectionTestUtils.getField(stop, "photos");
        entityPhotos.clear();
        entityPhotos.addAll(List.of(third, first, second));
        return List.of(first, second, third);
    }
}
