package io.github.lost2705.wandermap.ai.application;

import java.math.BigDecimal;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.springframework.stereotype.Component;

@Component
public class TripPlanValidator {

    static final int MAXIMUM_DURATION_DAYS = 60;
    static final int MAXIMUM_STOPS = 12;
    static final int MAXIMUM_ACTIVITIES_PER_STOP = 8;
    static final int MAXIMUM_CONSIDERATIONS = 10;
    private static final BigDecimal COORDINATE_TOLERANCE = new BigDecimal("0.01");
    private static final Set<String> ALLOWED_SOURCES = Set.of(
            "Travel Profile", "Journeys", "Bucket List", "Place Search", "Weather");

    public void validate(TripPlanDraft draft, List<ResolvedPlace> resolvedPlaces) {
        validateStructure(draft);

        Set<PlaceKey> uniqueStops = new HashSet<>();
        for (TripPlanStop stop : draft.stops()) {
            ResolvedPlace resolved = resolve(stop, resolvedPlaces);
            if (resolved == null) {
                invalid("every stop must match a place returned by an application tool");
            }
            if (stop.bucketListMatch() != resolved.bucketListMatch()
                    || stop.alreadyVisited() != resolved.alreadyVisited()) {
                invalid("personal place flags must match application tool data");
            }
            if (!uniqueStops.add(PlaceKey.from(resolved))) {
                invalid("duplicate city stops are not supported");
            }
        }
    }

    public void validateClientDraft(TripPlanDraft draft) {
        try {
            validateStructure(draft);
        } catch (InvalidTripPlanException exception) {
            throw new InvalidTripPlanRequestException("current plan is invalid");
        }
    }

    private static void validateStructure(TripPlanDraft draft) {
        if (draft == null) {
            invalid("plan is required");
        }
        text(draft.title(), "title", 160);
        text(draft.summary(), "summary", 1_000);
        text(draft.destinationSummary(), "destinationSummary", 500);
        if (draft.pace() == null) {
            invalid("pace is required");
        }
        if (draft.durationDays() < 1 || draft.durationDays() > MAXIMUM_DURATION_DAYS) {
            invalid("durationDays must be between 1 and 60");
        }
        validateDates(draft);
        if (draft.stops().isEmpty() || draft.stops().size() > MAXIMUM_STOPS) {
            invalid("stops must contain between 1 and 12 entries");
        }

        int allocatedDays = 0;
        Set<PlaceKey> uniqueStops = new HashSet<>();
        for (TripPlanStop stop : draft.stops()) {
            if (stop == null) {
                invalid("stops must not contain null entries");
            }
            text(stop.cityName(), "cityName", 160);
            text(stop.countryName(), "countryName", 100);
            text(stop.reason(), "reason", 1_000);
            if (stop.countryCode() == null || !stop.countryCode().matches("[A-Z]{2}")) {
                invalid("countryCode must contain two uppercase letters");
            }
            coordinates(stop.latitude(), stop.longitude());
            if (stop.daysAtStop() < 1 || stop.daysAtStop() > MAXIMUM_DURATION_DAYS) {
                invalid("daysAtStop must be between 1 and 60");
            }
            allocatedDays += stop.daysAtStop();
            if (stop.activities().size() > MAXIMUM_ACTIVITIES_PER_STOP) {
                invalid("a stop must not contain more than 8 activities");
            }
            stop.activities().forEach(activity -> text(activity, "activity", 200));
            if (!uniqueStops.add(new PlaceKey(
                    stop.cityName().strip().toLowerCase(Locale.ROOT),
                    stop.countryCode(),
                    stop.latitude().stripTrailingZeros(),
                    stop.longitude().stripTrailingZeros()))) {
                invalid("duplicate city stops are not supported");
            }
        }
        if (allocatedDays != draft.durationDays()) {
            invalid("sum of daysAtStop must equal durationDays");
        }

        if (draft.considerations().size() > MAXIMUM_CONSIDERATIONS) {
            invalid("considerations must not contain more than 10 entries");
        }
        draft.considerations().forEach(value -> text(value, "consideration", 500));
        if (draft.sourcesUsed().size() > 5 || new HashSet<>(draft.sourcesUsed()).size() != draft.sourcesUsed().size()) {
            invalid("sourcesUsed must contain at most five unique entries");
        }
        draft.sourcesUsed().forEach(value -> text(value, "source", 80));
        if (!ALLOWED_SOURCES.containsAll(draft.sourcesUsed())) {
            invalid("sourcesUsed contains an unsupported source");
        }
    }

