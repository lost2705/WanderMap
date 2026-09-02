package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.TestUsers;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.domain.TripStopNotFoundException;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TripServiceTest {

    private static final Country ITALY = new Country("IT", "Italy");
    private static final Country UNITED_STATES = new Country("US", "United States");
    private static final UserAccount USER = TestUsers.user();

    @Mock
    private TripRepository tripRepository;

    @Mock
    private CountryRepository countryRepository;

    @Mock
    private CityRepository cityRepository;

    @Mock
    private TripStopRepository tripStopRepository;

    @Mock
    private CityLocationResolver cityLocationResolver;

    @Mock
    private PhotoFileLifecycle photoFileLifecycle;

    private TripService tripService;

    @BeforeEach
    void setUp() {
        tripService = new TripService(
                tripRepository,
                tripStopRepository,
                new CityResolutionService(countryRepository, cityRepository, cityLocationResolver),
                photoFileLifecycle,
                () -> USER);
    }

    @Test
    void createsTrip() {
        when(tripRepository.save(any(Trip.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Trip createdTrip = tripService.createTrip(
                "Italy 2026",
                LocalDate.of(2026, 5, 10),
                LocalDate.of(2026, 5, 21),
                "Food and art");

        assertThat(createdTrip.getName()).isEqualTo("Italy 2026");
        assertThat(createdTrip.getStartDate()).isEqualTo(LocalDate.of(2026, 5, 10));
        assertThat(createdTrip.getEndDate()).isEqualTo(LocalDate.of(2026, 5, 21));
        assertThat(createdTrip.getDescription()).isEqualTo("Food and art");
        verify(tripRepository).save(createdTrip);
    }

    @Test
    void getsExistingTripWithStops() {
        Trip trip = tripWithStops("Rome");
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));

        assertThat(tripService.getTrip(trip.getId())).isSameAs(trip);
    }

    @Test
    void rejectsUnknownTrip() {
        UUID tripId = UUID.randomUUID();
        when(tripRepository.findByIdWithStopsForUser(tripId, USER.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tripService.getTrip(tripId))
                .isInstanceOf(TripNotFoundException.class)
                .hasMessage("trip not found: " + tripId);
    }

    @Test
    void listsTripsByRepositoryDeterministicOrder() {
        Trip alps = new Trip(USER, "Alps", null, null);
        Trip italy = new Trip(USER, "Italy", null, null);
        when(tripRepository.findAllWithStopsOrderByNameAscIdAscForUser(USER.getId())).thenReturn(List.of(alps, italy));

        assertThat(tripService.listTrips()).containsExactly(alps, italy);
    }

    @Test
    void buildsMapOverviewWithTheAggregateMemoryCountWithoutReadingPhotoStorage() {
        Trip italy = new Trip(USER, "Italy", null, null);
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId())).thenReturn(List.of(italy));
        when(tripStopRepository.countStopsWithMemoryContentForUser(USER.getId())).thenReturn(3L);

        TripMapOverview overview = tripService.getMapOverview();

        assertThat(overview.trips()).containsExactly(italy);
        assertThat(overview.memoryCount()).isEqualTo(3L);
        verifyNoInteractions(photoFileLifecycle);
    }

    @Test
    void exposesZeroMemoriesForAnEmptyOverview() {
        when(tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(USER.getId())).thenReturn(List.of());
        when(tripStopRepository.countStopsWithMemoryContentForUser(USER.getId())).thenReturn(0L);

        TripMapOverview overview = tripService.getMapOverview();

        assertThat(overview.trips()).isEmpty();
        assertThat(overview.memoryCount()).isZero();
    }

    @Test
    void updatesTripNameAndDates() {
        Trip trip = new Trip(USER, "Italy", null, null);
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(tripRepository.save(trip)).thenReturn(trip);

        Trip updatedTrip = tripService.updateTrip(
                trip.getId(),
                "Italy in May",
                LocalDate.of(2026, 5, 10),
                LocalDate.of(2026, 5, 21),
                "A spring escape");

        assertThat(updatedTrip.getName()).isEqualTo("Italy in May");
        assertThat(updatedTrip.getStartDate()).isEqualTo(LocalDate.of(2026, 5, 10));
        assertThat(updatedTrip.getEndDate()).isEqualTo(LocalDate.of(2026, 5, 21));
        assertThat(updatedTrip.getDescription()).isEqualTo("A spring escape");
        verify(tripRepository).save(trip);
    }

    @Test
    void rejectsInvalidDateUpdateWithoutPersistingIt() {
        Trip trip = new Trip(USER, "Italy", LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 21));
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));

        assertThatIllegalArgumentException().isThrownBy(() -> tripService.updateTrip(
                trip.getId(), "Italy in June", LocalDate.of(2026, 6, 21), LocalDate.of(2026, 6, 10)));

        assertThat(trip.getName()).isEqualTo("Italy");
        assertThat(trip.getStartDate()).isEqualTo(LocalDate.of(2026, 5, 10));
        assertThat(trip.getEndDate()).isEqualTo(LocalDate.of(2026, 5, 21));
        verify(tripRepository, never()).save(trip);
    }

    @Test
    void deletesExistingTrip() {
        Trip trip = new Trip(USER, "Italy", null, null);
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));

        tripService.deleteTrip(trip.getId());

        verify(tripRepository).delete(trip);
    }

    @Test
    void rejectsDeletingUnknownTrip() {
        UUID tripId = UUID.randomUUID();
        when(tripRepository.findByIdWithStopsForUser(tripId, USER.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tripService.deleteTrip(tripId)).isInstanceOf(TripNotFoundException.class);
        verify(tripRepository, never()).delete(any(Trip.class));
    }

    @Test
    void addsStopWithExistingCity() {
        Trip trip = new Trip(USER, "Italy", null, null);
        City rome = new City(ITALY, "Rome");
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByIdentity("IT", "rome", null, null)).thenReturn(Optional.of(rome));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(trip.getId(), "IT", "  Rome  ");

        assertThat(stop.getCity()).isSameAs(rome);
        assertThat(stop.getPosition()).isEqualTo(1);
        verify(cityRepository, never()).save(any(City.class));
        verify(tripRepository).save(trip);
    }

    @Test
    void addsStopByCreatingMissingCity() {
        Trip trip = new Trip(USER, "Italy", null, null);
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByIdentity("IT", "florence", null, null)).thenReturn(Optional.empty());
        when(cityRepository.save(any(City.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(trip.getId(), "IT", " Florence ");

        assertThat(stop.getCity().getName()).isEqualTo("Florence");
        ArgumentCaptor<City> cityCaptor = ArgumentCaptor.forClass(City.class);
        verify(cityRepository).save(cityCaptor.capture());
        assertThat(cityCaptor.getValue().getCountry()).isSameAs(ITALY);
        assertThat(cityCaptor.getValue().getNormalizedName()).isEqualTo("florence");
    }

    @Test
    void appliesAnOptionalLocationWhenCreatingAMissingCity() {
        Trip trip = new Trip(USER, "Italy", null, null);
        CityLocation location = new CityLocation(new BigDecimal("43.7696"), new BigDecimal("11.2558"));
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityLocationResolver.resolve("IT", "florence")).thenReturn(Optional.of(location));
        when(cityRepository.findByIdentity("IT", "florence", location.latitude(), location.longitude()))
                .thenReturn(Optional.empty());
        when(cityRepository.findByIdentity("IT", "florence", null, null)).thenReturn(Optional.empty());
        when(cityRepository.save(any(City.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(trip.getId(), "IT", "Florence");

        assertThat(stop.getCity().getLatitude()).isEqualByComparingTo("43.7696");
        assertThat(stop.getCity().getLongitude()).isEqualByComparingTo("11.2558");
        verify(cityLocationResolver).resolve("IT", "florence");
    }

    @Test
    void persistsCoordinatesSuppliedByASelectedCityWithoutResolvingAgain() {
        Trip trip = new Trip(USER, "Tuscany", null, null);
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByIdentity(
                        "IT", "lucca", new BigDecimal("43.842900"), new BigDecimal("10.502700")))
                .thenReturn(Optional.empty());
        when(cityRepository.findByIdentity("IT", "lucca", null, null)).thenReturn(Optional.empty());
        when(cityRepository.save(any(City.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(
                trip.getId(),
                "IT",
                "Lucca",
                new BigDecimal("43.8429"),
                new BigDecimal("10.5027"));

        assertThat(stop.getCity().getLatitude()).isEqualByComparingTo("43.8429");
        assertThat(stop.getCity().getLongitude()).isEqualByComparingTo("10.5027");
        verify(cityLocationResolver, never()).resolve(any(), any());
    }

    @Test
    void keepsSameNameSelectedCitiesAtDifferentCoordinatesDistinctAndReusesExactSelections() {
        Trip trip = new Trip(USER, "Two Florences", null, null);
        Map<String, City> storedCities = new HashMap<>();
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("US")).thenReturn(Optional.of(UNITED_STATES));
        when(cityRepository.findByIdentity(
                        eq("US"), eq("florence"), nullable(BigDecimal.class), nullable(BigDecimal.class)))
                .thenAnswer(invocation -> Optional.ofNullable(storedCities.get(cityIdentityKey(
                        invocation.getArgument(0),
                        invocation.getArgument(1),
                        invocation.getArgument(2),
                        invocation.getArgument(3)))));
        when(cityRepository.save(any(City.class))).thenAnswer(invocation -> {
            City city = invocation.getArgument(0);
            storedCities.put(cityIdentityKey(
                    city.getCountry().getCode(),
                    city.getNormalizedName(),
                    city.getLatitude(),
                    city.getLongitude()), city);
            return city;
        });
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop alabama = tripService.addStop(
                trip.getId(), "US", "Florence", new BigDecimal("34.7998125"), new BigDecimal("-87.6773125"));
        TripStop southCarolina = tripService.addStop(
                trip.getId(), "US", "Florence", new BigDecimal("34.1954"), new BigDecimal("-79.7626"));
        TripStop alabamaAgain = tripService.addStop(
                trip.getId(), "US", "  FLORENCE  ", new BigDecimal("34.7998125"), new BigDecimal("-87.6773125"));

        assertThat(alabama.getCity()).isNotSameAs(southCarolina.getCity());
        assertThat(alabamaAgain.getCity()).isSameAs(alabama.getCity());
        assertThat(alabama.getCity().getLatitude()).isEqualByComparingTo("34.799813");
        assertThat(alabama.getCity().getLongitude()).isEqualByComparingTo("-87.677313");
        assertThat(southCarolina.getCity().getLatitude()).isEqualByComparingTo("34.1954");
        assertThat(southCarolina.getCity().getLongitude()).isEqualByComparingTo("-79.7626");
        assertThat(trip.getStops()).extracting(TripStop::getCity)
                .containsExactly(alabama.getCity(), southCarolina.getCity(), alabama.getCity());
        verify(cityRepository, org.mockito.Mockito.times(2)).save(any(City.class));
        verify(cityLocationResolver, never()).resolve(any(), any());
    }

    @Test
    void enrichesAnExistingUnlocatedCityWithSelectedCoordinates() {
        Trip trip = new Trip(USER, "Tuscany", null, null);
        City lucca = new City(ITALY, "Lucca");
        BigDecimal latitude = new BigDecimal("43.8429");
        BigDecimal longitude = new BigDecimal("10.5027");
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByIdentity(
                        "IT", "lucca", new BigDecimal("43.842900"), new BigDecimal("10.502700")))
                .thenReturn(Optional.empty());
        when(cityRepository.findByIdentity("IT", "lucca", null, null)).thenReturn(Optional.of(lucca));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(trip.getId(), "IT", "Lucca", latitude, longitude);

        assertThat(stop.getCity()).isSameAs(lucca);
        assertThat(lucca.getLatitude()).isEqualByComparingTo(latitude);
        assertThat(lucca.getLongitude()).isEqualByComparingTo(longitude);
        verify(cityRepository, never()).save(any(City.class));
    }

    @Test
    void coordinateLessRequestReusesAnExistingCityAtTheResolvedLegacyLocation() {
        Trip trip = new Trip(USER, "Italy", null, null);
        CityLocation location = new CityLocation(new BigDecimal("41.9028"), new BigDecimal("12.4964"));
        City rome = new City(
                ITALY,
                "Rome",
                location);
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityLocationResolver.resolve("IT", "rome")).thenReturn(Optional.of(location));
        when(cityRepository.findByIdentity("IT", "rome", location.latitude(), location.longitude()))
                .thenReturn(Optional.of(rome));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(trip.getId(), "IT", "Rome");

        assertThat(stop.getCity()).isSameAs(rome);
        verify(cityRepository, never()).save(any(City.class));
    }

    @Test
    void keepsCreatingAStopWhenLocationResolutionFails() {
        Trip trip = new Trip(USER, "Italy", null, null);
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityLocationResolver.resolve("IT", "unknown place")).thenThrow(new IllegalStateException("unavailable"));
        when(cityRepository.findByIdentity("IT", "unknown place", null, null)).thenReturn(Optional.empty());
        when(cityRepository.save(any(City.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(trip.getId(), "IT", "Unknown Place");

        assertThat(stop.getCity().hasLocation()).isFalse();
        verify(tripRepository).save(trip);
    }

    @Test
    void rejectsUnknownCountry() {
        Trip trip = new Trip(USER, "Italy", null, null);
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("FR")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tripService.addStop(trip.getId(), "FR", "Paris"))
                .isInstanceOf(CountryNotFoundException.class)
                .hasMessage("country not found: FR");
        verify(cityRepository, never()).findByIdentity(any(), any(), any(), any());
        verify(tripRepository, never()).save(trip);
    }

    @Test
    void reusesCityForDuplicateNormalizedNameResolution() {
        Trip trip = new Trip(USER, "Italy", null, null);
        City rome = new City(ITALY, "Rome");
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByIdentity("IT", "rome", null, null)).thenReturn(Optional.of(rome));
        when(tripRepository.save(trip)).thenReturn(trip);

        tripService.addStop(trip.getId(), "IT", "Rome");
        tripService.addStop(trip.getId(), "IT", "  ROME ");

        assertThat(trip.getStops()).extracting(TripStop::getCity).containsExactly(rome, rome);
        verify(cityRepository, never()).save(any(City.class));
    }

    @Test
    void movesStopThroughAggregate() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna", "Venice");
        UUID veniceStopId = trip.getStops().get(3).getId();
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(tripRepository.save(trip)).thenReturn(trip);

        tripService.moveStop(trip.getId(), veniceStopId, 2);

        assertThat(trip.getStops()).extracting(stop -> stop.getCity().getName())
                .containsExactly("Rome", "Venice", "Florence", "Bologna");
        verify(tripRepository).save(trip);
    }

    @Test
    void removesStopThroughAggregate() {
        Trip trip = tripWithStops("Rome", "Florence", "Bologna");
        UUID florenceStopId = trip.getStops().get(1).getId();
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(tripRepository.saveAndFlush(trip)).thenReturn(trip);

        tripService.removeStop(trip.getId(), florenceStopId);

        assertThat(trip.getStops()).extracting(stop -> stop.getCity().getName()).containsExactly("Rome", "Bologna");
        verify(tripRepository).saveAndFlush(trip);
    }

    @Test
    void exposesExplicitUnknownStopSemantics() {
        Trip trip = tripWithStops("Rome");
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));

        assertThatThrownBy(() -> tripService.moveStop(trip.getId(), UUID.randomUUID(), 1))
                .isInstanceOf(TripStopNotFoundException.class);
        verify(tripRepository, never()).save(trip);
    }

    private static Trip tripWithStops(String... cityNames) {
        Trip trip = new Trip(USER, "Italy", null, null);
        for (String cityName : cityNames) {
            trip.addStop(new City(ITALY, cityName));
        }
        return trip;
    }

    @Test
    void addsAndUpdatesStopJournalThroughAggregate() {
        Trip trip = new Trip(USER,
                "Japan", LocalDate.of(2026, 4, 1), LocalDate.of(2026, 4, 12));
        City tokyo = new City(ITALY, "Tokyo");
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByIdentity("IT", "tokyo", null, null)).thenReturn(Optional.of(tokyo));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(
                trip.getId(),
                "IT",
                "Tokyo",
                null,
                null,
                LocalDate.of(2026, 4, 2),
                LocalDate.of(2026, 4, 5),
                "First note");
        TripStop updatedStop = tripService.updateStopJournal(
                trip.getId(),
                stop.getId(),
                LocalDate.of(2026, 4, 3),
                LocalDate.of(2026, 4, 6),
                "Updated note");

        assertThat(updatedStop).isSameAs(stop);
        assertThat(updatedStop.getArrivalDate()).isEqualTo(LocalDate.of(2026, 4, 3));
        assertThat(updatedStop.getDepartureDate()).isEqualTo(LocalDate.of(2026, 4, 6));
        assertThat(updatedStop.getNote()).isEqualTo("Updated note");
        assertThat(updatedStop.getCity()).isSameAs(tokyo);
        assertThat(updatedStop.getPosition()).isEqualTo(1);
        verify(tripRepository, org.mockito.Mockito.times(2)).save(trip);
    }

    @Test
    void rejectsInvalidStopJournalWithoutSaving() {
        Trip trip = tripWithStops("Tokyo");
        UUID stopId = trip.getStops().getFirst().getId();
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));

        assertThatIllegalArgumentException().isThrownBy(() -> tripService.updateStopJournal(
                        trip.getId(),
                        stopId,
                        LocalDate.of(2026, 4, 6),
                        LocalDate.of(2026, 4, 2),
                        "Invalid"))
                .withMessage("stop arrival date must not be after departure date");

        assertThat(trip.getStops().getFirst().getArrivalDate()).isNull();
        assertThat(trip.getStops().getFirst().getNote()).isNull();
        verify(tripRepository, never()).save(trip);
    }

    private static String cityIdentityKey(
            String countryCode, String normalizedName, BigDecimal latitude, BigDecimal longitude) {
        return countryCode + "|" + normalizedName + "|" + latitude + "|" + longitude;
    }
}
