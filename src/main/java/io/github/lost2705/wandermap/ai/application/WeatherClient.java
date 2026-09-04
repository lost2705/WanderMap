package io.github.lost2705.wandermap.ai.application;

import java.math.BigDecimal;

public interface WeatherClient {

    WeatherForecast getShortTermForecast(BigDecimal latitude, BigDecimal longitude);
}
