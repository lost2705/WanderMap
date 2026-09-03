package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.identity.persistence.UserAccountRepository;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.BucketListItem;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.domain.TripStopPhoto;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.BucketListItemRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import io.github.lost2705.wandermap.travel.persistence.TripMemoryCount;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.test.context.transaction.TestTransaction;

@SpringBootTest
@Transactional
class TravelPersistenceIT extends PostgresIntegrationTestSupport {

    @Autowired
    private CountryRepository countryRepository;

    @Autowired
    private CityRepository cityRepository;

    @Autowired
    private BucketListItemRepository bucketListItemRepository;

    @Autowired
    private TripRepository tripRepository;

    @Autowired
    private TripStopRepository tripStopRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private UserAccountRepository userRepository;

    private UserAccount currentUser;

    @BeforeEach
    void createUser() {
        currentUser = userRepository.saveAndFlush(TestUsers.user());
    }

    @Test
    void flywayCreatesTravelCoreSchemaAndSeedsCountries() {
        Integer travelTableCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN ('users', 'countries', 'cities', 'trips', 'trip_stops', 'trip_stop_photos', 'bucket_list_items')
                """,
                Integer.class);

        assertThat(travelTableCount).isEqualTo(7);
        assertThat(countryRepository.findById("IT"))
                .isPresent()
                .get()
                .extracting(Country::getName)
                .isEqualTo("Italy");

        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '10' AND success = TRUE",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void persistsOneBucketListItemPerCanonicalCityWithoutOwningTheCity() {
        City city = persistCity("Bucket city " + UUID.randomUUID());
        BucketListItem item = bucketListItemRepository.saveAndFlush(new BucketListItem(currentUser, city));
        entityManager.clear();

        assertThat(bucketListItemRepository.findAllWithCityAndCountryForUser(currentUser.getId()))
                .anySatisfy(reloaded -> {
                    assertThat(reloaded.getId()).isEqualTo(item.getId());
                    assertThat(reloaded.getCity().getId()).isEqualTo(city.getId());
                    assertThat(reloaded.getCreatedAt()).isNotNull();
                });

        UserAccount secondUser = userRepository.saveAndFlush(TestUsers.user());
        assertThat(bucketListItemRepository.saveAndFlush(new BucketListItem(secondUser, city))).isNotNull();

        assertThatThrownBy(() -> bucketListItemRepository.saveAndFlush(new BucketListItem(currentUser, city)))
                .hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class)
                .hasMessageContaining("uq_bucket_list_items_user_city");
    }

    @Test
    void persistsTripWithNullableDates() {
        Trip trip = tripRepository.saveAndFlush(new Trip(currentUser, "Italy 2026", null, null));
        entityManager.clear();

        Trip reloadedTrip = tripRepository.findById(trip.getId()).orElseThrow();
        assertThat(reloadedTrip.getName()).isEqualTo("Italy 2026");
        assertThat(reloadedTrip.getStartDate()).isNull();
        assertThat(reloadedTrip.getEndDate()).isNull();
        assertThat(reloadedTrip.getDescription()).isNull();
    }

    @Test
    void migrationKeepsPreJournalStyleRowsValidWithNullableFields() {
        UUID tripId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO trips (id, user_id, name) VALUES (?, ?, ?)",
                tripId,
                currentUser.getId(),
                "Legacy trip");

        assertThat(jdbcTemplate.queryForObject(
                "SELECT description IS NULL FROM trips WHERE id = ?", Boolean.class, tripId)).isTrue();

        City city = persistCity("Legacy city " + UUID.randomUUID());
        UUID stopId = UUID.randomUUID();
        jdbcTemplate.update(
                "INSERT INTO trip_stops (id, trip_id, city_id, position) VALUES (?, ?, ?, ?)",
                stopId, tripId, city.getId(), 1);

        assertThat(jdbcTemplate.queryForObject(
                "SELECT arrival_date IS NULL AND departure_date IS NULL AND note IS NULL FROM trip_stops WHERE id = ?",
                Boolean.class,
                stopId)).isTrue();
    }

    @Test
    void persistsTripWithValidDateRange() {
        LocalDate startDate = LocalDate.of(2026, 5, 10);
        LocalDate endDate = LocalDate.of(2026, 5, 21);

        Trip trip = tripRepository.saveAndFlush(new Trip(currentUser, "Italy in May", startDate, endDate));
        entityManager.clear();

        Trip reloadedTrip = tripRepository.findById(trip.getId()).orElseThrow();
        assertThat(reloadedTrip.getStartDate()).isEqualTo(startDate);
        assertThat(reloadedTrip.getEndDate()).isEqualTo(endDate);
    }

    @Test
    void persistsTripAndStopJournalFields() {
        City tokyo = persistCity("Tokyo journal " + UUID.randomUUID());
        Trip trip = new Trip(currentUser,
                "Japan journal",
                LocalDate.of(2026, 4, 1),
                LocalDate.of(2026, 4, 12),
                "Cherry blossom season");
        TripStop stop = trip.addStop(
                tokyo,
                LocalDate.of(2026, 4, 2),
                LocalDate.of(2026, 4, 5),
                "Stayed near Ueno Park.");
        UUID stopId = stop.getId();
        tripRepository.saveAndFlush(trip);
        entityManager.clear();

        Trip reloadedTrip = tripRepository
                .findByIdWithStopsForUser(trip.getId(), currentUser.getId())
                .orElseThrow();
        TripStop reloadedStop = reloadedTrip.getStops().getFirst();
        assertThat(reloadedTrip.getDescription()).isEqualTo("Cherry blossom season");
        assertThat(reloadedStop.getId()).isEqualTo(stopId);
        assertThat(reloadedStop.getArrivalDate()).isEqualTo(LocalDate.of(2026, 4, 2));
        assertThat(reloadedStop.getDepartureDate()).isEqualTo(LocalDate.of(2026, 4, 5));
        assertThat(reloadedStop.getNote()).isEqualTo("Stayed near Ueno Park.");
    }

    @Test
    void persistsAndReloadsOrderedPhotoMetadataWithoutBinaryData() {
        City rome = persistCity("Rome photos " + UUID.randomUUID());
        Trip trip = new Trip(currentUser, "Italy photo persistence", null, null);
        TripStop stop = trip.addStop(rome);
        TripStopPhoto first = stop.addPhoto("ab/first-" + UUID.randomUUID(), "first.jpg", "image/jpeg", 101);
        TripStopPhoto second = stop.addPhoto("cd/second-" + UUID.randomUUID(), "second.png", "image/png", 202);
        UUID tripId = trip.getId();

        tripRepository.saveAndFlush(trip);
        entityManager.clear();

        Trip reloaded = tripRepository.findByIdWithStopsForUser(tripId, currentUser.getId()).orElseThrow();
        assertThat(reloaded.getStops().getFirst().getPhotos())
                .extracting(TripStopPhoto::getId)
                .containsExactly(first.getId(), second.getId());
        assertThat(reloaded.getStops().getFirst().getPhotos())
                .extracting(TripStopPhoto::getPosition)
                .containsExactly(1, 2);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM trip_stop_photos WHERE trip_stop_id = ?",
                Integer.class,
                stop.getId())).isEqualTo(2);
    }

    @Test
    void countsEachStopWithANoteOrPhotosAsOneMemory() {
        long initialMemoryCount = tripStopRepository.countStopsWithMemoryContentForUser(currentUser.getId());
        City city = persistCity("Memory count city " + UUID.randomUUID());
        Trip trip = new Trip(currentUser, "Memory count journey", null, null);
        trip.addStop(
                city,
                LocalDate.of(2026, 4, 1),
                LocalDate.of(2026, 4, 2),
                null);
        trip.addStop(city, null, null, "A meaningful note.");
        trip.addStop(city).addPhoto("memory/photo-only", "photo.jpg", "image/jpeg", 101);
        trip.addStop(city, null, null, "A note with photos.")
                .addPhoto("memory/note-and-photo", "both.jpg", "image/jpeg", 202);

        tripRepository.saveAndFlush(trip);

        assertThat(tripStopRepository.countStopsWithMemoryContentForUser(currentUser.getId()))
                .isEqualTo(initialMemoryCount + 3);
        assertThat(tripStopRepository.countMemoryStopsByTripForUser(currentUser.getId()))
                .containsExactly(new TripMemoryCount(trip.getId(), 3));
    }

    @Test
    void persistsNullableCityCoordinatesWithTheExpectedPrecision() {
        Country italy = countryRepository.getReferenceById("IT");
        City rome = cityRepository.saveAndFlush(new City(
                italy,
                "Rome coordinates " + UUID.randomUUID(),
                new CityLocation(new java.math.BigDecimal("41.9028"), new java.math.BigDecimal("12.4964"))));
        entityManager.clear();

        City reloadedCity = cityRepository.findById(rome.getId()).orElseThrow();

        assertThat(reloadedCity.getLatitude()).isEqualByComparingTo("41.902800");
        assertThat(reloadedCity.getLongitude()).isEqualByComparingTo("12.496400");
    }

    @Test
    void databaseRejectsOutOfRangeCityCoordinates() {
        assertThatThrownBy(() -> jdbcTemplate.update(
                        """
                        INSERT INTO cities (id, country_code, name, normalized_name, latitude, longitude)
                        VALUES (?, 'IT', 'Invalid latitude', 'invalid latitude', 90.1, 0)
                        """,
                        UUID.randomUUID()))
                .hasMessageContaining("ck_cities_latitude_range");

        TestTransaction.flagForRollback();
        TestTransaction.end();
        TestTransaction.start();

        assertThatThrownBy(() -> jdbcTemplate.update(
                        """
                        INSERT INTO cities (id, country_code, name, normalized_name, latitude, longitude)
                        VALUES (?, 'IT', 'Invalid longitude', 'invalid longitude', 0, 180.1)
                        """,
                        UUID.randomUUID()))
                .hasMessageContaining("ck_cities_longitude_range");
    }

    @Test
    void persistsSameNameCitiesAtDifferentLocationsAndRejectsAnExactDuplicateIdentity() {
        Country unitedStates = countryRepository.getReferenceById("US");
        String cityName = "Florence persistence " + UUID.randomUUID();
        City alabama = cityRepository.saveAndFlush(new City(
                unitedStates,
                cityName,
                new CityLocation(new BigDecimal("34.7998"), new BigDecimal("-87.6773"))));
        City southCarolina = cityRepository.saveAndFlush(new City(
                unitedStates,
                cityName,
                new CityLocation(new BigDecimal("34.1954"), new BigDecimal("-79.7626"))));
        entityManager.clear();

        assertThat(cityRepository.findByIdentity(
                        "US", City.normalizeName(cityName), new BigDecimal("34.7998"), new BigDecimal("-87.6773")))
                .get()
                .extracting(City::getId)
                .isEqualTo(alabama.getId());
        assertThat(cityRepository.findByIdentity(
                        "US", City.normalizeName(cityName), new BigDecimal("34.1954"), new BigDecimal("-79.7626")))
                .get()
                .extracting(City::getId)
                .isEqualTo(southCarolina.getId());

        assertThatThrownBy(() -> cityRepository.saveAndFlush(new City(
                        unitedStates,
                        "  " + cityName + "  ",
                        new CityLocation(new BigDecimal("34.7998"), new BigDecimal("-87.6773")))))
                .hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class)
                .hasMessageContaining("uq_cities_country_name_coordinates");
    }

    @Test
    void permitsOnlyOneUnlocatedIdentityForEachNormalizedNameAndCountry() {
        Country italy = countryRepository.getReferenceById("IT");
        String cityName = "Unlocated " + UUID.randomUUID();
        City firstCity = cityRepository.saveAndFlush(new City(italy, cityName));

        assertThat(cityRepository.findByIdentity("IT", City.normalizeName(cityName), null, null))
                .contains(firstCity);

        assertThatThrownBy(() -> cityRepository.saveAndFlush(new City(italy, "  " + cityName + "  ")))
                .hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class)
                .hasMessageContaining("uq_cities_country_name_unlocated");
    }

    @Test
    void rejectsDuplicateTripStopPositionsWithinTrip() {
        City city = persistCity("Rome " + UUID.randomUUID());
        Trip trip = tripRepository.saveAndFlush(new Trip(currentUser, "Italy itinerary", null, null));

        jdbcTemplate.update(
                "INSERT INTO trip_stops (id, trip_id, city_id, position) VALUES (?, ?, ?, ?)",
                UUID.randomUUID(), trip.getId(), city.getId(), 1);

        jdbcTemplate.update(
                "INSERT INTO trip_stops (id, trip_id, city_id, position) VALUES (?, ?, ?, ?)",
                UUID.randomUUID(), trip.getId(), city.getId(), 1);

        assertThatThrownBy(() -> jdbcTemplate.execute("SET CONSTRAINTS uq_trip_stops_trip_position IMMEDIATE"))
                .hasMessageContaining("uq_trip_stops_trip_position");
    }

    @Test
    void permitsDuplicateCitiesAtDifferentTripStopPositions() {
        City city = persistCity("Florence " + UUID.randomUUID());
        Trip trip = new Trip(currentUser, "Repeated Florence", null, null);

        trip.addStop(city);
        trip.addStop(city);
        tripRepository.saveAndFlush(trip);

        Long stopCount = entityManager.createQuery(
                        "SELECT COUNT(stop) FROM TripStop stop WHERE stop.trip = :trip", Long.class)
                .setParameter("trip", trip)
                .getSingleResult();
        assertThat(stopCount).isEqualTo(2);
    }

    @Test
    void persistsTripStopReorderAndRemovalThroughAggregate() {
        City rome = persistCity("Rome " + UUID.randomUUID());
        City florence = persistCity("Florence " + UUID.randomUUID());
        City bologna = persistCity("Bologna " + UUID.randomUUID());
        City venice = persistCity("Venice " + UUID.randomUUID());
        Trip trip = new Trip(currentUser, "Italy itinerary", null, null);
        trip.addStop(rome);
        trip.addStop(florence);
        trip.addStop(bologna);
        trip.addStop(venice);
        UUID tripId = trip.getId();
        UUID romeStopId = trip.getStops().get(0).getId();
        UUID florenceStopId = trip.getStops().get(1).getId();
        UUID bolognaStopId = trip.getStops().get(2).getId();
        UUID veniceStopId = trip.getStops().get(3).getId();

        tripRepository.saveAndFlush(trip);
        TestTransaction.flagForCommit();
        TestTransaction.end();

        TestTransaction.start();
        entityManager.clear();

        Trip reloadedTrip = tripRepository.findById(tripId).orElseThrow();
        assertStops(reloadedTrip, romeStopId, florenceStopId, bolognaStopId, veniceStopId);

        reloadedTrip.moveStop(veniceStopId, 2);
        entityManager.flush();
        TestTransaction.flagForCommit();
        TestTransaction.end();

        TestTransaction.start();
        entityManager.clear();

        Trip reorderedTrip = tripRepository.findById(tripId).orElseThrow();
        assertStops(reorderedTrip, romeStopId, veniceStopId, florenceStopId, bolognaStopId);

        reorderedTrip.removeStop(florenceStopId);
        entityManager.flush();
        TestTransaction.flagForCommit();
        TestTransaction.end();

        TestTransaction.start();
        entityManager.clear();

        Trip compactedTrip = tripRepository.findById(tripId).orElseThrow();
        assertStops(compactedTrip, romeStopId, veniceStopId, bolognaStopId);
        assertThat(entityManager.find(TripStop.class, florenceStopId)).isNull();
    }

    private City persistCity(String name) {
        Country italy = countryRepository.getReferenceById("IT");
        return cityRepository.saveAndFlush(new City(italy, name));
    }

    private static void assertStops(Trip trip, UUID... stopIds) {
        assertThat(trip.getStops()).extracting(TripStop::getId).containsExactly(stopIds);
        assertThat(trip.getStops()).extracting(TripStop::getPosition)
                .containsExactly(java.util.stream.IntStream.rangeClosed(1, stopIds.length)
                        .boxed()
                        .toArray(Integer[]::new));
    }
}
