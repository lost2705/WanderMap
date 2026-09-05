package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AiAssistantDisabledApiIT extends AuthenticatedIntegrationTestSupport {

    @Test
    void deterministicApplyWorksWithTheRealDisabledModelClient() throws Exception {
        var tripRequest = csrf(authenticatedRequest("/api/trips")).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"name\":\"Known Italy\"}")).build();
        var trip = objectMapper.readTree(httpClient.send(tripRequest, HttpResponse.BodyHandlers.ofString()).body());
        var stopRequest = csrf(authenticatedRequest("/api/trips/" + trip.path("id").asText() + "/stops"))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString("""
                        {"cityName":"Rome","countryCode":"IT","latitude":41.9028,"longitude":12.4964}
                        """)).build();
        assertThat(httpClient.send(stopRequest, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(201);
        var apply = csrf(authenticatedRequest("/api/ai/trip-plan/apply")).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""
                        {"requestId":"%s","plan":{"title":"Rome without AI","summary":"A draft.","durationDays":1,
                         "startDate":null,"endDate":null,"destinationSummary":"Rome","pace":"RELAXED",
                         "stops":[{"cityName":"Rome","countryCode":"IT","countryName":"Italy",
                         "latitude":41.9028,"longitude":12.4964,"daysAtStop":1,"reason":"A good fit.",
                         "activities":[],"bucketListMatch":false,"alreadyVisited":false}],
                         "considerations":[],"sourcesUsed":[]}}
                        """.formatted(java.util.UUID.randomUUID()))).build();
        var response = httpClient.send(apply, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(objectMapper.readTree(response.body()).path("name").asText()).isEqualTo("Rome without AI");
    }

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

    @Test
    void tripPlanRefinementIsAlsoDisabledByDefault() throws Exception {
        HttpRequest request = csrf(authenticatedRequest("/api/ai/trip-plan/refine"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("""
                        {"plan":{"title":"Rome","summary":"A draft.","durationDays":1,
                         "startDate":null,"endDate":null,"destinationSummary":"Rome","pace":"RELAXED",
                         "stops":[{"cityName":"Rome","countryCode":"IT","countryName":"Italy",
                         "latitude":41.9028,"longitude":12.4964,"daysAtStop":1,"reason":"A good fit.",
                         "activities":[],"bucketListMatch":false,"alreadyVisited":false}],
                         "considerations":[],"sourcesUsed":[]},"message":"Make it more relaxed"}
                        """))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(objectMapper.readTree(response.body()).path("code").asText()).isEqualTo("AI_DISABLED");
    }
}
