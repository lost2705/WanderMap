package io.github.lost2705.wandermap.travel.infrastructure.boundary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.sun.net.httpserver.HttpServer;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryClient;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryLookupException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class NominatimBoundaryClientTest {
    private final CityBoundaryClient.Query query = new CityBoundaryClient.Query("Rome", "IT", BigDecimal.ONE, BigDecimal.TWO);
    private final NominatimBoundaryClient parser = new NominatimBoundaryClient(false, "", "");

    @Test
    void disabledNeedsNoEndpointOrUserAgentAndNeverDispatches() {
        assertThat(parser.findCandidates(query)).isEmpty();
        assertThat(org.springframework.test.util.ReflectionTestUtils.getField(parser, "http")).isNull();
        assertThat(org.springframework.test.util.ReflectionTestUtils.getField(parser, "endpoint")).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "https://nominatim.openstreetmap.org", "https://nominatim.openstreetmap.org/",
            "https://nominatim.openstreetmap.org.", "https://NOMINATIM.OPENSTREETMAP.ORG.:443/search",
            "http://nominatim.openstreetmap.org", "https://nominatim.openstreetmap.org:8443/search",
            "https://nominatim.openstreetmap.org/search?format=jsonv2", "https://user@nominatim.openstreetmap.org",
            "https://sub.nominatim.openstreetmap.org./", "https://nominatim.openstreetmap.org@localhost",
            "file:///etc/passwd", "https://user:password@example.com", "https://example.com?url=secret", "http://example.com"})
    void enabledRequiresAnExplicitSafeNonPublicEndpoint(String url) {
        assertThatThrownBy(() -> new NominatimBoundaryClient(true, url, "WanderMap operator@example.com"))
                .isInstanceOf(IllegalArgumentException.class).hasMessageNotContaining(url.isEmpty() ? "secret" : url);
    }

    @Test
    void requiresIdentifyingUserAgentWhenEnabled() {
        assertThatThrownBy(() -> new NominatimBoundaryClient(true, "https://example.com", ""))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void parsesDocumentedPolygonAndMultiPolygonIntoProviderNeutralCandidates() {
        var result = parser.parse(bytes(candidate("Polygon", "[[[12,41],[13,41],[13,42],[12,41]]]")));
        assertThat(result).hasSize(1);
        assertThat(result.getFirst().boundaryId()).isEqualTo("relation/123");
        assertThat(result.getFirst().names()).containsExactlyInAnyOrder("Roma", "Rome");
        assertThat(result.getFirst().kind()).isEqualTo(CityBoundaryClient.Kind.CITY);
        assertThat(result.getFirst().searchRank()).isEqualTo(16);
        assertThat(result.getFirst().adminLevel()).isEqualTo(8);
        assertThat(parser.parse(bytes(candidate("MultiPolygon", "[[[[12,41],[13,41],[13,42],[12,41]]]]"))))
                .hasSize(1);
    }

    @Test
    void keepsSemanticMetadataForCountryPolicyButRejectsNonAdministrativeOrUnsupportedGeometry() {
        String valid = candidate("Polygon", "[[[12,41],[13,41],[13,42],[12,41]]]");
        assertThat(parser.parse(bytes(valid.replace("\"city\"", "\"state\""))).getFirst().kind())
                .isEqualTo(CityBoundaryClient.Kind.OTHER);
        assertThat(parser.parse(bytes(valid.replace("\"place_rank\":16", "\"place_rank\":8"))).getFirst().searchRank())
                .isEqualTo(8);
        for (String payload : new String[] {valid.replace("\"8\"", "\"2\""),
                valid.replace("\"administrative\"", "\"political\""), valid.replace("\"relation\"", "\"way\""),
                valid.replace("\"Polygon\"", "\"Point\"")}) {
            assertThat(parser.parse(bytes(payload))).isEmpty();
        }
        assertThat(parser.parse(bytes("[]"))).isEmpty();
    }

    @Test
    void parsesRealParisCandidateClassificationsForApplicationResolution() {
        String commune = candidate("Polygon", "[[[2.2,48.8],[2.5,48.8],[2.5,48.9],[2.2,48.8]]]")
                .replace("\"city\"", "\"suburb\"").replace("\"place_rank\":16", "\"place_rank\":15")
                .replace("\"osm_id\":123", "\"osm_id\":7444").replace("Roma", "Paris").replace("Rome", "Paris")
                .replace("\"it\"", "\"fr\"");
        String department = commune.replace("\"suburb\"", "\"city\"")
                .replace("\"place_rank\":15", "\"place_rank\":12").replace("\"8\"", "\"6\"")
                .replace("\"osm_id\":7444", "\"osm_id\":71525");
        String arrondissement = commune.replace("\"suburb\"", "\"city_district\"")
                .replace("\"place_rank\":15", "\"place_rank\":14").replace("\"8\"", "\"7\"")
                .replace("\"osm_id\":7444", "\"osm_id\":1641193");

        var candidates = parser.parse(bytes("[" + stripArray(commune) + "," + stripArray(department) + ","
                + stripArray(arrondissement) + "]"));

        assertThat(candidates).extracting(CityBoundaryClient.Candidate::boundaryId)
                .containsExactly("relation/7444", "relation/71525", "relation/1641193");
        assertThat(candidates).extracting(CityBoundaryClient.Candidate::kind)
                .containsExactly(CityBoundaryClient.Kind.SUBDIVISION, CityBoundaryClient.Kind.CITY,
                        CityBoundaryClient.Kind.SUBDIVISION);
        assertThat(candidates).extracting(CityBoundaryClient.Candidate::searchRank).containsExactly(15, 12, 14);
        assertThat(candidates).extracting(CityBoundaryClient.Candidate::adminLevel).containsExactly(8, 6, 7);
    }

    @ParameterizedTest
    @ValueSource(strings = {"not JSON", "{}", "null", "[null]", "[{}]", "[[[[[[[[[[[[[[[[[[]]]]]]]]]]]]]]]]]]"})
    void rejectsMalformedResponsesWithoutRawDetails(String payload) {
        assertThatThrownBy(() -> parser.parse(bytes(payload))).isInstanceOf(CityBoundaryLookupException.class)
                .hasMessage("City boundary provider is temporarily unavailable").hasNoCause();
    }

    @Test
    void boundsPayloadAndMalformedCoordinateArrays() {
        assertThatThrownBy(() -> parser.parse(new byte[NominatimBoundaryClient.MAX_RESPONSE_BYTES + 1]))
                .isInstanceOf(CityBoundaryLookupException.class);
        assertThatThrownBy(() -> parser.parse(bytes(candidate("Polygon", "[[[12,41],[13,41]]]"))))
                .isInstanceOf(CityBoundaryLookupException.class);
    }

    @Test
    void requiresJsonv2CategoryAndDoesNotGuessFromATruncatedCandidatePage() {
        String valid = candidate("Polygon", "[[[12,41],[13,41],[13,42],[12,41]]]");
        assertThatThrownBy(() -> parser.parse(bytes(valid.replace("\"category\"", "\"class\""))))
                .isInstanceOf(CityBoundaryLookupException.class);
        assertThatThrownBy(() -> parser.parse(bytes("[" + String.join(",", java.util.Collections.nCopies(8, "{}")) + "]")))
                .isInstanceOf(CityBoundaryLookupException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"16.9", "\"16\"", "4294967312"})
    void doesNotCoerceMalformedLocalityRanksIntoMunicipalities(String rank) {
        String payload = candidate("Polygon", "[[[12,41],[13,41],[13,42],[12,41]]]")
                .replace("\"place_rank\":16", "\"place_rank\":" + rank);
        assertThatThrownBy(() -> parser.parse(bytes(payload))).isInstanceOf(CityBoundaryLookupException.class).hasNoCause();
    }

    @ParameterizedTest
    @ValueSource(ints = {429, 500, 503})
    void providerErrorsAreTemporaryAndDoNotExposeResponseBodies(int status) throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/search", exchange -> {
            exchange.sendResponseHeaders(status, 0);
            exchange.getResponseBody().write(bytes("private provider detail"));
            exchange.close();
        });
        server.start();
        try {
            assertThatThrownBy(() -> client(server, Duration.ofSeconds(2)).findCandidates(query))
                    .isInstanceOf(CityBoundaryLookupException.class)
                    .hasMessage("City boundary provider is temporarily unavailable").hasNoCause();
        } finally { server.stop(0); }
    }

    @Test
    void backendRequestIsBoundedIdentifiedEncodedAndRedirectsAreNotFollowed() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        AtomicInteger calls = new AtomicInteger();
        server.createContext("/search", exchange -> {
            calls.incrementAndGet();
            assertThat(exchange.getRequestHeaders().getFirst("User-Agent")).contains("operator@example.com");
            assertThat(exchange.getRequestURI().getRawQuery()).contains("city=Rome", "countrycodes=it", "polygon_geojson=1");
            exchange.getResponseHeaders().set("Location", "http://127.0.0.1:" + server.getAddress().getPort() + "/redirected");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.createContext("/redirected", exchange -> { calls.incrementAndGet(); exchange.close(); });
        server.start();
        try {
            var client = client(server, Duration.ofSeconds(2));
            assertThatThrownBy(() -> client.findCandidates(query)).isInstanceOf(CityBoundaryLookupException.class).hasNoCause();
            assertThatThrownBy(() -> client.findCandidates(query)).isInstanceOf(CityBoundaryLookupException.class);
            assertThat(calls.get()).isEqualTo(1);
        } finally { server.stop(0); }
    }

    @Test
    void enforcesAnAbsoluteTimeoutIncludingASlowResponseBody() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/search", exchange -> {
            exchange.sendResponseHeaders(200, 0);
            exchange.getResponseBody().write('[');
            exchange.getResponseBody().flush();
            // Keep the body incomplete; client must cancel without waiting for EOF.
        });
        server.start();
        try {
            long start = System.nanoTime();
            assertThatThrownBy(() -> client(server, Duration.ofMillis(150)).findCandidates(query))
                    .isInstanceOf(CityBoundaryLookupException.class).hasNoCause();
            assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
        } finally { server.stop(0); }
    }

    @Test
    void rejectsAnOversizedStreamAndProviderOutage() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/search", exchange -> {
            byte[] body = new byte[NominatimBoundaryClient.MAX_RESPONSE_BYTES + 1];
            exchange.sendResponseHeaders(200, 0); // Chunked: no Content-Length shortcut.
            try { exchange.getResponseBody().write(body); } finally { exchange.close(); }
        });
        server.start();
        var client = client(server, Duration.ofSeconds(3));
        try {
            assertThatThrownBy(() -> client.findCandidates(query)).isInstanceOf(CityBoundaryLookupException.class);
        } finally { server.stop(0); }
        assertThatThrownBy(() -> client(server, Duration.ofMillis(300)).findCandidates(query))
                .isInstanceOf(CityBoundaryLookupException.class);
    }

    @Test
    void rejectsOversizedContentLengthBeforeWaitingForTheBody() throws Exception {
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/search", exchange -> {
            exchange.sendResponseHeaders(200, NominatimBoundaryClient.MAX_RESPONSE_BYTES + 1L);
            exchange.getResponseBody().flush(); // No body or EOF: headers alone must reject.
        });
        server.start();
        try (var executor = java.util.concurrent.Executors.newSingleThreadExecutor()) {
            var outcome = executor.submit(() -> assertThatThrownBy(() -> client(server, Duration.ofSeconds(10)).findCandidates(query))
                    .isInstanceOf(CityBoundaryLookupException.class).hasNoCause());
            try { outcome.get(3, java.util.concurrent.TimeUnit.SECONDS); }
            finally { outcome.cancel(true); }
        } finally { server.stop(0); }
    }

    private static NominatimBoundaryClient client(HttpServer server, Duration timeout) {
        return new NominatimBoundaryClient(true, "http://127.0.0.1:" + server.getAddress().getPort(), "WanderMap operator@example.com", timeout);
    }
    private static byte[] bytes(String value) { return value.getBytes(StandardCharsets.UTF_8); }
    private static String stripArray(String value) { return value.trim().substring(1, value.trim().length() - 1); }
    private static String candidate(String type, String coordinates) {
        return """
                [{"category":"boundary","type":"administrative","addresstype":"city","place_rank":16,
                  "osm_type":"relation","osm_id":123,"name":"Roma","address":{"country_code":"it"},
                  "extratags":{"admin_level":"8"},"namedetails":{"name:en":"Rome"},
                  "geojson":{"type":"%s","coordinates":%s}}]
                """.formatted(type, coordinates);
    }
}
