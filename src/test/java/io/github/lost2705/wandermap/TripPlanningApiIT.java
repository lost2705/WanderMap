package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

import io.github.lost2705.wandermap.ai.application.AiMessage;
import io.github.lost2705.wandermap.ai.application.AiModelClient;
import io.github.lost2705.wandermap.ai.application.AiModelRequest;
import io.github.lost2705.wandermap.ai.application.AiModelResponse;
import io.github.lost2705.wandermap.ai.application.AiProviderException;
import io.github.lost2705.wandermap.ai.application.AiToolCall;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import tools.jackson.databind.JsonNode;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(TripPlanningApiIT.FakeAiConfiguration.class)
class TripPlanningApiIT extends AuthenticatedIntegrationTestSupport {

    @Autowired
    private PlanningFakeModel model;

    @Test
    void authenticatedPostReturnsAValidatedStructuredDraftRunIdAndToolsUsed() throws Exception {
        addJourneyWithStop("Italy", "Rome", "IT", "41.9028", "12.4964");

        HttpResponse<String> response = post("Plan one relaxed day in Italy.");

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(response.body());
        assertThat(UUID.fromString(body.path("runId").asText())).isNotNull();
        assertThat(body.path("plan").path("title").asText()).isEqualTo("A grounded draft");
        assertThat(body.path("plan").path("pace").asText()).isEqualTo("RELAXED");
        assertThat(body.path("plan").path("stops").get(0).path("cityName").asText()).isEqualTo("Rome");
        assertThat(body.path("plan").path("stops").get(0).path("alreadyVisited").asBoolean()).isTrue();
        assertThat(body.path("plan").path("sourcesUsed")).extracting(JsonNode::asText)
                .containsExactly("Journeys");
        assertThat(body.path("toolsUsed")).extracting(JsonNode::asText).containsExactly("get_journeys");
        assertThat(body.has("rawModelJson")).isFalse();
        assertThat(model.lastRequest().structuredOutput()).isNotNull();
        assertThat(model.lastRequest().structuredOutput().schema().toString()).doesNotContainIgnoringCase("userId");
    }

