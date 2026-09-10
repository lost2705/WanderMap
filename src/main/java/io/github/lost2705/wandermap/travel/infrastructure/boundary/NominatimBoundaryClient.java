package io.github.lost2705.wandermap.travel.infrastructure.boundary;

import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryClient;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryGeometry;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryLookupException;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.ByteBuffer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Flow;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;
import tools.jackson.core.StreamReadConstraints;
import tools.jackson.core.json.JsonFactory;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Documented search API of an explicitly permitted Nominatim-compatible deployment. */
@Component
public class NominatimBoundaryClient implements CityBoundaryClient {
    static final int MAX_RESPONSE_BYTES = 3000000;
    private final boolean enabled;
    private final URI endpoint;
    private final String userAgent;
    private final HttpClient http;
    private final Duration timeout;
    private final AtomicLong nextRequest = new AtomicLong();
    private final JsonMapper mapper = JsonMapper.builder(JsonFactory.builder().streamReadConstraints(
            StreamReadConstraints.builder().maxNestingDepth(16).maxStringLength(4096).maxNumberLength(40).build()).build()).build();

    @Autowired
    public NominatimBoundaryClient(
            @Value("${wandermap.city-boundaries.external-enabled:false}") boolean enabled,
            @Value("${wandermap.city-boundaries.base-url:}") String baseUrl,
            @Value("${wandermap.city-boundaries.user-agent:}") String userAgent) {
        this(enabled, baseUrl, userAgent, Duration.ofSeconds(10));
    }

