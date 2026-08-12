package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.annotation.DirtiesContext;
import org.testcontainers.junit.jupiter.Testcontainers;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.BEFORE_CLASS)
class TravelApiIT extends PostgresIntegrationTestSupport {

    private final HttpClient httpClient = HttpClient.newHttpClient();

    @LocalServerPort
    private int port;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void managesTripAndStopsEndToEnd() throws Exception {
        HttpResponse<String> countriesResponse = request("GET", "/api/countries", null);
        assertThat(countriesResponse.statusCode()).isEqualTo(200);
        JsonNode countries = json(countriesResponse);
        assertThat(countries).isNotEmpty();
        assertThat(countries).anySatisfy(country -> {
            assertThat(country.path("code").asText()).isEqualTo("IT");
            assertThat(country.path("name").asText()).isEqualTo("Italy");
        });
        assertThat(countries.get(0).path("name").asText())
                .isLessThanOrEqualTo(countries.get(1).path("name").asText());

        HttpResponse<String> createResponse = request(
                "POST",
                "/api/trips",
                """
                {"name":"Italy 2026","startDate":"2026-05-10","endDate":"2026-05-21"}
                """);
        assertThat(createResponse.statusCode()).isEqualTo(201);
        JsonNode createdTrip = json(createResponse);
        String tripId = createdTrip.path("id").asText();
        assertThat(createResponse.headers().firstValue("Location"))
                .hasValueSatisfying(location -> assertThat(location).contains("/api/trips/" + tripId));

        addStop(tripId, "Rome");
        JsonNode florenceStop = addStop(tripId, "Florence");
        addStop(tripId, "Bologna");
        JsonNode veniceStop = addStop(tripId, "Venice");

        assertStops(getTrip(tripId), "Rome", "Florence", "Bologna", "Venice");

        HttpResponse<String> moveResponse = request(
                "PATCH", "/api/trips/" + tripId + "/stops/" + veniceStop.path("id").asText(), "{\"position\":2}");
        assertThat(moveResponse.statusCode()).isEqualTo(204);
        assertStops(getTrip(tripId), "Rome", "Venice", "Florence", "Bologna");

        HttpResponse<String> removeResponse = request(
                "DELETE", "/api/trips/" + tripId + "/stops/" + florenceStop.path("id").asText(), null);
        assertThat(removeResponse.statusCode()).isEqualTo(204);
        assertStops(getTrip(tripId), "Rome", "Venice", "Bologna");

        HttpResponse<String> updateResponse = request(
                "PATCH",
                "/api/trips/" + tripId,
                """
                {"name":"Italy 2026 revised","startDate":"2026-05-11","endDate":"2026-05-22"}
                """);
        assertThat(updateResponse.statusCode()).isEqualTo(200);
        JsonNode updatedTrip = json(updateResponse);
        assertThat(updatedTrip.path("name").asText()).isEqualTo("Italy 2026 revised");
        assertThat(updatedTrip.path("startDate").asText()).isEqualTo("2026-05-11");
        assertThat(updatedTrip.path("endDate").asText()).isEqualTo("2026-05-22");

        HttpResponse<String> clearDatesResponse = request(
                "PATCH", "/api/trips/" + tripId, "{\"name\":\"Italy 2026 dates cleared\"}");
        assertThat(clearDatesResponse.statusCode()).isEqualTo(200);
        JsonNode datesClearedTrip = getTrip(tripId);
        assertThat(datesClearedTrip.path("name").asText()).isEqualTo("Italy 2026 dates cleared");
        assertThat(datesClearedTrip.path("startDate").isNull()).isTrue();
        assertThat(datesClearedTrip.path("endDate").isNull()).isTrue();

        HttpResponse<String> listResponse = request("GET", "/api/trips", null);
        assertThat(listResponse.statusCode()).isEqualTo(200);
        JsonNode summaries = json(listResponse);
        JsonNode summary = findById(summaries, tripId);
        assertThat(summary.path("id").asText()).isEqualTo(tripId);
        assertThat(summary.path("stopCount").asInt()).isEqualTo(3);

        HttpResponse<String> deleteResponse = request("DELETE", "/api/trips/" + tripId, null);
        assertThat(deleteResponse.statusCode()).isEqualTo(204);

        assertProblem(request("GET", "/api/trips/" + tripId, null), 404, "TRIP_NOT_FOUND");
    }

