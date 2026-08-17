package io.github.lost2705.wandermap.travel.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record CreateTripRequest(
        @NotBlank @Size(max = 200) String name, LocalDate startDate, LocalDate endDate, String description) {
}
