package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import jakarta.persistence.EntityManager;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
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
    private TripRepository tripRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private EntityManager entityManager;

    @Test
    void flywayCreatesTravelCoreSchemaAndSeedsCountries() {
        Integer travelTableCount = jdbcTemplate.queryForObject(
                """
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN ('countries', 'cities', 'trips', 'trip_stops')
                """,
                Integer.class);

        assertThat(travelTableCount).isEqualTo(4);
        assertThat(countryRepository.findById("IT"))
                .isPresent()
                .get()
                .extracting(Country::getName)
                .isEqualTo("Italy");
    }

    @Test
    void persistsTripWithNullableDates() {
        Trip trip = tripRepository.saveAndFlush(new Trip("Italy 2026", null, null));
        entityManager.clear();

        Trip reloadedTrip = tripRepository.findById(trip.getId()).orElseThrow();
        assertThat(reloadedTrip.getName()).isEqualTo("Italy 2026");
        assertThat(reloadedTrip.getStartDate()).isNull();
        assertThat(reloadedTrip.getEndDate()).isNull();
    }

    @Test
    void persistsTripWithValidDateRange() {
        LocalDate startDate = LocalDate.of(2026, 5, 10);
        LocalDate endDate = LocalDate.of(2026, 5, 21);

        Trip trip = tripRepository.saveAndFlush(new Trip("Italy in May", startDate, endDate));
        entityManager.clear();

        Trip reloadedTrip = tripRepository.findById(trip.getId()).orElseThrow();
        assertThat(reloadedTrip.getStartDate()).isEqualTo(startDate);
        assertThat(reloadedTrip.getEndDate()).isEqualTo(endDate);
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
    void enforcesUniqueNormalizedCityNameWithinCountry() {
        Country italy = countryRepository.getReferenceById("IT");
        String cityName = "Milan " + UUID.randomUUID();
        City firstCity = cityRepository.saveAndFlush(new City(italy, cityName));

        assertThat(cityRepository.findByCountry_CodeAndNormalizedName("IT", City.normalizeName(cityName)))
                .contains(firstCity);

        assertThatThrownBy(() -> cityRepository.saveAndFlush(new City(italy, "  " + cityName + "  ")))
                .hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class)
                .hasMessageContaining("uq_cities_country_normalized_name");
    }

    @Test
    void rejectsDuplicateTripStopPositionsWithinTrip() {
        City city = persistCity("Rome " + UUID.randomUUID());
        Trip trip = tripRepository.saveAndFlush(new Trip("Italy itinerary", null, null));

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
        Trip trip = new Trip("Repeated Florence", null, null);

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
        Trip trip = new Trip("Italy itinerary", null, null);
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
