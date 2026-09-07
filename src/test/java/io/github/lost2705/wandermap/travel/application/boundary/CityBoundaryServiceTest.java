package io.github.lost2705.wandermap.travel.application.boundary;

import static io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryResult.Status.*;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.persistence.CityBoundaryRepository;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.json.JsonMapper;

@ExtendWith(MockitoExtension.class)
class CityBoundaryServiceTest {
    @Mock CityRepository cities;
    @Mock TripStopRepository stops;
    @Mock CurrentUserProvider users;
    @Mock CityBoundaryRepository cache;
    @Mock CityBoundaryClient client;
    private final Instant now = Instant.parse("2026-09-06T00:00:00Z");
    private final Instant lease = now.plusSeconds(30);
    private final City city = new City(new Country("IT", "Italy"), "Rome",
            new CityLocation(new BigDecimal("41.9"), new BigDecimal("12.5")));
    private CityBoundaryService service;

    @BeforeEach
    void setUp() {
        var user = mock(UserAccount.class);
        when(users.getCurrentUser()).thenReturn(user);
        when(stops.existsByCity_IdAndTrip_User_Id(eq(city.getId()), any())).thenReturn(true);
        when(cities.findByIdWithCountry(city.getId())).thenReturn(Optional.of(city));
        service = service(true);
    }

    @Test
    void disabledWithoutCacheReturnsUnavailableWithoutLookupOrCacheWrite() {
        assertThat(service(false).getBoundary(city.getId()).status()).isEqualTo(UNAVAILABLE);
        verifyNoInteractions(client);
        verify(cache, never()).claim(any(), any());
    }

    @Test
    void disabledCanStillServeAnExpiredVerifiedBoundary() {
        when(cache.find(city.getId())).thenReturn(Optional.of(new CityBoundaryRepository.Cached(
                AVAILABLE, geometry(), now.minusSeconds(4000000), now.minusSeconds(1))));
        assertThat(service(false).getBoundary(city.getId())).satisfies(result -> {
            assertThat(result.status()).isEqualTo(AVAILABLE);
            assertThat(result.stale()).isTrue();
        });
        verifyNoInteractions(client);
    }

    @Test
    void freshPositiveAndNegativeCacheAvoidTheProvider() {
        for (var status : List.of(AVAILABLE, UNAVAILABLE, TEMPORARILY_UNAVAILABLE)) {
            when(cache.find(city.getId())).thenReturn(Optional.of(new CityBoundaryRepository.Cached(
                    status, status == AVAILABLE ? geometry() : null, now, now.plusSeconds(100))));
            assertThat(service.getBoundary(city.getId()).status()).isEqualTo(status);
        }
        verifyNoInteractions(client);
    }

    @Test
    void expiredNegativeRefreshesAndStoresExactlyOneVerifiedMatch() {
        when(cache.find(city.getId())).thenReturn(Optional.of(new CityBoundaryRepository.Cached(UNAVAILABLE, null, now, now.minusSeconds(1))));
        when(cache.claim(city.getId(), now)).thenReturn(Optional.of(lease));
        when(client.findCandidates(any())).thenReturn(List.of(candidate("Rome", "IT", "1", CityBoundaryClient.Kind.MUNICIPALITY)));
        when(cache.verify(any(), any())).thenReturn(Optional.of(new CityBoundaryRepository.Verified("original", "display")));
        service.getBoundary(city.getId());
        verify(cache).saveAvailable(eq(city.getId()), any(), any(), eq(lease), eq(now), eq(CityBoundaryService.POSITIVE_TTL));
        verify(cache, never()).saveNegative(any(), any(), any(), any(), any());
    }

    @Test
    void rejectsWrongNameCountryAndAdministrativeKindBeforeSpatialValidation() {
        when(cache.claim(city.getId(), now)).thenReturn(Optional.of(lease));
        when(client.findCandidates(any())).thenReturn(List.of(
                candidate("Paris", "IT", "1", CityBoundaryClient.Kind.MUNICIPALITY),
                candidate("Rome", "US", "2", CityBoundaryClient.Kind.MUNICIPALITY),
                candidate("Rome", "IT", "3", CityBoundaryClient.Kind.OTHER)));
        service.getBoundary(city.getId());
        verify(cache, never()).verify(any(), any());
        verify(cache).saveNegative(city.getId(), UNAVAILABLE, lease, now, CityBoundaryService.NEGATIVE_TTL);
    }

    @Test
    void rejectsOutsidePointAndAmbiguousVerifiedCandidates() {
        when(cache.claim(city.getId(), now)).thenReturn(Optional.of(lease));
        when(client.findCandidates(any())).thenReturn(List.of(candidate("Rome", "IT", "1", CityBoundaryClient.Kind.MUNICIPALITY)));
        service.getBoundary(city.getId());
        verify(cache).saveNegative(city.getId(), UNAVAILABLE, lease, now, CityBoundaryService.NEGATIVE_TTL);
        when(client.findCandidates(any())).thenReturn(List.of(candidate("Rome", "IT", "1", CityBoundaryClient.Kind.MUNICIPALITY),
                candidate("Rome", "IT", "2", CityBoundaryClient.Kind.MUNICIPALITY)));
        when(cache.verify(any(), any())).thenReturn(Optional.of(new CityBoundaryRepository.Verified("original", "display")));
        service.getBoundary(city.getId());
        verify(cache, never()).saveAvailable(any(), any(), any(), any(), any(), any());
    }

