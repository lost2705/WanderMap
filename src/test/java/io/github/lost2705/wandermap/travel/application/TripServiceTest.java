package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.domain.TripStopNotFoundException;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import java.time.LocalDate;
import java.util.List;
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

    @Mock
    private TripRepository tripRepository;

    @Mock
    private CountryRepository countryRepository;

    @Mock
    private CityRepository cityRepository;

    @Mock
    private CityLocationResolver cityLocationResolver;

    private TripService tripService;

    @BeforeEach
    void setUp() {
        tripService = new TripService(tripRepository, countryRepository, cityRepository, cityLocationResolver);
    }

    @Test
    void createsTrip() {
        when(tripRepository.save(any(Trip.class))).thenAnswer(invocation -> invocation.getArgument(0));

        Trip createdTrip = tripService.createTrip("Italy 2026", LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 21));

        assertThat(createdTrip.getName()).isEqualTo("Italy 2026");
        assertThat(createdTrip.getStartDate()).isEqualTo(LocalDate.of(2026, 5, 10));
        assertThat(createdTrip.getEndDate()).isEqualTo(LocalDate.of(2026, 5, 21));
        verify(tripRepository).save(createdTrip);
    }

    @Test
    void getsExistingTripWithStops() {
        Trip trip = tripWithStops("Rome");
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));

        assertThat(tripService.getTrip(trip.getId())).isSameAs(trip);
    }

    @Test
    void rejectsUnknownTrip() {
        UUID tripId = UUID.randomUUID();
        when(tripRepository.findByIdWithStops(tripId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tripService.getTrip(tripId))
                .isInstanceOf(TripNotFoundException.class)
                .hasMessage("trip not found: " + tripId);
    }

    @Test
    void listsTripsByRepositoryDeterministicOrder() {
        Trip alps = new Trip("Alps", null, null);
        Trip italy = new Trip("Italy", null, null);
        when(tripRepository.findAllWithStopsOrderByNameAscIdAsc()).thenReturn(List.of(alps, italy));

        assertThat(tripService.listTrips()).containsExactly(alps, italy);
    }

    @Test
    void updatesTripNameAndDates() {
        Trip trip = new Trip("Italy", null, null);
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(tripRepository.save(trip)).thenReturn(trip);

        Trip updatedTrip = tripService.updateTrip(
                trip.getId(), "Italy in May", LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 21));

        assertThat(updatedTrip.getName()).isEqualTo("Italy in May");
        assertThat(updatedTrip.getStartDate()).isEqualTo(LocalDate.of(2026, 5, 10));
        assertThat(updatedTrip.getEndDate()).isEqualTo(LocalDate.of(2026, 5, 21));
        verify(tripRepository).save(trip);
    }

    @Test
    void rejectsInvalidDateUpdateWithoutPersistingIt() {
        Trip trip = new Trip("Italy", LocalDate.of(2026, 5, 10), LocalDate.of(2026, 5, 21));
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));

        assertThatIllegalArgumentException().isThrownBy(() -> tripService.updateTrip(
                trip.getId(), "Italy in June", LocalDate.of(2026, 6, 21), LocalDate.of(2026, 6, 10)));

        assertThat(trip.getName()).isEqualTo("Italy");
        assertThat(trip.getStartDate()).isEqualTo(LocalDate.of(2026, 5, 10));
        assertThat(trip.getEndDate()).isEqualTo(LocalDate.of(2026, 5, 21));
        verify(tripRepository, never()).save(trip);
    }

    @Test
    void deletesExistingTrip() {
        Trip trip = new Trip("Italy", null, null);
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));

        tripService.deleteTrip(trip.getId());

        verify(tripRepository).delete(trip);
    }

    @Test
    void rejectsDeletingUnknownTrip() {
        UUID tripId = UUID.randomUUID();
        when(tripRepository.findByIdWithStops(tripId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tripService.deleteTrip(tripId)).isInstanceOf(TripNotFoundException.class);
        verify(tripRepository, never()).delete(any(Trip.class));
    }

    @Test
    void addsStopWithExistingCity() {
        Trip trip = new Trip("Italy", null, null);
        City rome = new City(ITALY, "Rome");
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByCountry_CodeAndNormalizedName("IT", "rome")).thenReturn(Optional.of(rome));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(trip.getId(), "IT", "  Rome  ");

        assertThat(stop.getCity()).isSameAs(rome);
        assertThat(stop.getPosition()).isEqualTo(1);
        verify(cityRepository, never()).save(any(City.class));
        verify(tripRepository).save(trip);
    }

    @Test
    void addsStopByCreatingMissingCity() {
        Trip trip = new Trip("Italy", null, null);
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByCountry_CodeAndNormalizedName("IT", "florence")).thenReturn(Optional.empty());
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
        Trip trip = new Trip("Italy", null, null);
        CityLocation location = new CityLocation(new java.math.BigDecimal("43.7696"), new java.math.BigDecimal("11.2558"));
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByCountry_CodeAndNormalizedName("IT", "florence")).thenReturn(Optional.empty());
        when(cityLocationResolver.resolve("IT", "florence")).thenReturn(Optional.of(location));
        when(cityRepository.save(any(City.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(trip.getId(), "IT", "Florence");

        assertThat(stop.getCity().getLatitude()).isEqualByComparingTo("43.7696");
        assertThat(stop.getCity().getLongitude()).isEqualByComparingTo("11.2558");
        verify(cityLocationResolver).resolve("IT", "florence");
    }

    @Test
    void persistsCoordinatesSuppliedByASelectedCityWithoutResolvingAgain() {
        Trip trip = new Trip("Tuscany", null, null);
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByCountry_CodeAndNormalizedName("IT", "lucca")).thenReturn(Optional.empty());
        when(cityRepository.save(any(City.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(
                trip.getId(),
                "IT",
                "Lucca",
                new java.math.BigDecimal("43.8429"),
                new java.math.BigDecimal("10.5027"));

        assertThat(stop.getCity().getLatitude()).isEqualByComparingTo("43.8429");
        assertThat(stop.getCity().getLongitude()).isEqualByComparingTo("10.5027");
        verify(cityLocationResolver, never()).resolve(any(), any());
    }

    @Test
    void doesNotResolveAnExistingCityThatAlreadyHasCoordinates() {
        Trip trip = new Trip("Italy", null, null);
        City rome = new City(
                ITALY,
                "Rome",
                new CityLocation(new java.math.BigDecimal("41.9028"), new java.math.BigDecimal("12.4964")));
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByCountry_CodeAndNormalizedName("IT", "rome")).thenReturn(Optional.of(rome));
        when(tripRepository.save(trip)).thenReturn(trip);

        tripService.addStop(trip.getId(), "IT", "Rome");

        verify(cityLocationResolver, never()).resolve(any(), any());
    }

    @Test
    void keepsCreatingAStopWhenLocationResolutionFails() {
        Trip trip = new Trip("Italy", null, null);
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByCountry_CodeAndNormalizedName("IT", "unknown place")).thenReturn(Optional.empty());
        when(cityLocationResolver.resolve("IT", "unknown place")).thenThrow(new IllegalStateException("unavailable"));
        when(cityRepository.save(any(City.class))).thenAnswer(invocation -> invocation.getArgument(0));
        when(tripRepository.save(trip)).thenReturn(trip);

        TripStop stop = tripService.addStop(trip.getId(), "IT", "Unknown Place");

        assertThat(stop.getCity().hasLocation()).isFalse();
        verify(tripRepository).save(trip);
    }

    @Test
    void rejectsUnknownCountry() {
        Trip trip = new Trip("Italy", null, null);
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("FR")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> tripService.addStop(trip.getId(), "FR", "Paris"))
                .isInstanceOf(CountryNotFoundException.class)
                .hasMessage("country not found: FR");
        verify(cityRepository, never()).findByCountry_CodeAndNormalizedName(any(), any());
        verify(tripRepository, never()).save(trip);
    }

    @Test
    void reusesCityForDuplicateNormalizedNameResolution() {
        Trip trip = new Trip("Italy", null, null);
        City rome = new City(ITALY, "Rome");
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(countryRepository.findById("IT")).thenReturn(Optional.of(ITALY));
        when(cityRepository.findByCountry_CodeAndNormalizedName(eq("IT"), eq("rome"))).thenReturn(Optional.of(rome));
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
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
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
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));
        when(tripRepository.save(trip)).thenReturn(trip);

        tripService.removeStop(trip.getId(), florenceStopId);

        assertThat(trip.getStops()).extracting(stop -> stop.getCity().getName()).containsExactly("Rome", "Bologna");
        verify(tripRepository).save(trip);
    }

    @Test
    void exposesExplicitUnknownStopSemantics() {
        Trip trip = tripWithStops("Rome");
        when(tripRepository.findByIdWithStops(trip.getId())).thenReturn(Optional.of(trip));

        assertThatThrownBy(() -> tripService.moveStop(trip.getId(), UUID.randomUUID(), 1))
                .isInstanceOf(TripStopNotFoundException.class);
        verify(tripRepository, never()).save(trip);
    }

    private static Trip tripWithStops(String... cityNames) {
        Trip trip = new Trip("Italy", null, null);
        for (String cityName : cityNames) {
            trip.addStop(new City(ITALY, cityName));
        }
        return trip;
    }
}
