package io.github.lost2705.wandermap.ai.infrastructure.weather;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import io.github.lost2705.wandermap.ai.application.WeatherUnavailableException;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OpenMeteoWeatherClientTest {

    private MockRestServiceServer server;
    private OpenMeteoWeatherClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://weather.test");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new OpenMeteoWeatherClient(builder.build());
    }

    @Test
    void returnsOneCompactShortTermForecast() {
        server.expect(queryParam("latitude", "41.1579"))
                .andExpect(queryParam("longitude", "-8.6291"))
                .andExpect(queryParam("forecast_days", "1"))
                .andExpect(queryParam("timezone", "auto"))
                .andRespond(withSuccess(
                        """
                        {"daily":{
                          "time":["2026-09-03"],
                          "temperature_2m_max":[23.8],
                          "temperature_2m_min":[15.2],
                          "precipitation_probability_max":[10],
                          "weather_code":[1]
                        }}
                        """,
                        MediaType.APPLICATION_JSON));

        var forecast = client.getShortTermForecast(new BigDecimal("41.1579"), new BigDecimal("-8.6291"));

        assertThat(forecast.forecastDate()).isEqualTo(LocalDate.parse("2026-09-03"));
        assertThat(forecast.minimumTemperatureCelsius()).isEqualByComparingTo("15.2");
        assertThat(forecast.maximumTemperatureCelsius()).isEqualByComparingTo("23.8");
        assertThat(forecast.precipitationProbabilityPercent()).isEqualTo(10);
        assertThat(forecast.condition()).isEqualTo("partly cloudy or overcast");
        server.verify();
    }

    @Test
    void rejectsMalformedForecastsAndContainsProviderFailures() {
        server.expect(request -> {}).andRespond(withSuccess("{\"daily\":{}}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.getShortTermForecast(BigDecimal.ZERO, BigDecimal.ZERO))
                .isInstanceOf(WeatherUnavailableException.class)
                .hasMessageContaining("malformed");
        server.verify();

        setUp();
        server.expect(request -> {}).andRespond(withServerError());
        assertThatThrownBy(() -> client.getShortTermForecast(BigDecimal.ZERO, BigDecimal.ZERO))
                .isInstanceOf(WeatherUnavailableException.class)
                .hasMessageContaining("temporarily unavailable");
        server.verify();
    }

    @Test
    void rejectsWrongTypesAndOutOfRangePrecipitationFromTheProvider() {
        assertMalformed("""
                {"daily":{"time":["2026-09-03"],"temperature_2m_max":["warm"],
                  "temperature_2m_min":[15.2],"precipitation_probability_max":[10],"weather_code":[1]}}
                """);
        setUp();
        assertMalformed("""
                {"daily":{"time":["2026-09-03"],"temperature_2m_max":[23.8],
                  "temperature_2m_min":[15.2],"precipitation_probability_max":[101],"weather_code":[1]}}
                """);
        setUp();
        assertMalformed("""
                {"daily":{"time":["2026-09-03"],"temperature_2m_max":[23.8],
                  "temperature_2m_min":[15.2],"precipitation_probability_max":[10],"weather_code":["rain"]}}
                """);
    }

    private void assertMalformed(String response) {
        server.expect(request -> {}).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.getShortTermForecast(BigDecimal.ZERO, BigDecimal.ZERO))
                .isInstanceOf(WeatherUnavailableException.class)
                .hasMessageContaining("malformed");
        server.verify();
    }
}
