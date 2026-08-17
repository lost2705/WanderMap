package io.github.lost2705.wandermap.travel.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class TravelDomainTest {

    private static final Country ITALY = new Country("IT", "Italy");

    @Test
    void normalizesCityNamesByTrimmingCollapsingWhitespaceAndLowercasing() {
        assertThat(City.normalizeName("  New\t York   City  ")).isEqualTo("new york city");
    }

    @Test
    void rejectsCoordinatesOutsideTheSupportedWorldBounds() {
        assertThatIllegalArgumentException().isThrownBy(() ->
                new CityLocation(new BigDecimal("90.1"), BigDecimal.ZERO))
                .withMessage("latitude must be between -90 and 90");
        assertThatIllegalArgumentException().isThrownBy(() ->
                new CityLocation(BigDecimal.ZERO, new BigDecimal("180.1")))
                .withMessage("longitude must be between -180 and 180");
    }

    @Test
    void normalizesCoordinatesToTheDatabaseIdentityPrecision() {
        CityLocation location = new CityLocation(
                new BigDecimal("34.7998125"), new BigDecimal("-87.6773125"));

        assertThat(location.latitude()).isEqualByComparingTo("34.799813");
        assertThat(location.longitude()).isEqualByComparingTo("-87.677313");
    }

    @Test
    void doesNotAllowAnAssignedCityLocationToBeChanged() {
        City city = new City(
                ITALY,
                "Florence",
                new CityLocation(new BigDecimal("43.7696"), new BigDecimal("11.2558")));

        city.applyLocation(new CityLocation(new BigDecimal("43.769600"), new BigDecimal("11.255800")));

        assertThatThrownBy(() -> city.applyLocation(
                        new CityLocation(new BigDecimal("34.7998"), new BigDecimal("-87.6773"))))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("city location cannot be changed once assigned");
        assertThat(city.getLatitude()).isEqualByComparingTo("43.7696");
        assertThat(city.getLongitude()).isEqualByComparingTo("11.2558");
    }

    @Test
    void rejectsInvalidTripDateRangeBeforePersistence() {
        assertThatIllegalArgumentException().isThrownBy(() ->
                new Trip("Invalid dates", LocalDate.of(2026, 6, 2), LocalDate.of(2026, 6, 1)))
                .withMessage("start date must not be after end date");
    }

    @Test
    void storesTripDescriptionAndStopJournalDetails() {
        Trip trip = new Trip(
                "Japan 2026",
                LocalDate.of(2026, 4, 1),
                LocalDate.of(2026, 4, 12),
                "Spring in Japan");

        TripStop stop = trip.addStop(
                city("Tokyo"),
                LocalDate.of(2026, 4, 2),
                LocalDate.of(2026, 4, 5),
                "  Cherry blossoms in Ueno Park.  ");

        assertThat(trip.getDescription()).isEqualTo("Spring in Japan");
        assertThat(stop.getArrivalDate()).isEqualTo(LocalDate.of(2026, 4, 2));
        assertThat(stop.getDepartureDate()).isEqualTo(LocalDate.of(2026, 4, 5));
        assertThat(stop.getNote()).isEqualTo("Cherry blossoms in Ueno Park.");
    }

    @Test
    void keepsAllJournalFieldsOptionalAndNormalizesBlankTextToNull() {
        Trip trip = new Trip("Japan 2026", null, null, "   ");

        TripStop stop = trip.addStop(city("Tokyo"), null, null, "\n  ");

        assertThat(trip.getDescription()).isNull();
        assertThat(stop.getArrivalDate()).isNull();
        assertThat(stop.getDepartureDate()).isNull();
        assertThat(stop.getNote()).isNull();
    }

    @Test
    void rejectsStopArrivalAfterDeparture() {
        Trip trip = new Trip("Japan 2026", null, null);

        assertThatIllegalArgumentException().isThrownBy(() -> trip.addStop(
                        city("Tokyo"), LocalDate.of(2026, 4, 5), LocalDate.of(2026, 4, 2), null))
                .withMessage("stop arrival date must not be after departure date");
        assertThat(trip.getStops()).isEmpty();
    }

    @Test
    void rejectsStopDatesOutsideKnownTripBoundaries() {
        Trip trip = new Trip(
                "Japan 2026", LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 12));

        assertThatIllegalArgumentException().isThrownBy(() -> trip.addStop(
                        city("Tokyo"), LocalDate.of(2026, 3, 31), null, null))
                .withMessage("stop arrival date must not be before trip start date");
        assertThatIllegalArgumentException().isThrownBy(() -> trip.addStop(
                        city("Kyoto"), null, LocalDate.of(2026, 4, 13), null))
                .withMessage("stop departure date must not be after trip end date");
        assertThat(trip.getStops()).isEmpty();
    }

    @Test
    void updatesStopJournalWithoutChangingItsCityOrPosition() {
        Trip trip = new Trip(
                "Japan 2026", LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 12));
        TripStop stop = trip.addStop(city("Tokyo"));

        TripStop updatedStop = trip.updateStopJournal(
                stop.getId(), LocalDate.of(2026, 4, 2), LocalDate.of(2026, 4, 5), "Tokyo note");

        assertThat(updatedStop).isSameAs(stop);
        assertThat(updatedStop.getPosition()).isEqualTo(1);
        assertThat(updatedStop.getCity().getName()).isEqualTo("Tokyo");
        assertThat(updatedStop.getArrivalDate()).isEqualTo(LocalDate.of(2026, 4, 2));
        assertThat(updatedStop.getDepartureDate()).isEqualTo(LocalDate.of(2026, 4, 5));
        assertThat(updatedStop.getNote()).isEqualTo("Tokyo note");
    }

    @Test
    void rejectsTripDateChangesThatWouldExcludeAnExistingStopWithoutMutatingTheTrip() {
        Trip trip = new Trip(
                "Japan 2026", LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 12), "Original");
        trip.addStop(
                city("Tokyo"), LocalDate.of(2026, 4, 2), LocalDate.of(2026, 4, 5), null);

        assertThatIllegalArgumentException().isThrownBy(() -> trip.updateDetails(
                        "Changed", LocalDate.of(2026, 4, 3), LocalDate.of(2026, 4, 12), "Changed"))
                .withMessage("stop arrival date must not be before trip start date");

        assertThat(trip.getName()).isEqualTo("Japan 2026");
        assertThat(trip.getStartDate()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(trip.getDescription()).isEqualTo("Original");
    }

    @Test
    void addingFirstStopAssignsPositionOne() {
        Trip trip = trip();

        TripStop stop = trip.addStop(city("Rome"));

        assertThat(stop.getPosition()).isEqualTo(1);
        assertStops(trip, "Rome");
    }

    @Test
    void rejectsAddingANullCity() {
        assertThatNullPointerException().isThrownBy(() -> trip().addStop(null))
                .withMessage("city must not be null");
    }

    @Test
    void addingMultipleStopsAppendsInOrder() {
        Trip trip = trip();

        trip.addStop(city("Rome"));
        trip.addStop(city("Florence"));
        trip.addStop(city("Bologna"));

        assertStops(trip, "Rome", "Florence", "Bologna");
    }

    @Test
    void allowsTheSameCityMoreThanOnce() {
        Trip trip = trip();
        City rome = city("Rome");

        trip.addStop(rome);
        trip.addStop(rome);

        assertStops(trip, "Rome", "Rome");
    }

    @Test
    void appendsStopPhotosDeterministicallyAndCompactsPositionsAfterRemoval() {
        TripStop stop = tripWithStops("Rome").getStops().getFirst();
        TripStopPhoto first = stop.addPhoto("ab/first", "first.jpg", "image/jpeg", 100);
        TripStopPhoto second = stop.addPhoto("cd/second", "second.png", "image/png", 200);
        TripStopPhoto third = stop.addPhoto("ef/third", "third.webp", "image/webp", 300);

        assertThat(stop.getPhotos()).containsExactly(first, second, third);
        assertThat(stop.getPhotos()).extracting(TripStopPhoto::getPosition).containsExactly(1, 2, 3);

        stop.removePhoto(second.getId());

        assertThat(stop.getPhotos()).containsExactly(first, third);
        assertThat(stop.getPhotos()).extracting(TripStopPhoto::getPosition).containsExactly(1, 2);
    }

    @Test
    void removingFirstStopCompactsPositions() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna");

        trip.removeStop(trip.getStops().getFirst().getId());

        assertStops(trip, "Florence", "Bologna");
    }

    @Test
    void removingMiddleStopCompactsPositions() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna", "Venice");

        trip.removeStop(trip.getStops().get(1).getId());

        assertStops(trip, "Rome", "Bologna", "Venice");
    }

    @Test
    void removingLastStopKeepsRemainingPositionsValid() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna");

        trip.removeStop(trip.getStops().getLast().getId());

        assertStops(trip, "Rome", "Florence");
    }

    @Test
    void removingUnknownStopFails() {
        Trip trip = tripWithStops("Rome");

        assertThatIllegalArgumentException().isThrownBy(() -> trip.removeStop(UUID.randomUUID()))
                .withMessageStartingWith("trip does not contain stop");
    }

    @Test
    void removingAStopOwnedByAnotherTripFails() {
        Trip trip = tripWithStops("Rome");
        Trip otherTrip = tripWithStops("Florence");

        assertThatIllegalArgumentException().isThrownBy(() -> trip.removeStop(otherTrip.getStops().getFirst().getId()))
                .withMessageStartingWith("trip does not contain stop");
    }

    @Test
    void movesStopForward() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna", "Venice");
        UUID florenceStopId = trip.getStops().get(1).getId();

        trip.moveStop(florenceStopId, 4);

        assertStops(trip, "Rome", "Bologna", "Venice", "Florence");
    }

    @Test
    void movesStopBackward() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna", "Venice");
        UUID veniceStopId = trip.getStops().getLast().getId();

        trip.moveStop(veniceStopId, 2);

        assertStops(trip, "Rome", "Venice", "Florence", "Bologna");
    }

    @Test
    void movesFirstStopToLastPosition() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna", "Venice");

        trip.moveStop(trip.getStops().getFirst().getId(), 4);

        assertStops(trip, "Florence", "Bologna", "Venice", "Rome");
    }

    @Test
    void movesLastStopToFirstPosition() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna", "Venice");

        trip.moveStop(trip.getStops().getLast().getId(), 1);

        assertStops(trip, "Venice", "Rome", "Florence", "Bologna");
    }

    @Test
    void movingToCurrentPositionIsANoOp() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna");
        UUID florenceStopId = trip.getStops().get(1).getId();

        trip.moveStop(florenceStopId, 2);

        assertStops(trip, "Rome", "Florence", "Bologna");
    }

    @Test
    void movingToPositionZeroFails() {
        Trip trip = tripWithStops("Rome");

        assertThatIllegalArgumentException().isThrownBy(() -> trip.moveStop(trip.getStops().getFirst().getId(), 0))
                .withMessage("target position must be between 1 and 1");
    }

    @Test
    void movingPastLastPositionFails() {
        Trip trip = tripWithStops("Rome", "Florence");

        assertThatIllegalArgumentException().isThrownBy(() -> trip.moveStop(trip.getStops().getFirst().getId(), 3))
                .withMessage("target position must be between 1 and 2");
    }

    @Test
    void movingUnknownStopFails() {
        Trip trip = tripWithStops("Rome");

        assertThatIllegalArgumentException().isThrownBy(() -> trip.moveStop(UUID.randomUUID(), 1))
                .withMessageStartingWith("trip does not contain stop");
    }

    @Test
    void movingAStopOwnedByAnotherTripFails() {
        Trip trip = tripWithStops("Rome");
        Trip otherTrip = tripWithStops("Florence");

        assertThatIllegalArgumentException().isThrownBy(() -> trip.moveStop(otherTrip.getStops().getFirst().getId(), 1))
                .withMessageStartingWith("trip does not contain stop");
    }

    @Test
    void doesNotExposeAMutableStopCollection() {
        Trip trip = tripWithStops("Rome");

        assertThatThrownBy(() -> trip.getStops().clear()).isInstanceOf(UnsupportedOperationException.class);
        assertStops(trip, "Rome");
    }

    private static Trip trip() {
        return new Trip("Italy 2026", null, null);
    }

    private static Trip tripWithStops(String... cityNames) {
        Trip trip = trip();
        for (String cityName : cityNames) {
            trip.addStop(city(cityName));
        }
        return trip;
    }

    private static City city(String name) {
        return new City(ITALY, name);
    }

    private static void assertStops(Trip trip, String... cityNames) {
        List<TripStop> stops = trip.getStops();
        assertThat(stops).extracting(stop -> stop.getCity().getName()).containsExactly(cityNames);
        assertThat(stops).extracting(TripStop::getPosition)
                .containsExactly(java.util.stream.IntStream.rangeClosed(1, cityNames.length).boxed().toArray(Integer[]::new));
    }
}
