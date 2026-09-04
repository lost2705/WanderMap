package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

import com.sun.net.httpserver.HttpServer;
import io.github.lost2705.wandermap.ai.infrastructure.weather.OpenMeteoWeatherClient;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.web.client.RestClient;

class OpenMeteoWeatherClientIT {

    @Test
    void callsTheWeatherEndpointThroughARealHttpBoundaryWithoutInternet() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/forecast", exchange -> {
            assertThat(exchange.getRequestURI().getQuery())
                    .contains("latitude=35.6762", "longitude=139.6503", "forecast_days=1");
            byte[] body = """
                    {"daily":{"time":["2026-09-03"],"temperature_2m_max":[27.0],
                    "temperature_2m_min":[20.0],"precipitation_probability_max":[40],"weather_code":[61]}}
                    """.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            OpenMeteoWeatherClient client = new OpenMeteoWeatherClient(RestClient.builder()
                    .baseUrl("http://127.0.0.1:" + server.getAddress().getPort())
                    .build());

            var forecast = client.getShortTermForecast(
                    new BigDecimal("35.6762"), new BigDecimal("139.6503"));

            assertThat(forecast.condition()).isEqualTo("rain");
            assertThat(forecast.precipitationProbabilityPercent()).isEqualTo(40);
        } finally {
            server.stop(0);
        }
    }
}
