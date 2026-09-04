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
@Import(AiAssistantApiIT.FakeAiConfiguration.class)
class AiAssistantApiIT extends AuthenticatedIntegrationTestSupport {

    @Autowired
    private ContextAwareFakeModel model;

    @Test
    void authenticatedPostReturnsAnswerRunIdAndToolsUsed() throws Exception {
        HttpResponse<String> response = post("profile: suggest somewhere new");

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(response.body());
        assertThat(UUID.fromString(body.path("runId").asText())).isNotNull();
        assertThat(body.path("answer").asText()).contains("WanderMap context");
        assertThat(body.path("toolsUsed")).extracting(JsonNode::asText)
                .containsExactly("get_travel_profile");
        assertThat(model.lastRequest().tools()).allSatisfy(tool ->
                assertThat(tool.inputSchema().toString()).doesNotContainIgnoringCase("userId"));
    }

    @Test
    void endpointRequiresAuthenticationAndCsrf() throws Exception {
        CookieManager anonymousCookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        HttpClient anonymousClient = HttpClient.newBuilder().cookieHandler(anonymousCookies).build();
        HttpResponse<String> csrfResponse = anonymousClient.send(
                HttpRequest.newBuilder(uri("/api/auth/csrf")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        JsonNode csrfDetails = objectMapper.readTree(csrfResponse.body());
        String anonymousCsrfToken = anonymousCookies.getCookieStore().getCookies().stream()
                .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                .findFirst()
                .map(HttpCookie::getValue)
                .orElseThrow();
        HttpRequest anonymousRequest = HttpRequest.newBuilder(uri("/api/ai/travel-assistant"))
                .header(csrfDetails.path("headerName").asText(), anonymousCsrfToken)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"message\":\"Hello\"}"))
                .build();
        HttpResponse<String> anonymous = anonymousClient
                .send(anonymousRequest, HttpResponse.BodyHandlers.ofString());
        assertThat(anonymous.statusCode()).isEqualTo(401);
        assertThat(objectMapper.readTree(anonymous.body()).path("code").asText()).isEqualTo("AUTH_REQUIRED");

        HttpRequest missingCsrf = authenticatedRequest("/api/ai/travel-assistant")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"message\":\"Hello\"}"))
                .build();
        assertThat(httpClient.send(missingCsrf, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);

        HttpRequest wrongCsrf = authenticatedRequest("/api/ai/travel-assistant")
                .header("X-XSRF-TOKEN", "wrong-token")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"message\":\"Hello\"}"))
                .build();
        assertThat(httpClient.send(wrongCsrf, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);
    }

    @Test
    void validatesTheMessageAtTheApiBoundary() throws Exception {
        HttpRequest request = csrf(authenticatedRequest("/api/ai/travel-assistant"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"message\":\"   \"}"))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(objectMapper.readTree(response.body()).path("code").asText()).isEqualTo("VALIDATION_FAILED");
    }

    @Test
    void providerUnavailableIsMappedWithoutLeakingInternalDetails() throws Exception {
        HttpResponse<String> response = post("unavailable provider");

        assertThat(response.statusCode()).isEqualTo(503);
        JsonNode problem = objectMapper.readTree(response.body());
        assertThat(problem.path("code").asText()).isEqualTo("AI_UNAVAILABLE");
        assertThat(problem.path("detail").asText())
                .isEqualTo("Travel Assistant is temporarily unavailable.")
                .doesNotContain("provider-secret");
    }

    @Test
    void toolCallLimitIsMappedToAControlledError() throws Exception {
        HttpResponse<String> response = post("tool-limit");

        assertThat(response.statusCode()).isEqualTo(503);
        JsonNode problem = objectMapper.readTree(response.body());
        assertThat(problem.path("code").asText()).isEqualTo("AI_TOOL_CALL_LIMIT");
        assertThat(problem.path("detail").asText()).doesNotContain("13", "test-call");
    }

    @Test
    void journeyToolIsolatesAliceAndBobWithoutAModelControlledUserId() throws Exception {
        BrowserSession alice = new BrowserSession();
        BrowserSession bob = new BrowserSession();
        alice.register("alice-ai-" + UUID.randomUUID() + "@example.com", "Alice");
        bob.register("bob-ai-" + UUID.randomUUID() + "@example.com", "Bob");
        String aliceTripId = objectMapper.readTree(
                alice.post("/api/trips", "{\"name\":\"Alice Alps\"}").body()).path("id").asText();
        String bobTripId = objectMapper.readTree(
                bob.post("/api/trips", "{\"name\":\"Bob Baltic\"}").body()).path("id").asText();
        alice.post(
                "/api/trips/" + aliceTripId + "/stops",
                "{\"countryCode\":\"IT\",\"cityName\":\"Rome\",\"latitude\":41.9028,\"longitude\":12.4964}");
        alice.post(
                "/api/trips/" + aliceTripId + "/stops",
                "{\"countryCode\":\"IT\",\"cityName\":\"Milan\",\"latitude\":45.4642,\"longitude\":9.1900}");
        bob.post(
                "/api/trips/" + bobTripId + "/stops",
                "{\"countryCode\":\"IT\",\"cityName\":\"Rome\",\"latitude\":41.9028,\"longitude\":12.4964}");
        bob.post(
                "/api/trips/" + bobTripId + "/stops",
                "{\"countryCode\":\"JP\",\"cityName\":\"Tokyo\",\"latitude\":35.6762,\"longitude\":139.6503}");

        JsonNode aliceAnswer = objectMapper.readTree(
                alice.post("/api/ai/travel-assistant", "{\"message\":\"journeys: mine\"}").body());
        JsonNode bobAnswer = objectMapper.readTree(
                bob.post("/api/ai/travel-assistant", "{\"message\":\"journeys: mine\"}").body());

        assertThat(aliceAnswer.path("answer").asText())
                .contains("Alice Alps", "Rome", "Milan", "Italy")
                .doesNotContain("Bob Baltic", "Tokyo");
        assertThat(bobAnswer.path("answer").asText())
                .contains("Bob Baltic", "Rome", "Tokyo", "Japan")
                .doesNotContain("Alice Alps", "Milan");
        assertThat(aliceAnswer.path("toolsUsed")).extracting(JsonNode::asText).containsExactly("get_journeys");
        assertThat(bobAnswer.path("toolsUsed")).extracting(JsonNode::asText).containsExactly("get_journeys");
    }

    private HttpResponse<String> post(String message) throws Exception {
        HttpRequest request = csrf(authenticatedRequest("/api/ai/travel-assistant"))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                        "{\"message\":" + objectMapper.writeValueAsString(message) + "}"))
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FakeAiConfiguration {
        @Bean
        @Primary
        ContextAwareFakeModel testAiModelClient() {
            return new ContextAwareFakeModel();
        }
    }

    static final class ContextAwareFakeModel implements AiModelClient {
        private volatile AiModelRequest lastRequest;

        @Override
        public synchronized AiModelResponse chat(AiModelRequest request) {
            lastRequest = request;
            String prompt = request.messages().stream()
                    .filter(message -> message.role() == AiMessage.Role.USER)
                    .findFirst()
                    .map(AiMessage::content)
                    .orElse("");
            if (prompt.startsWith("unavailable")) {
                throw new AiProviderException(
                        AiProviderException.Reason.UNAVAILABLE,
                        "provider-secret should never reach the API");
            }
            if (prompt.startsWith("tool-limit")) {
                return AiModelResponse.toolCalls(IntStream.rangeClosed(1, 13)
                        .mapToObj(index -> new AiToolCall(
                                "test-call-" + index,
                                "get_travel_profile",
                                "{}"))
                        .toArray(AiToolCall[]::new));
            }
            return request.messages().stream()
                    .filter(message -> message.role() == AiMessage.Role.TOOL)
                    .reduce((left, right) -> right)
                    .map(message -> AiModelResponse.finalAnswer("WanderMap context: " + message.content()))
                    .orElseGet(() -> AiModelResponse.toolCalls(new AiToolCall(
                            "test-call",
                            prompt.startsWith("profile") ? "get_travel_profile" : "get_journeys",
                            "{}")));
        }

        AiModelRequest lastRequest() {
            return lastRequest;
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