    private static void validateDates(TripPlanDraft draft) {
        if ((draft.startDate() == null) != (draft.endDate() == null)) {
            invalid("startDate and endDate must both be present or both be absent");
        }
        if (draft.startDate() == null) {
            return;
        }
        if (draft.startDate().isAfter(draft.endDate())) {
            invalid("startDate must not be after endDate");
        }
        long inclusiveDays = ChronoUnit.DAYS.between(draft.startDate(), draft.endDate()) + 1;
        if (inclusiveDays != draft.durationDays()) {
            invalid("inclusive date range must equal durationDays");
        }
    }

    private static ResolvedPlace resolve(TripPlanStop stop, List<ResolvedPlace> candidates) {
        ResolvedPlace match = null;
        for (ResolvedPlace candidate : candidates) {
            if (candidate.latitude() == null || candidate.longitude() == null) {
                continue;
            }
            if (sameText(stop.cityName(), candidate.cityName())
                    && stop.countryCode().equals(candidate.countryCode())
                    && sameText(stop.countryName(), candidate.countryName())
                    && close(stop.latitude(), candidate.latitude())
                    && close(stop.longitude(), candidate.longitude())) {
                match = merge(match, candidate);
            }
        }
        return match;
    }

    private static ResolvedPlace merge(ResolvedPlace left, ResolvedPlace right) {
        if (left == null) {
            return right;
        }
        return new ResolvedPlace(
                left.cityName(),
                left.countryCode(),
                left.countryName(),
                left.latitude(),
                left.longitude(),
                left.bucketListMatch() || right.bucketListMatch(),
                left.alreadyVisited() || right.alreadyVisited());
    }

    private static boolean close(BigDecimal left, BigDecimal right) {
        return left.subtract(right).abs().compareTo(COORDINATE_TOLERANCE) <= 0;
    }

    private static boolean sameText(String left, String right) {
        return left.strip().toLowerCase(Locale.ROOT).equals(right.strip().toLowerCase(Locale.ROOT));
    }

    private static void coordinates(BigDecimal latitude, BigDecimal longitude) {
        if (latitude == null || longitude == null
                || latitude.compareTo(BigDecimal.valueOf(-90)) < 0
                || latitude.compareTo(BigDecimal.valueOf(90)) > 0
                || longitude.compareTo(BigDecimal.valueOf(-180)) < 0
                || longitude.compareTo(BigDecimal.valueOf(180)) > 0) {
            invalid("coordinates must be finite WGS84 values");
        }
    }

    private static void text(String value, String field, int maximumLength) {
        if (value == null || value.isBlank() || value.strip().length() > maximumLength) {
            invalid(field + " must be nonblank and no longer than " + maximumLength + " characters");
        }
    }

    private static void invalid(String message) {
        throw new InvalidTripPlanException(message);
    }

    private record PlaceKey(
            String cityName,
            String countryCode,
            BigDecimal latitude,
            BigDecimal longitude) {

        static PlaceKey from(ResolvedPlace place) {
            return new PlaceKey(
                    place.cityName().strip().toLowerCase(Locale.ROOT),
                    place.countryCode(),
                    place.latitude().stripTrailingZeros(),
                    place.longitude().stripTrailingZeros());
        }
    }
}
