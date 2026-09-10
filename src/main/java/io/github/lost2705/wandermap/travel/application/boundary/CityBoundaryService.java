package io.github.lost2705.wandermap.travel.application.boundary;

import static io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryResult.Status.*;

import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.travel.application.CityNotFoundException;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.persistence.CityBoundaryRepository;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

@Service
public class CityBoundaryService {
    private static final Logger LOGGER = LoggerFactory.getLogger(CityBoundaryService.class);
    static final Duration POSITIVE_TTL = Duration.ofDays(30);
    static final Duration NEGATIVE_TTL = Duration.ofDays(1);
    static final Duration FAILURE_TTL = Duration.ofMinutes(5);
    private final CityRepository cities;
    private final TripStopRepository stops;
    private final CurrentUserProvider users;
    private final CityBoundaryRepository cache;
    private final CityBoundaryClient client;
    private final MunicipalityBoundaryPolicy policy = new MunicipalityBoundaryPolicy();
    private final boolean enabled;
    private final Clock clock;

    @Autowired
    public CityBoundaryService(CityRepository cities, TripStopRepository stops, CurrentUserProvider users,
            CityBoundaryRepository cache, CityBoundaryClient client,
            @Value("${wandermap.city-boundaries.external-enabled:false}") boolean enabled) {
        this(cities, stops, users, cache, client, enabled, Clock.systemUTC());
    }

    CityBoundaryService(CityRepository cities, TripStopRepository stops, CurrentUserProvider users,
            CityBoundaryRepository cache, CityBoundaryClient client, boolean enabled, Clock clock) {
        this.cities = cities;
        this.stops = stops;
        this.users = users;
        this.cache = cache;
        this.client = client;
        this.enabled = enabled;
        this.clock = clock;
    }

    // No transaction spans the external call. Each cache mutation is a short atomic JDBC statement.
    public CityBoundaryResult getBoundary(UUID cityId) {
        if (!stops.existsByCity_IdAndTrip_User_Id(cityId, users.getCurrentUser().getId())) {
            throw new CityNotFoundException(cityId);
        }
        City city = cities.findByIdWithCountry(cityId).orElseThrow(() -> new CityNotFoundException(cityId));
        Instant now = clock.instant();
        Optional<CityBoundaryRepository.Cached> existing = Optional.empty();
        try {
            existing = cache.find(cityId);
            return lookup(city, existing, now);
        } catch (DataAccessException exception) {
            // Cache failure is local to this enhancement. Never log SQL/provider geometry or error causes.
            LOGGER.warn("city_boundary.lookup.failed category=cache_access");
            return existing.filter(value -> value.geometry() != null)
                    .map(value -> new CityBoundaryResult(AVAILABLE, value.geometry(), true, FAILURE_TTL.toSeconds()))
                    .orElseGet(() -> absent(TEMPORARILY_UNAVAILABLE));
        }
    }

    private CityBoundaryResult lookup(City city, Optional<CityBoundaryRepository.Cached> existing, Instant now) {
        UUID cityId = city.getId();
        if (!enabled || !city.hasLocation() || existing.filter(value -> value.retryAt().isAfter(now)).isPresent()) {
            return existing.map(value -> result(value, now)).orElseGet(() -> absent(UNAVAILABLE));
        }
        var lease = cache.claim(cityId, now);
        if (lease.isEmpty()) {
            return cache.find(cityId).map(value -> result(value, now)).orElseGet(() -> absent(TEMPORARILY_UNAVAILABLE));
        }
        var query = new CityBoundaryClient.Query(city.getName(), city.getCountry().getCode(), city.getLatitude(), city.getLongitude());
        try {
            var candidates = client.findCandidates(query);
            if (candidates == null || candidates.size() > 8) {
                throw new CityBoundaryLookupException();
            }
            var matches = new LinkedHashMap<String, Match>();
            for (var candidate : candidates) {
                if (candidate == null || candidate.geometry() == null || candidate.names() == null
                        || candidate.provider() == null || !candidate.provider().matches("[a-z0-9-]{1,40}")
                        || candidate.boundaryId() == null || candidate.boundaryId().length() > 100) {
                    throw new CityBoundaryLookupException();
                }
                if (candidate.kind() == null || !query.countryCode().equalsIgnoreCase(candidate.countryCode())
                        || candidate.names().stream().noneMatch(name -> City.normalizeName(name).equals(city.getNormalizedName()))) {
                    continue;
                }
                int preference = policy.preference(query, candidate);
                if (preference == MunicipalityBoundaryPolicy.REJECT) {
                    continue;
                }
                cache.verify(candidate.geometry(), query).ifPresent(verified -> {
                    var previous = matches.putIfAbsent(candidate.provider() + ":" + candidate.boundaryId(),
                            new Match(candidate, verified, preference));
                    if (previous != null && !previous.candidate().equals(candidate)) {
                        throw new CityBoundaryLookupException();
                    }
                });
            }
            var resolved = resolve(matches);
            if (resolved.isPresent()) {
                Match match = resolved.get();
                cache.saveAvailable(cityId, match.candidate(), match.geometry(), lease.get(), clock.instant(), POSITIVE_TTL);
                LOGGER.info("city_boundary.lookup.completed");
            } else {
                cache.saveNegative(cityId, UNAVAILABLE, lease.get(), clock.instant(), NEGATIVE_TTL);
                LOGGER.info("city_boundary.lookup.not_found");
            }
        } catch (CityBoundaryLookupException | IllegalArgumentException exception) {
            cache.saveNegative(cityId, TEMPORARILY_UNAVAILABLE, lease.get(), clock.instant(), FAILURE_TTL);
            LOGGER.warn("city_boundary.lookup.failed category=provider_response");
        }
        return cache.find(cityId).map(value -> result(value, clock.instant())).orElseGet(() -> absent(TEMPORARILY_UNAVAILABLE));
    }

    private static CityBoundaryResult result(CityBoundaryRepository.Cached value, Instant now) {
        return new CityBoundaryResult(value.geometry() != null ? AVAILABLE : value.status(), value.geometry(),
                value.geometry() != null && (value.status() != AVAILABLE || !value.checkedAt().plus(POSITIVE_TTL).isAfter(now)),
                Math.max(0, Duration.between(now, value.retryAt()).toSeconds()));
    }

    private static CityBoundaryResult absent(CityBoundaryResult.Status status) {
        return new CityBoundaryResult(status, null, false, FAILURE_TTL.toSeconds());
    }

    private static Optional<Match> resolve(LinkedHashMap<String, Match> matches) {
        Match best = null;
        boolean tied = false;
        for (Match match : matches.values()) {
            if (best == null || match.preference() > best.preference()) {
                best = match;
                tied = false;
            } else if (match.preference() == best.preference()) {
                tied = true;
            }
        }
        return best == null || tied ? Optional.empty() : Optional.of(best);
    }

    private record Match(CityBoundaryClient.Candidate candidate, CityBoundaryRepository.Verified geometry,
                         int preference) {}
}
