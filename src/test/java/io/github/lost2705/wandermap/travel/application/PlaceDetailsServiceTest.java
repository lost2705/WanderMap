package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PlaceDetailsServiceTest {

    @Mock
    private CityRepository cityRepository;

    @Mock
    private TripStopRepository tripStopRepository;

    private PlaceDetailsService service;

    @BeforeEach
    void setUp() {
        service = new PlaceDetailsService(cityRepository, tripStopRepository);
    }

    @Test
    void returnsEveryStopForTheCityInChronologicalOrderWithoutCollapsingRepeatedVisits() {
        City florence = new City(new Country("US", "United States"), "Florence");
        Trip legacyTrip = new Trip("Legacy journey", null, null);
        TripStop legacyVisit = legacyTrip.addStop(florence);
        Trip springTrip = new Trip(
                "Spring journey", LocalDate.of(2026, 5, 1), LocalDate.of(2026, 5, 10));
        TripStop laterSpringVisit = springTrip.addStop(
                florence, LocalDate.of(2026, 5, 6), LocalDate.of(2026, 5, 7), "Second Florence stop");
        TripStop earlierSpringVisit = springTrip.addStop(
                florence, LocalDate.of(2026, 5, 3), LocalDate.of(2026, 5, 4), "First Florence stop");
        Trip winterTrip = new Trip(
                "Winter journey", LocalDate.of(2025, 12, 1), LocalDate.of(2025, 12, 8));
        TripStop winterVisit = winterTrip.addStop(florence);
        when(cityRepository.findByIdWithCountry(florence.getId())).thenReturn(Optional.of(florence));
        when(tripStopRepository.findAllByCityIdWithTripAndPhotos(florence.getId()))
                .thenReturn(List.of(legacyVisit, laterSpringVisit, winterVisit, earlierSpringVisit));

        PlaceDetails details = service.getPlace(florence.getId());

        assertThat(details.city()).isSameAs(florence);
        assertThat(details.visits()).containsExactly(
                winterVisit, earlierSpringVisit, laterSpringVisit, legacyVisit);
        assertThat(details.visits()).filteredOn(stop -> stop.getTrip() == springTrip).hasSize(2);
    }

    @Test
    void rejectsANonexistentCityBeforeLookingUpVisits() {
        UUID cityId = UUID.randomUUID();
        when(cityRepository.findByIdWithCountry(cityId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getPlace(cityId))
                .isInstanceOf(CityNotFoundException.class)
                .hasMessageContaining(cityId.toString());
    }
}
