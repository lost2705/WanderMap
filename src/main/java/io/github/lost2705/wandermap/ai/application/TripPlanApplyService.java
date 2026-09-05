package io.github.lost2705.wandermap.ai.application;

import io.github.lost2705.wandermap.ai.persistence.TripPlanApplyRequestRepository;
import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.travel.application.TripService;
import io.github.lost2705.wandermap.travel.application.VerifiedCityResolutionService;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.ObjectMapper;

/** Explicit user action, deliberately independent of the read-only agent and model ports. */
@Service
public class TripPlanApplyService {

    private static final Logger LOGGER = LoggerFactory.getLogger(TripPlanApplyService.class);

    private final TripPlanValidator validator;
    private final VerifiedCityResolutionService cities;
    private final TripService trips;
    private final TripRepository tripRepository;
    private final TripPlanApplyRequestRepository requests;
    private final CurrentUserProvider currentUser;
    private final ObjectMapper mapper;
    private final TransactionTemplate transaction;

    public TripPlanApplyService(
            TripPlanValidator validator,
            VerifiedCityResolutionService cities,
            TripService trips,
            TripRepository tripRepository,
            TripPlanApplyRequestRepository requests,
            CurrentUserProvider currentUser,
            ObjectMapper mapper,
            PlatformTransactionManager transactionManager) {
        this.validator = validator;
        this.cities = cities;
        this.trips = trips;
        this.tripRepository = tripRepository;
        this.requests = requests;
        this.currentUser = currentUser;
        this.mapper = mapper;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    public Trip apply(TripPlanDraft plan, UUID requestId) {
        Instant started = Instant.now();
        LOGGER.info("trip_plan_apply.started");
        try {
            validator.validateClientDraft(plan);
            if (requestId == null) {
                throw new InvalidTripPlanRequestException("requestId is required");
            }
            String hash = payloadHash(plan);
            UUID userId = currentUser.getCurrentUser().getId();
            Trip trip = transaction.execute(status -> {
                if (!requests.claim(userId, requestId, hash)) {
                    var previous = requests.get(userId, requestId);
                    // Preserve exact retries of keys created by the pre-audit Phase 3 implementation.
                    if (previous.tripId() == null || (!previous.payloadHash().equals(hash)
                            && !previous.payloadHash().equals(hashDraft(plan)))) {
                        throw new TripPlanApplyConflictException();
                    }
                    return trips.getTrip(previous.tripId());
                }
                var resolved = new ArrayList<City>();
                var identities = new HashSet<UUID>();
                var locations = new HashSet<PhysicalPlace>();
                for (TripPlanStop stop : plan.stops()) {
                    City city = cities.resolve(stop.cityName(), stop.countryCode(), stop.countryName(),
                            stop.latitude(), stop.longitude());
                    if (!identities.add(city.getId()) || !locations.add(new PhysicalPlace(
                            city.getCountry().getCode(), new CityLocation(city.getLatitude(), city.getLongitude())))) {
                        throw new InvalidTripPlanRequestException("duplicate canonical city stops");
                    }
                    resolved.add(city);
                }
                Trip created = trips.createTripWithStops(plan.title(), plan.startDate(), plan.endDate(), resolved);
                // JDBC ledger and JPA writes share this transaction; flush before its FK update.
                tripRepository.flush();
                requests.complete(userId, requestId, created.getId());
                return created;
            });
            LOGGER.info("trip_plan_apply.completed stops={} durationMs={}",
                    plan.stops().size(), Duration.between(started, Instant.now()).toMillis());
            return trip;
        } catch (RuntimeException exception) {
            LOGGER.warn("trip_plan_apply.failed failureType={} durationMs={}",
                    exception.getClass().getSimpleName(), Duration.between(started, Instant.now()).toMillis());
            if (exception instanceof DataAccessException) {
                throw new TripPlanApplyUnavailableException(exception);
            }
            throw exception;
        }
    }

    private String payloadHash(TripPlanDraft plan) {
        var stops = plan.stops().stream().map(stop -> {
            CityLocation location = new CityLocation(stop.latitude(), stop.longitude());
            return new TripPlanStop(City.normalizeName(stop.cityName()), stop.countryCode(),
                    City.normalizeName(stop.countryName()), location.latitude(), location.longitude(),
                    stop.daysAtStop(), stop.reason(), stop.activities(), stop.bucketListMatch(), stop.alreadyVisited());
        }).toList();
        // Keep the full draft contract, but canonicalize domain identity and the unordered source set.
        // DTO constructors already normalize absent/null optional lists to empty lists.
        var canonical = new TripPlanDraft(plan.title().strip(), plan.summary(), plan.durationDays(),
                plan.startDate(), plan.endDate(), plan.destinationSummary(), plan.pace(), stops,
                plan.considerations(), plan.sourcesUsed().stream().sorted().toList());
        return hashDraft(canonical);
    }

    private String hashDraft(TripPlanDraft draft) {
        try {
            // Hash the typed DTO, not raw JSON: object property order cannot change the request identity.
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(mapper.writeValueAsBytes(draft)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private record PhysicalPlace(String countryCode, CityLocation location) {
    }
}
