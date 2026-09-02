package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.TestUsers;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopPhotoRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TravelProfileServiceTest {

    private static final Country UNITED_STATES = new Country("US", "United States");
    private static final UserAccount USER = TestUsers.user();

    @Mock
    private TripRepository tripRepository;

    @Mock
    private TripStopRepository tripStopRepository;

    @Mock
    private TripStopPhotoRepository photoRepository;

    private TravelProfileService service;

    @BeforeEach
    void setUp() {
        service = new TravelProfileService(tripRepository, tripStopRepository, photoRepository, () -> USER);
    }

    @Test
    void returnsAnEmptyProfile() {
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId())).thenReturn(List.of());

        assertThat(service.getProfile()).isEqualTo(new TravelProfile(0, 0, 0, 0, 0, 0, 0, 0, 0));

        verify(tripStopRepository).countStopsWithMemoryContentForUser(USER.getId());
        verify(photoRepository).countByTripStop_Trip_User_Id(USER.getId());
    }

    @Test
    void derivesVisitsAndRevisitsFromPersistentIdentity() {
        City florenceAlabama = new City(UNITED_STATES, "Florence");
        City florenceSouthCarolina = new City(UNITED_STATES, "Florence");
        Trip southernRoadTrip = new Trip(USER,
                "Southern road trip", LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 5));
        southernRoadTrip.addStop(florenceAlabama);
        southernRoadTrip.addStop(florenceAlabama);
        Trip returnTrip = new Trip(USER,
                "Return south", LocalDate.of(2026, 4, 4), LocalDate.of(2026, 4, 7));
        returnTrip.addStop(florenceAlabama);
        returnTrip.addStop(florenceSouthCarolina);
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId()))
                .thenReturn(List.of(southernRoadTrip, returnTrip));
        when(tripStopRepository.countStopsWithMemoryContentForUser(USER.getId())).thenReturn(3L);
        when(photoRepository.countByTripStop_Trip_User_Id(USER.getId())).thenReturn(7L);

        TravelProfile profile = service.getProfile();

        assertThat(profile).isEqualTo(new TravelProfile(
                2,
                4,
                2,
                1,
                7,
                3,
                7,
                1,
                1));
    }

    @Test
    void doesNotCountRepeatedStopsInOneJourneyAsACountryRevisit() {
        Trip trip = new Trip(USER, "Alabama", null, null);
        trip.addStop(new City(UNITED_STATES, "Florence"));
        trip.addStop(new City(UNITED_STATES, "Montgomery"));
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId())).thenReturn(List.of(trip));

        assertThat(service.getProfile().revisitedCountryCount()).isZero();
    }

    @Test
    void countsDistinctTravelDatesForOverlapsSameDayAndIncompleteJourneys() {
        List<Trip> trips = List.of(
                new Trip(USER, "A", LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 5)),
                new Trip(USER, "B", LocalDate.of(2026, 4, 4), LocalDate.of(2026, 4, 7)),
                new Trip(USER, "Same day", LocalDate.of(2026, 4, 10), LocalDate.of(2026, 4, 10)),
                new Trip(USER, "Known start", LocalDate.of(2026, 4, 12), null),
                new Trip(USER, "Known end", null, LocalDate.of(2026, 4, 12)),
                new Trip(USER, "No known dates", null, null));

        assertThat(TravelProfileService.countDistinctTravelDays(trips)).isEqualTo(9);
    }

    @Test
    void ignoresAReversedLegacyRangeDefensively() {
        Trip invalidTrip = mock(Trip.class);
        when(invalidTrip.getStartDate()).thenReturn(LocalDate.of(2026, 5, 9));
        when(invalidTrip.getEndDate()).thenReturn(LocalDate.of(2026, 5, 2));
        Trip validTrip = new Trip(USER,
                "Valid", LocalDate.of(2026, 5, 11), LocalDate.of(2026, 5, 12));

        assertThat(TravelProfileService.countDistinctTravelDays(List.of(invalidTrip, validTrip))).isEqualTo(2);
    }
}