    @Test
    void providerFailureUsesTemporaryCacheAndRetainsStalePositive() {
        when(cache.claim(city.getId(), now)).thenReturn(Optional.of(lease));
        when(cache.find(city.getId())).thenReturn(Optional.of(new CityBoundaryRepository.Cached(
                TEMPORARILY_UNAVAILABLE, geometry(), now.minusSeconds(4000000), now.minusSeconds(1))));
        when(client.findCandidates(any())).thenThrow(new CityBoundaryLookupException());
        assertThat(service.getBoundary(city.getId()).geometry()).isNotNull();
        verify(cache).saveNegative(city.getId(), TEMPORARILY_UNAVAILABLE, lease, now, CityBoundaryService.FAILURE_TTL);
    }

    @Test
    void anotherRequestLeaseAvoidsDuplicateProviderLookup() {
        assertThat(service.getBoundary(city.getId()).status()).isEqualTo(TEMPORARILY_UNAVAILABLE);
        verifyNoInteractions(client);
    }

    @Test
    void retryDelayReflectsActualCacheExpiryEvenBelowThirtySeconds() {
        for (long seconds : List.of(0L, 5L, 29L, 100L)) {
            when(cache.find(city.getId())).thenReturn(Optional.of(new CityBoundaryRepository.Cached(
                    TEMPORARILY_UNAVAILABLE, null, now, now.plusSeconds(seconds))));
            assertThat(service(false).getBoundary(city.getId()).retryAfterSeconds()).isEqualTo(seconds);
        }
        verifyNoInteractions(client);
    }

    @Test
    void cacheReadFailureIsControlledWithoutCallingTheProvider() {
        when(cache.find(city.getId())).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("private database details"));
        assertThat(service.getBoundary(city.getId())).satisfies(result -> {
            assertThat(result.status()).isEqualTo(TEMPORARILY_UNAVAILABLE);
            assertThat(result.geometry()).isNull();
        });
        verifyNoInteractions(client);
    }

    @Test
    void cacheWriteFailureRetainsThePreviouslyReadGeometryAsStale() {
        when(cache.find(city.getId())).thenReturn(Optional.of(new CityBoundaryRepository.Cached(
                AVAILABLE, geometry(), now.minusSeconds(4000000), now.minusSeconds(1))));
        when(cache.claim(city.getId(), now)).thenReturn(Optional.of(lease));
        when(client.findCandidates(any())).thenReturn(List.of());
        when(cache.saveNegative(any(), any(), any(), any(), any()))
                .thenThrow(new org.springframework.dao.DataAccessResourceFailureException("private database details"));
        assertThat(service.getBoundary(city.getId())).satisfies(result -> {
            assertThat(result.status()).isEqualTo(AVAILABLE);
            assertThat(result.stale()).isTrue();
            assertThat(result.geometry()).isEqualTo(geometry());
            assertThat(result.retryAfterSeconds()).isEqualTo(300);
        });
    }

    @Test
    void temporaryFailureRecoversOnLazyRetryAtTheExactExpiry() {
        var clock = mock(Clock.class);
        var entry = new java.util.concurrent.atomic.AtomicReference<>(new CityBoundaryRepository.Cached(
                TEMPORARILY_UNAVAILABLE, null, now, now.plusSeconds(300)));
        when(clock.instant()).thenReturn(now.plusSeconds(299));
        when(cache.find(city.getId())).thenAnswer(invocation -> Optional.of(entry.get()));
        var timedService = new CityBoundaryService(cities, stops, users, cache, client, true, clock);
        assertThat(timedService.getBoundary(city.getId()).retryAfterSeconds()).isEqualTo(1);
        verifyNoInteractions(client);
        var retry = now.plusSeconds(300);
        when(clock.instant()).thenReturn(retry);
        when(cache.claim(city.getId(), retry)).thenReturn(Optional.of(retry.plusSeconds(30)));
        when(client.findCandidates(any())).thenReturn(List.of(candidate("  rOmE  ", "it", "1", CityBoundaryClient.Kind.MUNICIPALITY)));
        when(cache.verify(any(), any())).thenReturn(Optional.of(new CityBoundaryRepository.Verified("original", "display")));
        when(cache.saveAvailable(any(), any(), any(), any(), any(), any())).thenAnswer(invocation -> {
            entry.set(new CityBoundaryRepository.Cached(AVAILABLE, geometry(), retry, retry.plus(CityBoundaryService.POSITIVE_TTL)));
            return true;
        });
        assertThat(timedService.getBoundary(city.getId()).status()).isEqualTo(AVAILABLE);
        assertThat(timedService.getBoundary(city.getId()).retryAfterSeconds()).isEqualTo(2592000);
        verify(client, times(1)).findCandidates(any());
    }

    private CityBoundaryService service(boolean enabled) {
        return new CityBoundaryService(cities, stops, users, cache, client, enabled, Clock.fixed(now, ZoneOffset.UTC));
    }
    private CityBoundaryClient.Candidate candidate(String name, String country, String id, CityBoundaryClient.Kind kind) {
        return new CityBoundaryClient.Candidate("test", id, Set.of(name), country, kind, geometry());
    }
    private CityBoundaryGeometry geometry() {
        return CityBoundaryGeometry.fromJson(new JsonMapper().readTree("""
                {"type":"Polygon","coordinates":[[[12,41],[13,41],[13,42],[12,42],[12,41]]]}
                """));
    }
}