    NominatimBoundaryClient(boolean enabled, String baseUrl, String userAgent, Duration timeout) {
        this.enabled = enabled;
        this.endpoint = enabled ? validateEndpoint(baseUrl) : null;
        if (enabled && (userAgent.isBlank() || userAgent.length() > 200 || userAgent.contains("\n") || userAgent.contains("\r"))) {
            throw new IllegalArgumentException("An identifying city-boundary User-Agent is required");
        }
        this.userAgent = userAgent;
        this.timeout = timeout;
        this.http = enabled ? HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER).build() : null;
    }

    @Override
    public List<Candidate> findCandidates(Query query) {
        if (!enabled) {
            return List.of();
        }
        // No sleeping queue or retry storm. Conservative per-instance ceiling, including failures.
        long now = System.nanoTime();
        long next = nextRequest.get();
        if (now < next || !nextRequest.compareAndSet(next, now + TimeUnit.SECONDS.toNanos(15))) {
            throw new CityBoundaryLookupException();
        }
        URI uri = UriComponentsBuilder.fromUri(endpoint).path("/search")
                .queryParam("format", "jsonv2").queryParam("city", query.name())
                .queryParam("countrycodes", query.countryCode().toLowerCase(Locale.ROOT))
                .queryParam("addressdetails", "1").queryParam("extratags", "1").queryParam("namedetails", "1")
                .queryParam("polygon_geojson", "1").queryParam("dedupe", "0").queryParam("limit", "8")
                .queryParam("accept-language", "en").build().encode().toUri();
        var request = HttpRequest.newBuilder(uri).timeout(timeout).header("User-Agent", userAgent)
                .header("Accept", "application/json").GET().build();
        var subscriber = new LimitedBody();
        CompletableFuture<HttpResponse<byte[]>> pending = http.sendAsync(request, info -> {
            if (info.statusCode() != 200 || info.headers().firstValueAsLong("Content-Length").orElse(0) > MAX_RESPONSE_BYTES) {
                subscriber.reject();
            }
            return subscriber;
        });
        try {
            var response = pending.get(timeout.toMillis(), TimeUnit.MILLISECONDS);
            if (response.statusCode() != 200) {
                throw new CityBoundaryLookupException();
            }
            return parse(response.body());
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new CityBoundaryLookupException();
        } catch (Exception exception) {
            throw new CityBoundaryLookupException();
        } finally {
            subscriber.cancel();
            pending.cancel(true);
        }
    }

    List<Candidate> parse(byte[] payload) {
        try {
            if (payload.length > MAX_RESPONSE_BYTES) {
                throw new CityBoundaryLookupException();
            }
            JsonNode root = mapper.readTree(payload);
            // A full result page may hide another matching municipality: do not guess or paginate.
            if (root == null || !root.isArray() || root.size() >= 8) {
                throw new CityBoundaryLookupException();
            }
            List<Candidate> results = new ArrayList<>();
            for (var candidate : root) {
                if (!candidate.isObject() || !candidate.path("category").isString() || !candidate.path("type").isString()) {
                    throw new CityBoundaryLookupException();
                }
                JsonNode rankNode = candidate.path("place_rank");
                if (!rankNode.isIntegralNumber() || !rankNode.canConvertToInt()) {
                    throw new CityBoundaryLookupException();
                }
                int rank = rankNode.asInt();
                JsonNode addressTypeNode = candidate.path("addresstype");
                if (!addressTypeNode.isString() || addressTypeNode.asText().length() > 40 || rank < 0 || rank > 30) {
                    throw new CityBoundaryLookupException();
                }
                String addressType = addressTypeNode.asText();
                String admin = candidate.path("extratags").path("admin_level").asText();
                if (!"boundary".equals(candidate.path("category").asText())
                        || !"administrative".equals(candidate.path("type").asText())
                        || !admin.matches("[4-9]|10") || !"relation".equals(candidate.path("osm_type").asText())) {
                    continue;
                }
                String id = candidate.path("osm_id").asText();
                String country = candidate.path("address").path("country_code").asText();
                if (!id.matches("[1-9][0-9]{0,18}") || !country.matches("[a-zA-Z]{2}")) {
                    throw new CityBoundaryLookupException();
                }
                JsonNode geometry = candidate.path("geojson");
                if (!geometry.isObject() || !geometry.path("type").isString()) {
                    throw new CityBoundaryLookupException();
                }
                if (!Set.of("Polygon", "MultiPolygon").contains(geometry.path("type").asText())) {
                    continue;
                }
                Set<String> names = new HashSet<>();
                addName(names, candidate.path("name"));
                JsonNode namedetails = candidate.path("namedetails");
                if (namedetails.isObject()) {
                    for (var entry : namedetails.properties()) {
                        if (entry.getKey().equals("name") || entry.getKey().startsWith("name:")) {
                            addName(names, entry.getValue());
                        }
                    }
                }
                if (names.isEmpty()) {
                    throw new CityBoundaryLookupException();
                }
                results.add(new Candidate("openstreetmap", "relation/" + id, Set.copyOf(names), country,
                        kind(addressType), rank, Integer.parseInt(admin), CityBoundaryGeometry.fromJson(geometry)));
            }
            return List.copyOf(results);
        } catch (RuntimeException exception) {
            throw new CityBoundaryLookupException();
        }
    }

    private static Kind kind(String addressType) {
        return switch (addressType) {
            case "city" -> Kind.CITY;
            case "town" -> Kind.TOWN;
            case "village" -> Kind.VILLAGE;
            case "municipality" -> Kind.MUNICIPALITY;
            case "suburb", "city_district" -> Kind.SUBDIVISION;
            default -> Kind.OTHER;
        };
    }

    private static void addName(Set<String> names, JsonNode node) {
        if (node.isString() && !node.asText().isBlank() && node.asText().length() <= 160 && names.size() < 100) {
            names.add(node.asText());
        }
    }

    private static URI validateEndpoint(String baseUrl) {
        try {
            URI uri = URI.create(baseUrl);
            // DNS absolute names with a trailing root dot resolve to the same host.
            String host = uri.getHost() == null ? null : uri.getHost().toLowerCase(Locale.ROOT).replaceAll("\\.+$", "");
            boolean loopback = Set.of("localhost", "127.0.0.1", "[::1]").contains(host == null ? "" : host);
            if (host == null || !("https".equals(uri.getScheme()) || (loopback && "http".equals(uri.getScheme())))
                    || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || host.equalsIgnoreCase("nominatim.openstreetmap.org")
                    || host.toLowerCase(Locale.ROOT).endsWith(".nominatim.openstreetmap.org")) {
                throw new IllegalArgumentException();
            }
            return URI.create(baseUrl.replaceAll("/+$", ""));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("Configure a permitted city-boundary endpoint; public OSMF Nominatim is not supported");
        }
    }

    /** Cancel while streaming as soon as the bound is exceeded, not after allocating the full body. */
    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final CompletableFuture<byte[]> result = new CompletableFuture<>();
        private final ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        private volatile Flow.Subscription subscription;

        @Override public CompletionStage<byte[]> getBody() { return result; }
        @Override public void onSubscribe(Flow.Subscription subscription) {
            this.subscription = subscription;
            if (result.isDone()) subscription.cancel();
            else subscription.request(1);
        }
        @Override public void onNext(List<ByteBuffer> buffers) {
            for (var buffer : buffers) {
                if (buffer.remaining() > MAX_RESPONSE_BYTES - bytes.size()) {
                    reject();
                    return;
                }
                byte[] chunk = new byte[buffer.remaining()];
                buffer.get(chunk);
                bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        @Override public void onError(Throwable throwable) { result.completeExceptionally(new CityBoundaryLookupException()); }
        @Override public void onComplete() { result.complete(bytes.toByteArray()); }
        void reject() { result.completeExceptionally(new CityBoundaryLookupException()); cancel(); }
        void cancel() {
            result.cancel(false);
            if (subscription != null) subscription.cancel();
        }
    }
}
