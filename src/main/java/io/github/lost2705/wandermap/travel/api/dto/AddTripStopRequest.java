package io.github.lost2705.wandermap.travel.api.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

public record AddTripStopRequest(
        @NotBlank @Size(min = 2, max = 2) @Pattern(regexp = "[A-Za-z]{2}") String countryCode,
        @NotBlank @Size(max = 160) String cityName,
        @DecimalMin("-90") @DecimalMax("90") BigDecimal latitude,
        @DecimalMin("-180") @DecimalMax("180") BigDecimal longitude,
        LocalDate arrivalDate,
        LocalDate departureDate,
        String note) {

    @AssertTrue(message = "latitude and longitude must both be provided")
    public boolean hasCompleteLocation() {
        return (latitude == null) == (longitude == null);
    }
}
