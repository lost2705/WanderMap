package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceException;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@Testcontainers
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

        entityManager.persist(new TripStop(trip, city, 1));
        entityManager.flush();
        entityManager.persist(new TripStop(trip, city, 1));

        assertThatThrownBy(entityManager::flush)
                .isInstanceOf(PersistenceException.class)
                .hasRootCauseInstanceOf(org.postgresql.util.PSQLException.class)
                .hasMessageContaining("uq_trip_stops_trip_position");
    }

    @Test
    void permitsDuplicateCitiesAtDifferentTripStopPositions() {
        City city = persistCity("Florence " + UUID.randomUUID());
        Trip trip = tripRepository.saveAndFlush(new Trip("Repeated Florence", null, null));

        entityManager.persist(new TripStop(trip, city, 1));
        entityManager.persist(new TripStop(trip, city, 2));
        entityManager.flush();

        Long stopCount = entityManager.createQuery(
                        "SELECT COUNT(stop) FROM TripStop stop WHERE stop.trip = :trip", Long.class)
                .setParameter("trip", trip)
                .getSingleResult();
        assertThat(stopCount).isEqualTo(2);
    }

    private City persistCity(String name) {
        Country italy = countryRepository.getReferenceById("IT");
        return cityRepository.saveAndFlush(new City(italy, name));
    }
}
