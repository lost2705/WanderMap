package io.github.lost2705.wandermap.travel.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/**
 * Replacement-style trip details update. Omitted dates are interpreted as {@code null}; they are not preserved.
 */
public record UpdateTripRequest(
        @NotBlank @Size(max = 200) String name, LocalDate startDate, LocalDate endDate, String description) {
}