    @Test
    void reportsValidationAndNotFoundErrors() throws Exception {
        HttpResponse<String> blankNameResponse = request("POST", "/api/trips", "{\"name\":\" \"}");
        assertProblem(blankNameResponse, 400, "VALIDATION_FAILED");
        assertThat(json(blankNameResponse).path("errors").get(0).path("field").asText()).isEqualTo("name");

        assertProblem(
                request(
                        "POST",
                        "/api/trips",
                        "{\"name\":\"Invalid dates\",\"startDate\":\"2026-05-21\",\"endDate\":\"2026-05-10\"}"),
                400,
                "INVALID_REQUEST");

        assertProblem(request("GET", "/api/trips/" + UUID.randomUUID(), null), 404, "TRIP_NOT_FOUND");

        String tripId = createTrip("Errors " + UUID.randomUUID());
        assertProblem(
                request("POST", "/api/trips/" + tripId + "/stops", "{\"countryCode\":\"ZZ\",\"cityName\":\"Paris\"}"),
                404,
                "COUNTRY_NOT_FOUND");

        JsonNode romeStop = addStop(tripId, "Rome error " + UUID.randomUUID());
        assertProblem(
                request("PATCH", "/api/trips/" + tripId + "/stops/" + romeStop.path("id").asText(), "{\"position\":0}"),
                400,
                "VALIDATION_FAILED");
        assertProblem(
                request("PATCH", "/api/trips/" + tripId + "/stops/" + UUID.randomUUID(), "{\"position\":1}"),
                404,
                "TRIP_STOP_NOT_FOUND");
        assertProblem(request("GET", "/api/trips/not-a-uuid", null), 400, "INVALID_REQUEST");
        assertProblem(request("POST", "/api/trips", "{\"name\":\"Strict\",\"unexpected\":true}"), 400, "INVALID_REQUEST");

        HttpResponse<String> deleteResponse = request("DELETE", "/api/trips/" + tripId, null);
        assertThat(deleteResponse.statusCode()).isEqualTo(204);
    }

    private String createTrip(String name) throws Exception {
        HttpResponse<String> response = request("POST", "/api/trips", "{\"name\":\"" + name + "\"}");
        assertThat(response.statusCode()).isEqualTo(201);
        return json(response).path("id").asText();
    }

    private JsonNode addStop(String tripId, String cityName) throws Exception {
        HttpResponse<String> response = request(
                "POST",
                "/api/trips/" + tripId + "/stops",
                "{\"countryCode\":\"IT\",\"cityName\":\"" + cityName + "\"}");
        assertThat(response.statusCode()).isEqualTo(201);
        return json(response);
    }

    private JsonNode getTrip(String tripId) throws Exception {
        HttpResponse<String> response = request("GET", "/api/trips/" + tripId, null);
        assertThat(response.statusCode()).isEqualTo(200);
        return json(response);
    }

    private void assertStops(JsonNode trip, String... cityNames) {
        List<String> actualNames = new ArrayList<>();
        List<Integer> actualPositions = new ArrayList<>();
        for (JsonNode stop : trip.path("stops")) {
            actualNames.add(stop.path("city").path("name").asText());
            actualPositions.add(stop.path("position").asInt());
        }

        assertThat(actualNames).containsExactly(cityNames);
        assertThat(actualPositions).containsExactly(java.util.stream.IntStream.rangeClosed(1, cityNames.length)
                .boxed()
                .toArray(Integer[]::new));
    }

    private static JsonNode findById(JsonNode nodes, String id) {
        for (JsonNode node : nodes) {
            if (id.equals(node.path("id").asText())) {
                return node;
            }
        }
        throw new AssertionError("response did not contain resource " + id);
    }

    private void assertProblem(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        JsonNode body = json(response);
        assertThat(body.path("status").asInt()).isEqualTo(status);
        assertThat(body.path("code").asText()).isEqualTo(code);
    }

    private HttpResponse<String> request(String method, String path, String body) throws Exception {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(body));
        }
        return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode json(HttpResponse<String> response) throws Exception {
        return objectMapper.readTree(response.body());
    }
}
