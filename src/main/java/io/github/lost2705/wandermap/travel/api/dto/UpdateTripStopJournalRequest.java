package io.github.lost2705.wandermap.travel.api.dto;

import java.time.LocalDate;

/**
 * Replacement-style journal update. Omitted fields are interpreted as {@code null}; they are not preserved.
 */
public record UpdateTripStopJournalRequest(LocalDate arrivalDate, LocalDate departureDate, String note) {
}
