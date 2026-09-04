package io.github.lost2705.wandermap.ai.application;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class TripPlanValidatorTest {

    private final TripPlanValidator validator = new TripPlanValidator();
    private final ResolvedPlace rome = place("Rome", "IT", "Italy", "41.9028", "12.4964");

    @Test
    void acceptsAResolvedInternallyConsistentPlan() {
        assertThatCode(() -> validator.validate(validPlan(), List.of(rome))).doesNotThrowAnyException();
    }

    @Test
    void rejectsDurationMismatch() {
        TripPlanDraft plan = draft(3, null, null, List.of(stop("Rome", "IT", "Italy", "41.9028", "12.4964", 2)));

        assertInvalid(plan, List.of(rome), "sum of daysAtStop");
    }

    @Test
    void rejectsEmptyAndOversizedStopLists() {
        assertInvalid(draft(1, null, null, List.of()), List.of(rome), "stops");
        List<TripPlanStop> stops = new ArrayList<>();
        for (int index = 0; index < 13; index++) {
            stops.add(stop("City " + index, "IT", "Italy", "41." + index, "12." + index, 1));
        }
        assertInvalid(draft(13, null, null, stops), List.of(rome), "stops");
    }

    @Test
    void rejectsInvalidCoordinatesAndCountryCode() {
        assertInvalid(
                draft(1, null, null, List.of(stop("Rome", "IT", "Italy", "91", "12.4964", 1))),
                List.of(rome),
                "coordinates");
        assertInvalid(
                draft(1, null, null, List.of(stop("Rome", "Italy", "Italy", "41.9028", "12.4964", 1))),
                List.of(rome),
                "countryCode");
    }

    @Test
    void rejectsDuplicateResolvedCityStops() {
        TripPlanDraft plan = draft(
                2,
                null,
                null,
                List.of(
                        stop("Rome", "IT", "Italy", "41.9028", "12.4964", 1),
                        stop("rome", "IT", "ITALY", "41.90280", "12.49640", 1)));

        assertInvalid(plan, List.of(rome), "duplicate city");
    }

    @Test
    void rejectsReversedPartialAndDurationInconsistentDates() {
        assertInvalid(
                draft(2, LocalDate.parse("2026-10-03"), LocalDate.parse("2026-10-01"),
                        List.of(stop("Rome", "IT", "Italy", "41.9028", "12.4964", 2))),
                List.of(rome),
                "startDate");
        assertInvalid(
                draft(1, LocalDate.parse("2026-10-01"), null,
                        List.of(stop("Rome", "IT", "Italy", "41.9028", "12.4964", 1))),
                List.of(rome),
                "both be present");
        assertInvalid(
                draft(2, LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-03"),
                        List.of(stop("Rome", "IT", "Italy", "41.9028", "12.4964", 2))),
                List.of(rome),
                "inclusive date range");
    }

    @Test
    void rejectsOverlongStringsAndOversizedActivities() {
        TripPlanDraft overlong = new TripPlanDraft(
                "x".repeat(161),
                "Summary",
                1,
                null,
                null,
                "Italy",
                TripPlanPace.RELAXED,
                List.of(stop("Rome", "IT", "Italy", "41.9028", "12.4964", 1)),
                List.of(),
                List.of("Place Search"));
        assertInvalid(overlong, List.of(rome), "title");

        TripPlanStop tooManyActivities = new TripPlanStop(
                "Rome", "IT", "Italy", decimal("41.9028"), decimal("12.4964"), 1, "Reason",
                List.of("1", "2", "3", "4", "5", "6", "7", "8", "9"), false, false);
        assertInvalid(draft(1, null, null, List.of(tooManyActivities)), List.of(rome), "activities");
    }

    @Test
    void rejectsDuplicateAndUnsupportedSourceLabels() {
        TripPlanDraft duplicateSources = validPlan().withSourcesUsed(List.of("Place Search", "Place Search"));
        assertInvalid(duplicateSources, List.of(rome), "five unique");

        TripPlanDraft unsupportedSource = validPlan().withSourcesUsed(List.of("Model memory"));
        assertInvalid(unsupportedSource, List.of(rome), "unsupported source");
    }

    @Test
    void rejectsMissingPaceAndUnresolvedPlaces() {
        TripPlanDraft noPace = new TripPlanDraft(
                "Italy", "Summary", 1, null, null, "Italy", null,
                List.of(stop("Rome", "IT", "Italy", "41.9028", "12.4964", 1)), List.of(), List.of());
        assertInvalid(noPace, List.of(rome), "pace");
        assertInvalid(validPlan(), List.of(), "application tool");
    }

    private TripPlanDraft validPlan() {
        return draft(1, null, null, List.of(stop("Rome", "IT", "Italy", "41.9028", "12.4964", 1)));
    }

    private static TripPlanDraft draft(
            int duration,
            LocalDate start,
            LocalDate end,
            List<TripPlanStop> stops) {
        return new TripPlanDraft(
                "Italy draft",
                "A calm architecture-focused trip.",
                duration,
                start,
                end,
                "Italy",
                TripPlanPace.RELAXED,
                stops,
                List.of("Exact costs are not available in this version."),
                List.of("Place Search"));
    }

    private static TripPlanStop stop(
            String city,
            String countryCode,
            String country,
            String latitude,
            String longitude,
            int days) {
        return new TripPlanStop(
                city,
                countryCode,
                country,
                decimal(latitude),
                decimal(longitude),
                days,
                "It fits the requested pace and interests.",
                List.of("Architecture", "Food"),
                false,
                false);
    }

    private static ResolvedPlace place(
            String city,
            String countryCode,
            String country,
            String latitude,
            String longitude) {
        return new ResolvedPlace(
                city, countryCode, country, decimal(latitude), decimal(longitude), false, false);
    }

    private void assertInvalid(TripPlanDraft plan, List<ResolvedPlace> places, String message) {
        assertThatThrownBy(() -> validator.validate(plan, places))
                .isInstanceOf(InvalidTripPlanException.class)
                .hasMessageContaining(message);
    }

    private static BigDecimal decimal(String value) {
        return new BigDecimal(value);
    }
}
