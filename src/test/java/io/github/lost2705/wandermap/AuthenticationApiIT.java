package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class AuthenticationApiIT extends PostgresIntegrationTestSupport {

    @LocalServerPort
    private int port;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtEncoder jwtEncoder;

    @Test
    void registersRestoresAndEndsAnHttpOnlyCookieSession() throws Exception {
        Session session = new Session();
        String email = "Atlas." + UUID.randomUUID() + "@Example.COM";

        HttpResponse<String> registration = session.request(
                "POST",
                "/api/auth/register",
                """
                {"email":"%s","password":"a safe password","displayName":"Alice Atlas"}
                """.formatted(email));

        assertThat(registration.statusCode()).isEqualTo(201);
        JsonNode registered = json(registration);
        assertThat(registered.path("email").asText()).isEqualTo(email.strip().toLowerCase());
        assertThat(registered.path("displayName").asText()).isEqualTo("Alice Atlas");
        assertThat(registration.body()).doesNotContain("password", "passwordHash", "a safe password");
        assertThat(registration.headers().allValues("Set-Cookie"))
                .anySatisfy(cookie -> assertThat(cookie)
                        .contains("WANDERMAP_SESSION=", "HttpOnly", "SameSite=Strict", "Path=/api"));

        HttpResponse<String> me = session.request("GET", "/api/me", null);
        assertThat(me.statusCode()).isEqualTo(200);
        assertThat(json(me).path("id").asText()).isEqualTo(registered.path("id").asText());

        assertThat(session.request("POST", "/api/auth/logout", null).statusCode()).isEqualTo(204);
        assertThat(session.request("GET", "/api/me", null).statusCode()).isEqualTo(401);
    }

    @Test
    void enforcesRegistrationAndLoginSemanticsWithoutDisclosingPasswords() throws Exception {
        String email = "login-" + UUID.randomUUID() + "@example.com";
        Session registrationSession = new Session();
        assertThat(registrationSession.register(email, "Alice").statusCode()).isEqualTo(201);

        Session duplicateSession = new Session();
        assertProblem(duplicateSession.register(email.toUpperCase(), "Duplicate"), 409, "EMAIL_ALREADY_EXISTS");
        assertProblem(
                duplicateSession.request(
                        "POST",
                        "/api/auth/register",
                        "{\"email\":\"not-an-email\",\"password\":\"short\",\"displayName\":\" \"}"),
                400,
                "VALIDATION_FAILED");
        HttpResponse<String> oversizedPassword = duplicateSession.request(
                "POST",
                "/api/auth/register",
                "{\"email\":\"oversized-" + UUID.randomUUID() + "@example.com\",\"password\":\""
                        + "a".repeat(73) + "\",\"displayName\":\"Oversized\"}");
        assertProblem(oversizedPassword, 400, "INVALID_REQUEST");
        assertThat(json(oversizedPassword).path("detail").asText()).contains("72 UTF-8 bytes");

        Session validLogin = new Session();
        HttpResponse<String> login = validLogin.request(
                "POST",
                "/api/auth/login",
                "{\"email\":\"" + email.toUpperCase() + "\",\"password\":\"correct horse\"}");
        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(login.body()).doesNotContain("password", "passwordHash", "correct horse");
        assertThat(validLogin.request("GET", "/api/me", null).statusCode()).isEqualTo(200);

        Session wrongPassword = new Session();
        assertProblem(
                wrongPassword.request(
                        "POST",
                        "/api/auth/login",
                        "{\"email\":\"" + email + "\",\"password\":\"wrong password\"}"),
                401,
                "INVALID_CREDENTIALS");
        Session unknownUser = new Session();
        assertProblem(
                unknownUser.request(
                        "POST",
                        "/api/auth/login",
                        "{\"email\":\"unknown-" + UUID.randomUUID()
                                + "@example.com\",\"password\":\"wrong password\"}"),
                401,
                "INVALID_CREDENTIALS");
    }

    @Test
    void rejectsAnonymousPersonalApiRequests() throws Exception {
        Session anonymous = new Session();

        assertProblem(anonymous.request("GET", "/api/me", null), 401, "AUTH_REQUIRED");
        assertProblem(anonymous.request("GET", "/api/trips", null), 401, "AUTH_REQUIRED");
        assertProblem(anonymous.request("GET", "/api/trips/map-overview", null), 401, "AUTH_REQUIRED");
        assertProblem(anonymous.request("GET", "/api/travel-profile", null), 401, "AUTH_REQUIRED");
        assertProblem(anonymous.request("GET", "/api/bucket-list", null), 401, "AUTH_REQUIRED");
        assertProblem(anonymous.request("GET", "/api/countries", null), 401, "AUTH_REQUIRED");
        assertThat(anonymous.request("GET", "/api/auth/csrf", null).statusCode()).isEqualTo(200);
    }

    @Test
    void staleSessionCookieCannotBlockPublicLoginHealthOrSessionReplacement() throws Exception {
        String email = "stale-session-" + UUID.randomUUID() + "@example.com";
        Session account = new Session();
        assertThat(account.register(email, "Alice").statusCode()).isEqualTo(201);

        Session staleSession = new Session();
        staleSession.replaceSessionCookie("invalid-after-a-development-restart");
        assertThat(staleSession.request("GET", "/api/health", null).statusCode()).isEqualTo(200);
        assertThat(staleSession.request("GET", "/api/auth/csrf", null).statusCode()).isEqualTo(200);

        HttpResponse<String> login = staleSession.request(
                "POST",
                "/api/auth/login",
                "{\"email\":\"" + email + "\",\"password\":\"correct horse\"}");
        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(login.headers().allValues("Set-Cookie"))
                .anySatisfy(cookie -> assertThat(cookie)
                        .contains("WANDERMAP_SESSION=", "HttpOnly", "Path=/api"));
    }

    @Test
    void rejectsMissingAndIncorrectCsrfTokensForAuthenticatedUnsafeRequests() throws Exception {
        Session session = new Session();
        assertThat(session.register("csrf-" + UUID.randomUUID() + "@example.com", "Alice").statusCode())
                .isEqualTo(201);
        String body = "{\"name\":\"Protected journey\"}";

        assertThat(session.requestWithoutCsrf("POST", "/api/trips", body).statusCode()).isEqualTo(403);
        assertThat(session.requestWithCsrf("POST", "/api/trips", body, "wrong-token").statusCode())
                .isEqualTo(403);
    }

    @Test
    void rejectsMalformedTamperedAndExpiredSessionTokensThroughTheSecurityFilter() throws Exception {
        Session malformed = new Session();
        malformed.replaceSessionCookie("not-a-jwt");
        assertProblem(malformed.request("GET", "/api/me", null), 401, "AUTH_REQUIRED");

        Session tampered = new Session();
        JsonNode registered = json(tampered.register(
                "tampered-" + UUID.randomUUID() + "@example.com", "Alice"));
        tampered.replaceSessionCookie(tamperSignature(tampered.sessionCookie()));
        assertProblem(tampered.request("GET", "/api/me", null), 401, "AUTH_REQUIRED");

        Instant now = Instant.now();
        String expiredToken = jwtEncoder.encode(JwtEncoderParameters.from(
                        JwsHeader.with(MacAlgorithm.HS256).build(),
                        JwtClaimsSet.builder()
                                .issuer("wandermap")
                                .subject(registered.path("id").asText())
                                .issuedAt(now.minusSeconds(600))
                                .expiresAt(now.minusSeconds(300))
                                .build()))
                .getTokenValue();
        Session expired = new Session();
        expired.replaceSessionCookie(expiredToken);
        assertProblem(expired.request("GET", "/api/me", null), 401, "AUTH_REQUIRED");
    }

    @Test
    void isolatesJourneysStopsPhotosProfilesMapsBucketsAndPlaceMemories() throws Exception {
        Session alice = new Session();
        Session bob = new Session();
        alice.register("alice-" + UUID.randomUUID() + "@example.com", "Alice");
        bob.register("bob-" + UUID.randomUUID() + "@example.com", "Bob");

        JsonNode aliceTrip = json(alice.request(
                "POST", "/api/trips", "{\"name\":\"Alice Rome\",\"startDate\":\"2026-04-01\"}"));
        String aliceTripId = aliceTrip.path("id").asText();
        JsonNode aliceRome = json(alice.request(
                "POST",
                "/api/trips/" + aliceTripId + "/stops",
                """
                {"countryCode":"IT","cityName":"Rome","latitude":41.9028,"longitude":12.4964,
                 "note":"Alice memory"}
                """));
        String aliceStopId = aliceRome.path("id").asText();
        JsonNode alicePhoto = json(alice.uploadPhoto(aliceTripId, aliceStopId));

        JsonNode bobTrip = json(bob.request(
                "POST", "/api/trips", "{\"name\":\"Bob Tokyo\",\"startDate\":\"2026-05-01\"}"));
        String bobTripId = bobTrip.path("id").asText();
        JsonNode bobTokyo = json(bob.request(
                "POST",
                "/api/trips/" + bobTripId + "/stops",
                """
                {"countryCode":"JP","cityName":"Tokyo","latitude":35.6762,"longitude":139.6503,
                 "note":"Bob memory"}
                """));
        String bobStopId = bobTokyo.path("id").asText();
        JsonNode bobPhoto = json(bob.uploadPhoto(bobTripId, bobStopId));

        JsonNode bobRomeTrip = json(bob.request("POST", "/api/trips", "{\"name\":\"Bob Rome\"}"));
        JsonNode bobRome = json(bob.request(
                "POST",
                "/api/trips/" + bobRomeTrip.path("id").asText() + "/stops",
                """
                {"countryCode":"IT","cityName":"Rome","latitude":41.9028,"longitude":12.4964,
                 "note":"Bob private Rome memory"}
                """));
        assertThat(bobRome.path("city").path("id").asText())
                .isEqualTo(aliceRome.path("city").path("id").asText());

        JsonNode aliceTrips = json(alice.request("GET", "/api/trips", null));
        assertThat(aliceTrips).hasSize(1);
        assertThat(aliceTrips.get(0).path("name").asText()).isEqualTo("Alice Rome");
        JsonNode bobTrips = json(bob.request("GET", "/api/trips", null));
        assertThat(bobTrips).hasSize(2);
        assertThat(bobTrips.toString()).doesNotContain("Alice Rome", "Alice memory");

        assertProblem(alice.request("GET", "/api/trips/" + bobTripId, null), 404, "TRIP_NOT_FOUND");
        assertProblem(
                alice.request("PATCH", "/api/trips/" + bobTripId, "{\"name\":\"Taken over\"}"),
                404,
                "TRIP_NOT_FOUND");
        assertProblem(alice.request("DELETE", "/api/trips/" + bobTripId, null), 404, "TRIP_NOT_FOUND");
        assertProblem(
                alice.request(
                        "PATCH",
                        "/api/trips/" + bobTripId + "/stops/" + bobStopId,
                        "{\"position\":1}"),
                404,
                "TRIP_NOT_FOUND");
        assertProblem(
                alice.request(
                        "GET",
                        "/api/trips/" + bobTripId + "/stops/" + bobStopId + "/photos/"
                                + bobPhoto.path("id").asText() + "/content",
                        null),
                404,
                "TRIP_NOT_FOUND");
        assertProblem(
                alice.request(
                        "DELETE",
                        "/api/trips/" + bobTripId + "/stops/" + bobStopId + "/photos/"
                                + bobPhoto.path("id").asText(),
                        null),
                404,
                "TRIP_NOT_FOUND");

        JsonNode aliceProfile = json(alice.request("GET", "/api/travel-profile", null));
        assertThat(aliceProfile.path("journeyCount").asInt()).isEqualTo(1);
        assertThat(aliceProfile.path("visitCount").asInt()).isEqualTo(1);
        assertThat(aliceProfile.path("memoryCount").asInt()).isEqualTo(1);
        assertThat(aliceProfile.path("photoCount").asInt()).isEqualTo(1);
        JsonNode aliceOverview = json(alice.request("GET", "/api/trips/map-overview", null));
        assertThat(aliceOverview.path("visitedCountryCodes").toString()).contains("IT").doesNotContain("JP");
        assertThat(aliceOverview.path("markers").toString()).contains("Rome").doesNotContain("Tokyo");

        JsonNode aliceBucket = json(alice.request(
                "POST",
                "/api/bucket-list",
                "{\"countryCode\":\"IT\",\"cityName\":\"Rome\",\"latitude\":41.9028,\"longitude\":12.4964}"));
        JsonNode bobBucket = json(bob.request(
                "POST",
                "/api/bucket-list",
                "{\"countryCode\":\"IT\",\"cityName\":\"Rome\",\"latitude\":41.9028,\"longitude\":12.4964}"));
        assertThat(aliceBucket.path("city").path("id")).isEqualTo(bobBucket.path("city").path("id"));
        assertThat(json(alice.request("GET", "/api/bucket-list", null))).hasSize(1);
        assertThat(json(bob.request("GET", "/api/bucket-list", null))).hasSize(1);
        assertProblem(
                alice.request("DELETE", "/api/bucket-list/" + bobBucket.path("id").asText(), null),
                404,
                "BUCKET_LIST_ITEM_NOT_FOUND");

        JsonNode alicePlace = json(alice.request(
                "GET", "/api/places/" + aliceRome.path("city").path("id").asText(), null));
        assertThat(alicePlace.path("visitCount").asInt()).isEqualTo(1);
        assertThat(alicePlace.path("visits").toString())
                .contains("Alice Rome", "Alice memory")
                .doesNotContain("Bob Rome", "Bob private Rome memory");
        assertProblem(
                alice.request("GET", "/api/places/" + bobTokyo.path("city").path("id").asText(), null),
                404,
                "PLACE_NOT_FOUND");

        HttpResponse<String> photoContent = alice.request(
                "GET",
                "/api/trips/" + aliceTripId + "/stops/" + aliceStopId + "/photos/"
                        + alicePhoto.path("id").asText() + "/content",
                null);
        assertThat(photoContent.statusCode()).isEqualTo(200);
        assertThat(photoContent.headers().firstValue("Cache-Control")).hasValueSatisfying(cacheControl ->
                assertThat(cacheControl).contains("no-store").doesNotContain("max-age", "public"));
    }

    @Test
    void scopesProfileHighlightsAndAchievementsWhenUsersShareACanonicalCity() throws Exception {
        Session alice = new Session();
        Session bob = new Session();
        alice.register("alice-profile-" + UUID.randomUUID() + "@example.com", "Alice");
        bob.register("bob-profile-" + UUID.randomUUID() + "@example.com", "Bob");

        String aliceTripId = json(alice.request(
                "POST", "/api/trips", "{\"name\":\"Alice in Rome\",\"startDate\":\"2026-04-01\"}"))
                .path("id").asText();
        String bobTripId = json(bob.request(
                "POST", "/api/trips", "{\"name\":\"Bob in Rome\",\"startDate\":\"2026-05-01\"}"))
                .path("id").asText();
        String requestBody = """
                {"countryCode":"IT","cityName":"Rome","latitude":41.9028,"longitude":12.4964}
                """;
        String sharedCityId = null;
        for (int visit = 0; visit < 2; visit++) {
            JsonNode stop = json(alice.request("POST", "/api/trips/" + aliceTripId + "/stops", requestBody));
            sharedCityId = stop.path("city").path("id").asText();
        }
        for (int visit = 0; visit < 5; visit++) {
            JsonNode stop = json(bob.request("POST", "/api/trips/" + bobTripId + "/stops", requestBody));
            assertThat(stop.path("city").path("id").asText()).isEqualTo(sharedCityId);
        }

        JsonNode aliceProfile = json(alice.request("GET", "/api/travel-profile", null));
        JsonNode bobProfile = json(bob.request("GET", "/api/travel-profile", null));

        assertThat(aliceProfile.path("visitCount").asInt()).isEqualTo(2);
        assertThat(aliceProfile.path("revisitedCityCount").asInt()).isEqualTo(1);
        assertThat(aliceProfile.path("highlights").path("mostVisitedCity").path("cityId").asText())
                .isEqualTo(sharedCityId);
        assertThat(aliceProfile.path("highlights").path("mostVisitedCity").path("visitCount").asInt())
                .isEqualTo(2);
        assertThat(aliceProfile.path("highlights").path("mostVisitedCountry").path("visitCount").asInt())
                .isEqualTo(2);
        assertThat(achievement(aliceProfile, "JOURNEY_KEEPER").path("currentValue").asInt()).isEqualTo(1);
        assertThat(achievement(aliceProfile, "JOURNEY_KEEPER").path("progressPercent").asInt()).isEqualTo(20);
        assertThat(achievement(aliceProfile, "FIRST_JOURNEY").path("unlocked").asBoolean()).isTrue();
        assertThat(achievement(aliceProfile, "CITY_HOPPER").path("currentValue").asInt()).isEqualTo(1);
        assertThat(bobProfile.path("visitCount").asInt()).isEqualTo(5);
        assertThat(bobProfile.path("highlights").path("mostVisitedCity").path("visitCount").asInt())
                .isEqualTo(5);
    }

    private JsonNode json(HttpResponse<String> response) throws Exception {
        return objectMapper.readTree(response.body());
    }

    private void assertProblem(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(json(response).path("code").asText()).isEqualTo(code);
    }

    private static JsonNode achievement(JsonNode profile, String code) {
        for (JsonNode achievement : profile.path("achievements")) {
            if (code.equals(achievement.path("code").asText())) {
                return achievement;
            }
        }
        throw new AssertionError("Missing achievement " + code);
    }

    private final class Session {
        private final HttpClient client;
        private final CookieManager cookieManager;
        private String csrfHeaderName;
        private String csrfToken;

        private Session() throws Exception {
            cookieManager = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
            client = HttpClient.newBuilder().cookieHandler(cookieManager).build();
            refreshCsrf();
        }

        private void refreshCsrf() throws Exception {
            HttpResponse<String> response = client.send(
                    HttpRequest.newBuilder(uri("/api/auth/csrf")).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            JsonNode csrf = json(response);
            csrfHeaderName = csrf.path("headerName").asText();
            csrfToken = cookieManager.getCookieStore().getCookies().stream()
                    .filter(cookie -> "XSRF-TOKEN".equals(cookie.getName()))
                    .findFirst()
                    .map(HttpCookie::getValue)
                    .orElseThrow(() -> new AssertionError("CSRF cookie was not issued"));
        }

        private HttpResponse<String> register(String email, String displayName) throws Exception {
            return request(
                    "POST",
                    "/api/auth/register",
                    "{\"email\":\"" + email + "\",\"password\":\"correct horse\",\"displayName\":\""
                            + displayName + "\"}");
        }

        private void replaceSessionCookie(String value) {
            cookieManager.getCookieStore().getCookies().stream()
                    .filter(cookie -> "WANDERMAP_SESSION".equals(cookie.getName()))
                    .toList()
                    .forEach(cookie -> cookieManager.getCookieStore().remove(uri("/api"), cookie));
            HttpCookie cookie = new HttpCookie("WANDERMAP_SESSION", value);
            cookie.setPath("/api");
            cookieManager.getCookieStore().add(uri("/api"), cookie);
        }

        private String sessionCookie() {
            return cookieManager.getCookieStore().getCookies().stream()
                    .filter(cookie -> "WANDERMAP_SESSION".equals(cookie.getName()))
                    .findFirst()
                    .map(HttpCookie::getValue)
                    .orElseThrow(() -> new AssertionError("Session cookie was not issued"));
        }

        private HttpResponse<String> request(String method, String path, String body) throws Exception {
            if (requiresCsrf(method)) {
                refreshCsrf();
            }
            return requestWithCsrf(method, path, body, csrfToken);
        }

        private HttpResponse<String> requestWithoutCsrf(String method, String path, String body) throws Exception {
            return requestWithCsrf(method, path, body, null);
        }

        private HttpResponse<String> requestWithCsrf(String method, String path, String body, String token)
                throws Exception {
            HttpRequest.Builder builder = HttpRequest.newBuilder(uri(path));
            if (token != null && !"GET".equals(method) && !"HEAD".equals(method) && !"OPTIONS".equals(method)) {
                builder.header(csrfHeaderName, token);
            }
            if (body == null) {
                builder.method(method, HttpRequest.BodyPublishers.noBody());
            } else {
                builder.header("Content-Type", "application/json")
                        .method(method, HttpRequest.BodyPublishers.ofString(body));
            }
            return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        }

        private HttpResponse<String> uploadPhoto(String tripId, String stopId) throws Exception {
            refreshCsrf();
            String boundary = "WanderMapBoundary" + UUID.randomUUID();
            ByteArrayOutputStream body = new ByteArrayOutputStream();
            body.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
            body.write("Content-Disposition: form-data; name=\"file\"; filename=\"memory.jpg\"\r\n"
                    .getBytes(StandardCharsets.UTF_8));
            body.write("Content-Type: image/jpeg\r\n\r\n".getBytes(StandardCharsets.UTF_8));
            ByteArrayOutputStream image = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), "jpg", image);
            body.write(image.toByteArray());
            body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

            HttpRequest request = HttpRequest.newBuilder(uri(
                            "/api/trips/" + tripId + "/stops/" + stopId + "/photos"))
                    .header(csrfHeaderName, csrfToken)
                    .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                    .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                    .build();
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }

    private URI uri(String path) {
        return URI.create("http://localhost:" + port + path);
    }

    private static String tamperSignature(String token) {
        int signatureStart = token.lastIndexOf('.') + 1;
        char current = token.charAt(signatureStart);
        char replacement = current == 'A' ? 'B' : 'A';
        return token.substring(0, signatureStart) + replacement + token.substring(signatureStart + 1);
    }

    private static boolean requiresCsrf(String method) {
        return !"GET".equals(method) && !"HEAD".equals(method) && !"OPTIONS".equals(method);
    }
}
