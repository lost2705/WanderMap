package io.github.lost2705.wandermap;

import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.identity.persistence.UserAccountRepository;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.web.server.LocalServerPort;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

abstract class AuthenticatedIntegrationTestSupport extends PostgresIntegrationTestSupport {

    @LocalServerPort
    protected int port;

    @Autowired
    protected ObjectMapper objectMapper;

    @Autowired
    private UserAccountRepository userRepository;

    protected HttpClient httpClient;
    protected UserAccount currentUser;

    private CookieManager cookieManager;
    private String csrfHeaderName;

    @BeforeEach
    void authenticateTestUser() throws Exception {
        cookieManager = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        httpClient = HttpClient.newBuilder().cookieHandler(cookieManager).build();

        HttpResponse<String> csrfResponse = httpClient.send(
                HttpRequest.newBuilder(uri("/api/auth/csrf")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        if (csrfResponse.statusCode() != 200) {
            throw new AssertionError("Could not initialize CSRF protection: " + csrfResponse.body());
        }
        JsonNode csrf = objectMapper.readTree(csrfResponse.body());
        csrfHeaderName = csrf.path("headerName").asText();
        currentCsrfToken();

        String email = "integration-" + UUID.randomUUID() + "@example.com";
        HttpRequest registerRequest = csrf(HttpRequest.newBuilder(uri("/api/auth/register")))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(
                        """
                        {"email":"%s","password":"correct horse","displayName":"Integration Traveller"}
                        """.formatted(email)))
                .build();
        HttpResponse<String> registerResponse =
                httpClient.send(registerRequest, HttpResponse.BodyHandlers.ofString());
        if (registerResponse.statusCode() != 201) {
            throw new AssertionError("Could not register test user: " + registerResponse.body());
        }
        currentUser = userRepository.findByEmail(email).orElseThrow();
    }

    protected URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    protected HttpRequest.Builder authenticatedRequest(String path) {
        return HttpRequest.newBuilder(uri(path));
    }

    protected HttpRequest.Builder csrf(HttpRequest.Builder builder) {
        return builder.header(csrfHeaderName, currentCsrfToken());
    }

    private String currentCsrfToken() {
        return cookieManager.getCookieStore().getCookies().stream()
                .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                .findFirst()
                .map(HttpCookie::getValue)
                .orElseThrow(() -> new AssertionError("CSRF cookie was not issued"));
    }
}
