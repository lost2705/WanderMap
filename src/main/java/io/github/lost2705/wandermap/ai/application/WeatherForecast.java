package io.github.lost2705.wandermap.ai.application;

import java.math.BigDecimal;
import java.time.LocalDate;

public record WeatherForecast(
        BigDecimal latitude,
        BigDecimal longitude,
        LocalDate forecastDate,
        BigDecimal minimumTemperatureCelsius,
        BigDecimal maximumTemperatureCelsius,
        Integer precipitationProbabilityPercent,
        int weatherCode,
        String condition) {
}