    @Test
    void endpointRequiresAuthenticationAndCsrf() throws Exception {
        CookieManager anonymousCookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient anonymousClient = HttpClient.newBuilder().cookieHandler(anonymousCookies).build();
        HttpResponse<String> csrfResponse = anonymousClient.send(
                HttpRequest.newBuilder(uri("/api/auth/csrf")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        JsonNode csrfDetails = objectMapper.readTree(csrfResponse.body());
        String token = anonymousCookies.getCookieStore().getCookies().stream()
                .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                .findFirst()
                .map(HttpCookie::getValue)
                .orElseThrow();
        HttpRequest anonymousRequest = HttpRequest.newBuilder(uri("/api/ai/trip-plan"))
                .header(csrfDetails.path("headerName").asText(), token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"message\":\"Plan Italy\"}"))
                .build();
        HttpResponse<String> anonymous = anonymousClient.send(
                anonymousRequest, HttpResponse.BodyHandlers.ofString());
        assertThat(anonymous.statusCode()).isEqualTo(401);
        assertThat(objectMapper.readTree(anonymous.body()).path("code").asText()).isEqualTo("AUTH_REQUIRED");

        HttpRequest missingCsrf = authenticatedRequest("/api/ai/trip-plan")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"message\":\"Plan Italy\"}"))
                .build();
        assertThat(httpClient.send(missingCsrf, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);

        HttpRequest wrongCsrf = authenticatedRequest("/api/ai/trip-plan")
                .header("X-XSRF-TOKEN", "wrong-token")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"message\":\"Plan Italy\"}"))
                .build();
        assertThat(httpClient.send(wrongCsrf, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);

        HttpRequest anonymousRefinement = HttpRequest.newBuilder(uri("/api/ai/trip-plan/refine"))
                .header(csrfDetails.path("headerName").asText(), token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"plan\":{},\"message\":\"Refine it\"}"))
                .build();
        assertThat(anonymousClient.send(anonymousRefinement, HttpResponse.BodyHandlers.ofString()).statusCode())
                .isEqualTo(401);

        HttpRequest refinementMissingCsrf = authenticatedRequest("/api/ai/trip-plan/refine")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"plan\":{},\"message\":\"Refine it\"}"))
                .build();
        assertThat(httpClient.send(refinementMissingCsrf, HttpResponse.BodyHandlers.ofString()).statusCode())
                .isEqualTo(403);

        HttpRequest refinementWrongCsrf = authenticatedRequest("/api/ai/trip-plan/refine")
                .header("X-XSRF-TOKEN", "wrong-token")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"plan\":{},\"message\":\"Refine it\"}"))
                .build();
        assertThat(httpClient.send(refinementWrongCsrf, HttpResponse.BodyHandlers.ofString()).statusCode())
                .isEqualTo(403);
    }

    @Test
    void authenticatedRefinementReturnsARevalidatedReplacementAndDerivedSources() throws Exception {
        addJourneyWithStop("Italy", "Rome", "IT", "41.9028", "12.4964");
        JsonNode original = objectMapper.readTree(post("Plan one relaxed day in Italy.").body()).path("plan");
        ((tools.jackson.databind.node.ObjectNode) original).set(
                "sourcesUsed", objectMapper.readTree("[\"Weather\"]"));
        ((tools.jackson.databind.node.ObjectNode) original.path("stops").get(0)).put("alreadyVisited", false);

        HttpResponse<String> response = postJson(
                "/api/ai/trip-plan/refine",
                refinementBody(original, "Keep Rome but make it more relaxed."));

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(response.body());
        assertThat(UUID.fromString(body.path("runId").asText())).isNotNull();
        assertThat(body.path("plan").path("stops").get(0).path("cityName").asText()).isEqualTo("Rome");
        assertThat(body.path("plan").path("stops").get(0).path("alreadyVisited").asBoolean()).isTrue();
        assertThat(body.path("plan").path("sourcesUsed")).extracting(JsonNode::asText)
                .containsExactly("Journeys", "Bucket List");
        assertThat(body.path("toolsUsed")).extracting(JsonNode::asText)
                .containsExactly("get_journeys", "get_bucket_list");
        assertThat(model.lastRequest().messages().getFirst().content())
                .contains("untrusted", "get_journeys", "get_bucket_list");
    }

    @Test
    void invalidClientDraftIsBadRequestWhileInvalidRefinementOutputIsAiInvalidPlan() throws Exception {
        AiModelRequest before = model.lastRequest();
        HttpResponse<String> invalidClient = postJson(
                "/api/ai/trip-plan/refine",
                """
                {"plan":{"title":"Broken","summary":"Broken","durationDays":1,
                 "startDate":null,"endDate":null,"destinationSummary":"Nowhere","pace":"RELAXED",
                 "stops":[],"considerations":[],"sourcesUsed":[]},"message":"Refine it"}
                """);
        assertThat(invalidClient.statusCode()).isEqualTo(400);
        assertThat(objectMapper.readTree(invalidClient.body()).path("code").asText()).isEqualTo("INVALID_REQUEST");
        assertThat(model.lastRequest()).isSameAs(before);

        addJourneyWithStop("Italy", "Rome", "IT", "41.9028", "12.4964");
        JsonNode original = objectMapper.readTree(post("Plan Rome").body()).path("plan");
        HttpResponse<String> invalidModel = postJson(
                "/api/ai/trip-plan/refine",
                refinementBody(original, "invalid refinement"));
        assertThat(invalidModel.statusCode()).isEqualTo(502);
        assertThat(objectMapper.readTree(invalidModel.body()).path("code").asText()).isEqualTo("AI_INVALID_PLAN");
    }

    @Test
    void invalidPlanAndToolLimitUseControlledErrorCodes() throws Exception {
        HttpResponse<String> invalid = post("invalid plan");
        assertThat(invalid.statusCode()).isEqualTo(502);
        assertThat(objectMapper.readTree(invalid.body()).path("code").asText()).isEqualTo("AI_INVALID_PLAN");
        assertThat(invalid.body()).doesNotContain("stops", "model output");

        HttpResponse<String> limited = post("tool-limit");
        assertThat(limited.statusCode()).isEqualTo(503);
        assertThat(objectMapper.readTree(limited.body()).path("code").asText()).isEqualTo("AI_TOOL_CALL_LIMIT");
    }

    @Test
    void providerFailuresUseExistingControlledErrorCodes() throws Exception {
        HttpResponse<String> rateLimited = post("rate-limited");
        assertThat(rateLimited.statusCode()).isEqualTo(429);
        assertThat(objectMapper.readTree(rateLimited.body()).path("code").asText()).isEqualTo("AI_RATE_LIMITED");

        HttpResponse<String> unavailable = post("provider-down");
        assertThat(unavailable.statusCode()).isEqualTo(503);
        assertThat(objectMapper.readTree(unavailable.body()).path("code").asText()).isEqualTo("AI_UNAVAILABLE");
    }

    @Test
    void journeyToolAndFinalDraftRemainIsolatedBetweenAliceAndBob() throws Exception {
        BrowserSession alice = new BrowserSession();
        BrowserSession bob = new BrowserSession();
        alice.register("alice-planner-" + UUID.randomUUID() + "@example.com", "Alice");
        bob.register("bob-planner-" + UUID.randomUUID() + "@example.com", "Bob");
        alice.addJourneyWithStop("Alice Italy", "Rome", "IT", "41.9028", "12.4964");
        bob.addJourneyWithStop("Bob Japan", "Tokyo", "JP", "35.6762", "139.6503");
        alice.addBucketListPlace("Tokyo", "JP", "35.6762", "139.6503");
        bob.addBucketListPlace("Rome", "IT", "41.9028", "12.4964");

        JsonNode alicePlan = objectMapper.readTree(
                alice.post("/api/ai/trip-plan", "{\"message\":\"Plan from my history\"}").body());
        JsonNode bobPlan = objectMapper.readTree(
                bob.post("/api/ai/trip-plan", "{\"message\":\"Plan from my history\"}").body());

        assertThat(alicePlan.path("plan").toString()).contains("Rome", "Italy").doesNotContain("Tokyo", "Japan");
        assertThat(bobPlan.path("plan").toString()).contains("Tokyo", "Japan").doesNotContain("Rome", "Italy");

        JsonNode aliceRefined = objectMapper.readTree(alice.post(
                "/api/ai/trip-plan/refine",
                refinementBody(alicePlan.path("plan"), "Keep only my own travel context")).body());
        JsonNode bobRefined = objectMapper.readTree(bob.post(
                "/api/ai/trip-plan/refine",
                refinementBody(bobPlan.path("plan"), "Keep only my own travel context")).body());

        assertThat(aliceRefined.path("plan").toString()).contains("Rome", "Italy").doesNotContain("Tokyo", "Japan");
        assertThat(bobRefined.path("plan").toString()).contains("Tokyo", "Japan").doesNotContain("Rome", "Italy");
        assertThat(aliceRefined.path("plan").path("sourcesUsed")).extracting(JsonNode::asText)
                .containsExactly("Journeys", "Bucket List");
        assertThat(bobRefined.path("plan").path("sourcesUsed")).extracting(JsonNode::asText)
                .containsExactly("Journeys", "Bucket List");
    }

    private void addJourneyWithStop(
            String journey, String city, String countryCode, String latitude, String longitude) throws Exception {
        String tripId = objectMapper.readTree(postJson("/api/trips", "{\"name\":\"" + journey + "\"}")
                .body()).path("id").asText();
        postJson(
                "/api/trips/" + tripId + "/stops",
                "{\"countryCode\":\"" + countryCode + "\",\"cityName\":\"" + city
                        + "\",\"latitude\":" + latitude + ",\"longitude\":" + longitude + "}");
    }

    private HttpResponse<String> post(String message) throws Exception {
        return postJson(
                "/api/ai/trip-plan",
                "{\"message\":" + objectMapper.writeValueAsString(message) + "}");
    }

    private String refinementBody(JsonNode plan, String message) throws Exception {
        return "{\"plan\":" + plan + ",\"message\":" + objectMapper.writeValueAsString(message) + "}";
    }

    private HttpResponse<String> postJson(String path, String body) throws Exception {
        HttpRequest request = csrf(authenticatedRequest(path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeAiConfiguration {
        @Bean
        @Primary
        PlanningFakeModel testPlanningAiModelClient() {
            return new PlanningFakeModel();
        }
    }

    static final class PlanningFakeModel implements AiModelClient {
        private volatile AiModelRequest lastRequest;

        @Override
        public synchronized AiModelResponse chat(AiModelRequest request) {
            lastRequest = request;
            String firstPrompt = request.messages().stream()
                    .filter(message -> message.role() == AiMessage.Role.USER)
                    .findFirst()
                    .map(AiMessage::content)
                    .orElse("");
            String lastPrompt = request.messages().stream()
                    .filter(message -> message.role() == AiMessage.Role.USER)
                    .reduce((left, right) -> right)
                    .map(AiMessage::content)
                    .orElse("");
            boolean refinement = firstPrompt.startsWith("Current draft proposal");
            if (firstPrompt.startsWith("invalid") || lastPrompt.contains("invalid refinement")) {
                if (refinement && request.messages().stream().noneMatch(message -> message.role() == AiMessage.Role.TOOL)) {
                    return AiModelResponse.toolCalls(
                            new AiToolCall("journeys", "get_journeys", "{}"),
                            new AiToolCall("bucket", "get_bucket_list", "{}"));
                }
                return AiModelResponse.finalAnswer("""
                        {"title":"Broken","summary":"Broken","durationDays":1,"startDate":null,"endDate":null,
                         "destinationSummary":"Nowhere","pace":"RELAXED","stops":[],
                         "considerations":[],"sourcesUsed":[]}
                        """);
            }
            if (firstPrompt.startsWith("tool-limit")) {
                return AiModelResponse.toolCalls(IntStream.rangeClosed(1, 13)
                        .mapToObj(index -> new AiToolCall("test-call-" + index, "get_travel_profile", "{}"))
                        .toArray(AiToolCall[]::new));
            }
            if (firstPrompt.startsWith("rate-limited")) {
                throw new AiProviderException(AiProviderException.Reason.RATE_LIMITED, "test rate limit");
            }
            if (firstPrompt.startsWith("provider-down")) {
                throw new AiProviderException(AiProviderException.Reason.UNAVAILABLE, "test provider outage");
            }
            boolean hasToolResult = request.messages().stream()
                    .anyMatch(message -> message.role() == AiMessage.Role.TOOL);
            if (hasToolResult) {
                boolean containsTokyo = request.messages().stream()
                        .filter(message -> message.role() == AiMessage.Role.TOOL)
                        .anyMatch(message -> message.content().contains("Tokyo"));
                boolean refineTokyo = refinement && firstPrompt.contains("\"cityName\":\"Tokyo\"");
                return (refinement ? refineTokyo : containsTokyo)
                        ? AiModelResponse.finalAnswer(plan("Tokyo", "JP", "Japan", "35.6762", "139.6503"))
                        : AiModelResponse.finalAnswer(plan("Rome", "IT", "Italy", "41.9028", "12.4964"));
            }
            return refinement
                            ? AiModelResponse.toolCalls(
                                    new AiToolCall("journeys", "get_journeys", "{}"),
                                    new AiToolCall("bucket", "get_bucket_list", "{}"))
                            : AiModelResponse.toolCalls(new AiToolCall("journeys", "get_journeys", "{}"));
        }

        AiModelRequest lastRequest() {
            return lastRequest;
        }

        private static String plan(
                String city, String countryCode, String country, String latitude, String longitude) {
            return """
                    {"title":"A grounded draft","summary":"Based on your Journey.","durationDays":1,
                     "startDate":null,"endDate":null,"destinationSummary":"%s","pace":"RELAXED",
                     "stops":[{"cityName":"%s","countryCode":"%s","countryName":"%s",
                     "latitude":%s,"longitude":%s,"daysAtStop":1,"reason":"It matches your history.",
                     "activities":["Walk the historic centre"],"bucketListMatch":false,"alreadyVisited":true}],
                     "considerations":["This is a read-only draft."],"sourcesUsed":[]}
                    """.formatted(country, city, countryCode, country, latitude, longitude);
        }
    }

    private final class BrowserSession {
        private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();
        private String csrfHeader;
        private String csrfToken;

        private BrowserSession() throws Exception {
            refreshCsrf();
        }

        private void register(String email, String name) throws Exception {
            HttpResponse<String> response = post(
                    "/api/auth/register",
                    "{\"email\":\"" + email + "\",\"password\":\"correct horse\",\"displayName\":\""
                            + name + "\"}");
            assertThat(response.statusCode()).isEqualTo(201);
        }

        private void addJourneyWithStop(
                String journey, String city, String countryCode, String latitude, String longitude) throws Exception {
            String tripId = objectMapper.readTree(post("/api/trips", "{\"name\":\"" + journey + "\"}").body())
                    .path("id").asText();
            post(
                    "/api/trips/" + tripId + "/stops",
                    "{\"countryCode\":\"" + countryCode + "\",\"cityName\":\"" + city
                            + "\",\"latitude\":" + latitude + ",\"longitude\":" + longitude + "}");
        }

        private void addBucketListPlace(
                String city, String countryCode, String latitude, String longitude) throws Exception {
            post(
                    "/api/bucket-list",
                    "{\"countryCode\":\"" + countryCode + "\",\"cityName\":\"" + city
                            + "\",\"latitude\":" + latitude + ",\"longitude\":" + longitude + "}");
        }

        private HttpResponse<String> post(String path, String body) throws Exception {
            refreshCsrf();
            HttpRequest request = HttpRequest.newBuilder(uri(path))
                    .header(csrfHeader, csrfToken)
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(body))
                    .build();
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }

        private void refreshCsrf() throws Exception {
            HttpResponse<String> response = client.send(
                    HttpRequest.newBuilder(uri("/api/auth/csrf")).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            JsonNode csrf = objectMapper.readTree(response.body());
            csrfHeader = csrf.path("headerName").asText();
            csrfToken = cookies.getCookieStore().getCookies().stream()
                    .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                    .findFirst()
                    .map(HttpCookie::getValue)
                    .orElseThrow();
        }
    }
}
