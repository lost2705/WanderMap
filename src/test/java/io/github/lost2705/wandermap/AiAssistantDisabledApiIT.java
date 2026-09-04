package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AiAssistantDisabledApiIT extends AuthenticatedIntegrationTestSupport {

    @Test
    void disabledByDefaultReturnsAControlledUnavailableResponse() throws Exception {
        HttpRequest request = csrf(authenticatedRequest("/api/ai/travel-assistant"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"message\":\"Where next?\"}"))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(objectMapper.readTree(response.body()).path("code").asText()).isEqualTo("AI_DISABLED");
    }

    @Test
    void tripPlannerIsAlsoDisabledByDefault() throws Exception {
        HttpRequest request = csrf(authenticatedRequest("/api/ai/trip-plan"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"message\":\"Plan Italy\"}"))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(objectMapper.readTree(response.body()).path("code").asText()).isEqualTo("AI_DISABLED");
    }
}
