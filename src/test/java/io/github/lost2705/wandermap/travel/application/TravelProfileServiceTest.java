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
import io.github.lost2705.wandermap.travel.persistence.TripMemoryCount;
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
        service = new TravelProfileService(
                tripRepository, tripStopRepository, photoRepository, () -> USER, new AchievementEngine());
    }

    @Test
    void returnsAnEmptyProfile() {
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId())).thenReturn(List.of());

        TravelProfile profile = service.getProfile();

        assertThat(profile.journeyCount()).isZero();
        assertThat(profile.highlights()).isEqualTo(new TravelHighlights(null, null, null, null, null));
        assertThat(profile.achievements()).hasSize(12).allSatisfy(achievement -> {
            assertThat(achievement.unlocked()).isFalse();
            assertThat(achievement.progressPercent()).isZero();
        });

        verify(tripStopRepository).countMemoryStopsByTripForUser(USER.getId());
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
        when(tripStopRepository.countMemoryStopsByTripForUser(USER.getId())).thenReturn(List.of(
                new TripMemoryCount(southernRoadTrip.getId(), 2),
                new TripMemoryCount(returnTrip.getId(), 1)));
        when(photoRepository.countByTripStop_Trip_User_Id(USER.getId())).thenReturn(7L);

        TravelProfile profile = service.getProfile();

        assertThat(profile.journeyCount()).isEqualTo(2);
        assertThat(profile.visitCount()).isEqualTo(4);
        assertThat(profile.uniqueCityCount()).isEqualTo(2);
        assertThat(profile.countryCount()).isEqualTo(1);
        assertThat(profile.travelDayCount()).isEqualTo(7);
        assertThat(profile.memoryCount()).isEqualTo(3);
        assertThat(profile.photoCount()).isEqualTo(7);
        assertThat(profile.revisitedCityCount()).isEqualTo(1);
        assertThat(profile.revisitedCountryCount()).isEqualTo(1);
        assertThat(profile.highlights().mostVisitedCity().cityId()).isEqualTo(florenceAlabama.getId());
        assertThat(profile.highlights().mostVisitedCity().visitCount()).isEqualTo(3);
        assertThat(profile.highlights().mostVisitedCountry().countryCode()).isEqualTo("US");
        assertThat(profile.highlights().mostVisitedCountry().visitCount()).isEqualTo(4);
        assertThat(profile.highlights().longestJourney().journeyId()).isEqualTo(southernRoadTrip.getId());
        assertThat(profile.highlights().longestJourney().dayCount()).isEqualTo(5);
        assertThat(profile.highlights().mostRecentJourney().journeyId()).isEqualTo(returnTrip.getId());
        assertThat(profile.highlights().mostMemoryRichJourney().journeyId()).isEqualTo(southernRoadTrip.getId());
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

    @Test
    void choosesHighlightsWithInclusiveDatesAndDeterministicNameTies() {
        Country france = new Country("FR", "France");
        City rome = new City(new Country("IT", "Italy"), "Rome");
        City paris = new City(france, "Paris");
        Trip sameDay = new Trip(USER, "Zulu same day", LocalDate.of(2026, 8, 4), LocalDate.of(2026, 8, 4));
        sameDay.addStop(rome);
        Trip alphaRecent = new Trip(USER, "Alpha recent", LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 3));
        alphaRecent.addStop(paris);
        Trip zuluRecent = new Trip(USER, "Zulu recent", LocalDate.of(2026, 9, 1), LocalDate.of(2026, 9, 3));
        zuluRecent.addStop(rome);
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId()))
                .thenReturn(List.of(zuluRecent, sameDay, alphaRecent));
        when(tripStopRepository.countMemoryStopsByTripForUser(USER.getId())).thenReturn(List.of(
                new TripMemoryCount(zuluRecent.getId(), 2),
                new TripMemoryCount(alphaRecent.getId(), 2)));

        TravelHighlights highlights = service.getProfile().highlights();

        assertThat(highlights.mostVisitedCity().cityName()).isEqualTo("Rome");
        assertThat(highlights.mostVisitedCountry().countryName()).isEqualTo("Italy");
        assertThat(highlights.longestJourney().journeyName()).isEqualTo("Alpha recent");
        assertThat(highlights.longestJourney().dayCount()).isEqualTo(3);
        assertThat(highlights.mostRecentJourney().journeyName()).isEqualTo("Alpha recent");
        assertThat(highlights.mostMemoryRichJourney().journeyName()).isEqualTo("Alpha recent");
    }

    @Test
    void treatsASameDayJourneyAsOneDay() {
        Trip sameDay = new Trip(USER, "Day trip", LocalDate.of(2026, 8, 4), LocalDate.of(2026, 8, 4));
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId()))
                .thenReturn(List.of(sameDay));

        assertThat(service.getProfile().highlights().longestJourney().dayCount()).isEqualTo(1);
    }

    @Test
    void resolvesPlaceAndCountryVisitTiesByNameInsteadOfEncounterOrder() {
        Trip zulu = new Trip(USER, "Zulu", null, null);
        zulu.addStop(new City(UNITED_STATES, "Rome"));
        Trip alpha = new Trip(USER, "Alpha", null, null);
        alpha.addStop(new City(new Country("FR", "France"), "Paris"));
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId()))
                .thenReturn(List.of(zulu, alpha));

        TravelHighlights highlights = service.getProfile().highlights();

        assertThat(highlights.mostVisitedCity().cityName()).isEqualTo("Paris");
        assertThat(highlights.mostVisitedCountry().countryName()).isEqualTo("France");
    }

    @Test
    void omitsUnavailableHighlightsAndIgnoresReversedLegacyRanges() {
        Trip undated = new Trip(USER, "Undated", null, null);
        Trip reversed = mock(Trip.class);
        when(reversed.getId()).thenReturn(java.util.UUID.randomUUID());
        when(reversed.getName()).thenReturn("Reversed legacy");
        when(reversed.getStartDate()).thenReturn(LocalDate.of(2026, 5, 9));
        when(reversed.getEndDate()).thenReturn(LocalDate.of(2026, 5, 2));
        when(reversed.getStops()).thenReturn(List.of());
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId()))
                .thenReturn(List.of(undated, reversed));

        TravelHighlights highlights = service.getProfile().highlights();

        assertThat(highlights.mostVisitedCity()).isNull();
        assertThat(highlights.mostVisitedCountry()).isNull();
        assertThat(highlights.longestJourney()).isNull();
        assertThat(highlights.mostRecentJourney().journeyName()).isEqualTo("Reversed legacy");
        assertThat(highlights.mostMemoryRichJourney()).isNull();
    }
}
