package io.github.lost2705.wandermap.travel.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AddTripStopRequest(
        @NotBlank @Size(min = 2, max = 2) @Pattern(regexp = "[A-Za-z]{2}") String countryCode,
        @NotBlank @Size(max = 160) String cityName) {
}
