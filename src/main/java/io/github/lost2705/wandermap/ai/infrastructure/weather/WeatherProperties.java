package io.github.lost2705.wandermap.ai.infrastructure.weather;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("wandermap.ai.weather")
public record WeatherProperties(String baseUrl, Duration connectTimeout, Duration readTimeout) {

    public WeatherProperties {
        baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://api.open-meteo.com" : baseUrl.strip();
        connectTimeout = connectTimeout == null ? Duration.ofSeconds(2) : connectTimeout;
        readTimeout = readTimeout == null ? Duration.ofSeconds(5) : readTimeout;
        if (connectTimeout.isNegative() || connectTimeout.isZero()
                || readTimeout.isNegative() || readTimeout.isZero()) {
            throw new IllegalArgumentException("WanderMap weather timeouts must be positive");
        }
    }
}
