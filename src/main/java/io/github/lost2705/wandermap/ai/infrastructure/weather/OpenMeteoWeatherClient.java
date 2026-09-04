package io.github.lost2705.wandermap.ai.infrastructure.weather;

import io.github.lost2705.wandermap.ai.application.WeatherClient;
import io.github.lost2705.wandermap.ai.application.WeatherForecast;
import io.github.lost2705.wandermap.ai.application.WeatherUnavailableException;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;

@Component
public class OpenMeteoWeatherClient implements WeatherClient {

    private final RestClient restClient;

    public OpenMeteoWeatherClient(@Qualifier("weatherRestClient") RestClient restClient) {
        this.restClient = restClient;
    }

    @Override
    public WeatherForecast getShortTermForecast(BigDecimal latitude, BigDecimal longitude) {
        try {
            JsonNode response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/v1/forecast")
                            .queryParam("latitude", latitude.toPlainString())
                            .queryParam("longitude", longitude.toPlainString())
                            .queryParam("daily", "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code")
                            .queryParam("forecast_days", 1)
                            .queryParam("timezone", "auto")
                            .build())
                    .retrieve()
                    .body(JsonNode.class);
            return map(response, latitude, longitude);
        } catch (WeatherUnavailableException exception) {
            throw exception;
        } catch (RestClientException exception) {
            throw new WeatherUnavailableException("Weather forecast is temporarily unavailable", exception);
        }
    }

    private static WeatherForecast map(JsonNode response, BigDecimal requestedLatitude, BigDecimal requestedLongitude) {
        if (response == null) {
            throw malformed();
        }
        JsonNode daily = response.path("daily");
        JsonNode dates = daily.path("time");
        JsonNode maximums = daily.path("temperature_2m_max");
        JsonNode minimums = daily.path("temperature_2m_min");
        JsonNode probabilities = daily.path("precipitation_probability_max");
        JsonNode codes = daily.path("weather_code");
        if (!hasValue(dates) || !hasValue(maximums) || !hasValue(minimums) || !hasValue(codes)) {
            throw malformed();
        }
        try {
            JsonNode date = dates.get(0);
            JsonNode maximum = maximums.get(0);
            JsonNode minimum = minimums.get(0);
            JsonNode codeNode = codes.get(0);
            if (!date.isTextual() || date.asText().isBlank()
                    || !maximum.isNumber()
                    || !minimum.isNumber()
                    || !codeNode.isIntegralNumber()
                    || !codeNode.canConvertToInt()) {
                throw malformed();
            }
            int code = codeNode.asInt();
            Integer precipitationProbability = precipitation(probabilities);
            return new WeatherForecast(
                    requestedLatitude,
                    requestedLongitude,
                    LocalDate.parse(date.asText()),
                    minimum.decimalValue(),
                    maximum.decimalValue(),
                    precipitationProbability,
                    code,
                    condition(code));
        } catch (RuntimeException exception) {
            throw malformed();
        }
    }

    private static Integer precipitation(JsonNode probabilities) {
        if (!hasValue(probabilities) || probabilities.get(0).isNull()) {
            return null;
        }
        JsonNode probability = probabilities.get(0);
        if (!probability.isIntegralNumber() || !probability.canConvertToInt()) {
            throw malformed();
        }
        int value = probability.asInt();
        if (value < 0 || value > 100) {
            throw malformed();
        }
        return value;
    }

    private static boolean hasValue(JsonNode node) {
        return node.isArray() && !node.isEmpty() && !node.get(0).isMissingNode();
    }

    static String condition(int code) {
        return switch (code) {
            case 0 -> "clear sky";
            case 1, 2, 3 -> "partly cloudy or overcast";
            case 45, 48 -> "fog";
            case 51, 53, 55, 56, 57 -> "drizzle";
            case 61, 63, 65, 66, 67 -> "rain";
            case 71, 73, 75, 77 -> "snow";
            case 80, 81, 82 -> "rain showers";
            case 85, 86 -> "snow showers";
            case 95, 96, 99 -> "thunderstorm";
            default -> "unknown conditions";
        };
    }

    private static WeatherUnavailableException malformed() {
        return new WeatherUnavailableException("Weather provider returned a malformed forecast");
    }
}
