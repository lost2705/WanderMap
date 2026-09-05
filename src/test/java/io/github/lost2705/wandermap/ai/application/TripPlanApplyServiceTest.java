package io.github.lost2705.wandermap.ai.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.TestUsers;
import io.github.lost2705.wandermap.ai.persistence.TripPlanApplyRequestRepository;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.application.TripService;
import io.github.lost2705.wandermap.travel.application.VerifiedCityResolutionService;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.List;
import java.util.HexFormat;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class TripPlanApplyServiceTest {

    @Mock private VerifiedCityResolutionService cities;
    @Mock private TripService trips;
    @Mock private TripRepository tripRepository;
    @Mock private TripPlanApplyRequestRepository requests;
    @Mock private PlatformTransactionManager transactions;
    private final UserAccount owner = TestUsers.user();
    private final UUID key = UUID.randomUUID();
    private TripPlanApplyService service;

    @BeforeEach
    void setUp() {
        service = new TripPlanApplyService(new TripPlanValidator(), cities, trips, tripRepository,
                requests, () -> owner, new JsonMapper(), transactions);
    }

    @Test
    void createsOrdinaryOwnedJourneyWithCanonicalStopsAndIgnoresPlannerMetadata() {
        var plan = plan();
        claim();
        var rome = city("Rome", "41.9028", "12.4964");
        var florence = city("Florence", "43.7696", "11.2558");
        when(cities.resolve(any(), any(), any(), any(), any())).thenReturn(rome, florence);
        when(trips.createTripWithStops(any(), any(), any(), any())).thenAnswer(call -> {
            Trip trip = new Trip(owner, call.getArgument(0), call.getArgument(1), call.getArgument(2));
            call.<List<City>>getArgument(3).forEach(trip::addStop);
            return trip;
        });

        Trip created = service.apply(plan, key);

        assertThat(created.getName()).isEqualTo(plan.title());
        assertThat(created.getStartDate()).isEqualTo(plan.startDate());
        assertThat(created.getEndDate()).isEqualTo(plan.endDate());
        assertThat(created.getUser()).isSameAs(owner);
        assertThat(created.getDescription()).isNull();
        assertThat(created.getStops()).extracting(TripStop::getCity).containsExactly(rome, florence);
        assertThat(created.getStops()).extracting(TripStop::getPosition).containsExactly(1, 2);
        assertThat(created.getStops()).allSatisfy(stop -> {
            assertThat(stop.getNote()).isNull();
            assertThat(stop.getArrivalDate()).isNull();
            assertThat(stop.getDepartureDate()).isNull();
        });
        verify(requests).complete(owner.getId(), key, created.getId());
        verify(transactions).commit(any());
    }

    @Test
    void replaysOriginalJourneyWithoutResolvingOrCreatingAgain() {
        var original = new Trip(owner, "Original", null, null);
        when(requests.claim(eq(owner.getId()), eq(key), any())).thenAnswer(call -> {
            when(requests.get(owner.getId(), key)).thenReturn(
                    new TripPlanApplyRequestRepository.AppliedRequest(call.getArgument(2), original.getId()));
            return false;
        });
        when(trips.getTrip(original.getId())).thenReturn(original);
        assertThat(service.apply(plan(), key)).isSameAs(original);
        verifyNoInteractions(cities, tripRepository);
        verify(trips, never()).createTripWithStops(any(), any(), any(), any());
    }

    @Test
    void replaysPreAuditTypedPayloadHashWithoutRecreatingTheJourney() throws Exception {
        var original = new Trip(owner, "Original", null, null);
        String legacyHash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(new JsonMapper().writeValueAsBytes(plan())));
        when(requests.get(owner.getId(), key)).thenReturn(
                new TripPlanApplyRequestRepository.AppliedRequest(legacyHash, original.getId()));
        when(trips.getTrip(original.getId())).thenReturn(original);
        assertThat(service.apply(plan(), key)).isSameAs(original);
        verifyNoInteractions(cities, tripRepository);
        verify(trips, never()).createTripWithStops(any(), any(), any(), any());
    }

    @Test
    void conflictsOnChangedPayloadOrDeletedJourney() {
        when(requests.get(owner.getId(), key))
                .thenReturn(new TripPlanApplyRequestRepository.AppliedRequest("different", null));
        assertThatThrownBy(() -> service.apply(plan(), key)).isInstanceOf(TripPlanApplyConflictException.class);
        verifyNoInteractions(cities, trips);
        verify(transactions).rollback(any());
    }

    @Test
    void rejectsTwoStopsResolvingToTheSameCityEvenWhenClientCoordinatesDiffer() {
        claim();
        City rome = city("Rome", "41.9028", "12.4964");
        when(cities.resolve(any(), any(), any(), any(), any())).thenReturn(rome);
        assertThatThrownBy(() -> service.apply(plan(), key)).isInstanceOf(InvalidTripPlanRequestException.class);
        verifyNoInteractions(trips);
        verify(requests, never()).complete(any(), any(), any());
        verify(transactions).rollback(any());
    }

    @Test
    void creationFailureRollsBackAndNeverCompletesTheKey() {
        claim();
        when(cities.resolve(any(), any(), any(), any(), any()))
                .thenReturn(city("Rome", "41.9028", "12.4964"), city("Florence", "43.7696", "11.2558"));
        when(trips.createTripWithStops(any(), any(), any(), any())).thenThrow(new IllegalStateException("stop failed"));
        assertThatThrownBy(() -> service.apply(plan(), key)).isInstanceOf(IllegalStateException.class);
        verify(transactions).rollback(any());
        verify(requests, never()).complete(any(), any(), any());
    }

    @ParameterizedTest
    @MethodSource("invalidPlans")
    void rejectsInvalidDraftBeforeAnyDatabaseOrPlaceProcessing(TripPlanDraft plan) {
        assertThatThrownBy(() -> service.apply(plan, key)).isInstanceOf(InvalidTripPlanRequestException.class);
        verifyNoInteractions(requests, trips, cities, transactions);
    }

    static Stream<TripPlanDraft> invalidPlans() {
        var p = plan();
        return Stream.of(
                replace(p, 2, p.startDate(), p.endDate(), p.stops()),
                replace(p, 3, p.endDate(), p.startDate(), p.stops()),
                replace(p, 3, null, p.endDate(), p.stops()),
                replace(p, 3, p.startDate(), p.endDate(), List.of()),
                replace(p, 3, p.startDate(), p.endDate(), List.of(p.stops().getFirst(), p.stops().getFirst())),
                replace(p, 13, null, null, java.util.Collections.nCopies(13, p.stops().getFirst())));
    }

    private void claim() {
        when(requests.claim(eq(owner.getId()), eq(key), any())).thenReturn(true);
    }

    private static TripPlanDraft replace(TripPlanDraft p, int duration, LocalDate start, LocalDate end, List<TripPlanStop> stops) {
        return new TripPlanDraft(p.title(), p.summary(), duration, start, end, p.destinationSummary(), p.pace(),
                stops, p.considerations(), p.sourcesUsed());
    }

    private static TripPlanDraft plan() {
        return new TripPlanDraft("Italy", "Ephemeral summary", 3, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 3),
                "Italy", TripPlanPace.RELAXED, List.of(
                        stop("Rome", "41.9028", "12.4964", 2), stop("Florence", "43.7696", "11.2558", 1)),
                List.of("Ephemeral consideration"), List.of("Weather"));
    }

    private static TripPlanStop stop(String name, String lat, String lon, int days) {
        return new TripPlanStop(name, "IT", "Italy", new BigDecimal(lat), new BigDecimal(lon), days,
                "Ephemeral reason", List.of("Ephemeral activity"), true, true);
    }

    private static City city(String name, String lat, String lon) {
        return new City(new Country("IT", "Italy"), name, new CityLocation(new BigDecimal(lat), new BigDecimal(lon)));
    }
}
