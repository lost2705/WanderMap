package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.ByteArrayOutputStream;
import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Arrays;
import javax.imageio.ImageIO;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class TravelApiIT extends AuthenticatedIntegrationTestSupport {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void exposesTheTravelProfileContract() throws Exception {
        HttpResponse<String> response = request("GET", "/api/travel-profile", null);

        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode profile = json(response);
        List<String> fieldNames = List.of(
                "journeyCount",
                "visitCount",
                "uniqueCityCount",
                "countryCount",
                "travelDayCount",
                "memoryCount",
                "photoCount",
                "revisitedCityCount",
                "revisitedCountryCount");
        assertThat(profile.size()).isEqualTo(fieldNames.size() + 2);
        fieldNames.forEach(fieldName -> {
            JsonNode value = profile.path(fieldName);
            assertThat(value.isIntegralNumber()).isTrue();
            assertThat(value.asLong()).isNotNegative();
        });
        assertThat(profile.path("highlights").size()).isEqualTo(5);
        assertThat(profile.path("highlights")).allSatisfy(highlight -> assertThat(highlight.isNull()).isTrue());
        assertThat(profile.path("achievements")).hasSize(12).allSatisfy(achievement -> {
            assertThat(achievement.path("code").asText()).isNotBlank();
            assertThat(achievement.path("unlocked").asBoolean()).isFalse();
            assertThat(achievement.path("currentValue").asLong()).isZero();
            assertThat(achievement.path("targetValue").asLong()).isPositive();
            assertThat(achievement.path("progressPercent").asInt()).isZero();
        });
    }

    @Test
    void managesBucketListCitiesAndDerivesVisitedStateFromTripStops() throws Exception {
        JsonNode profileBeforeBucketChanges = json(request("GET", "/api/travel-profile", null));
        HttpResponse<String> addAlabamaResponse = request(
                "POST",
                "/api/bucket-list",
                """
                {"countryCode":"US","cityName":"Florence","latitude":34.7998125,"longitude":-87.6773125}
                """);
        assertThat(addAlabamaResponse.statusCode()).isEqualTo(201);
        JsonNode alabama = json(addAlabamaResponse);
        String alabamaItemId = alabama.path("id").asText();
        String alabamaCityId = alabama.path("city").path("id").asText();
        assertThat(alabama.path("visited").asBoolean()).isFalse();
        assertThat(alabama.path("city").path("latitude").asDouble()).isEqualTo(34.799813d);
        assertThat(addAlabamaResponse.headers().firstValue("Location"))
                .contains("/api/bucket-list/" + alabamaItemId);

        HttpResponse<String> duplicateResponse = request(
                "POST",
                "/api/bucket-list",
                """
                {"countryCode":"US","cityName":"  FLORENCE  ","latitude":34.7998125,"longitude":-87.6773125}
                """);
        assertThat(duplicateResponse.statusCode()).isEqualTo(409);
        assertThat(json(duplicateResponse).path("code").asText()).isEqualTo("BUCKET_LIST_DUPLICATE");

        JsonNode southCarolina = json(request(
                "POST",
                "/api/bucket-list",
                """
                {"countryCode":"US","cityName":"Florence","latitude":34.1954,"longitude":-79.7626}
                """));
        assertThat(southCarolina.path("city").path("id").asText()).isNotEqualTo(alabamaCityId);
        assertThat(json(request("GET", "/api/travel-profile", null))).isEqualTo(profileBeforeBucketChanges);

        JsonNode coordinateLess = json(request(
                "POST",
                "/api/bucket-list",
                "{\"countryCode\":\"IT\",\"cityName\":\"Venice\"}"));
        assertThat(coordinateLess.path("city").path("latitude").asDouble()).isEqualTo(45.4408d);
        assertThat(coordinateLess.path("city").path("longitude").asDouble()).isEqualTo(12.3155d);

        HttpResponse<String> createTripResponse = request(
                "POST",
                "/api/trips",
                "{\"name\":\"Bucket visit " + UUID.randomUUID() + "\"}");
        String tripId = json(createTripResponse).path("id").asText();
        JsonNode stop = addStopWithLocation(tripId, "US", "Florence", 34.7998125, -87.6773125);
        assertThat(stop.path("city").path("id").asText()).isEqualTo(alabamaCityId);

        JsonNode list = json(request("GET", "/api/bucket-list", null));
        assertThat(list).anySatisfy(item -> {
            assertThat(item.path("id").asText()).isEqualTo(alabamaItemId);
            assertThat(item.path("visited").asBoolean()).isTrue();
        });
        assertThat(list).anySatisfy(item -> {
            assertThat(item.path("id").asText()).isEqualTo(southCarolina.path("id").asText());
            assertThat(item.path("visited").asBoolean()).isFalse();
        });

        HttpResponse<String> deleteResponse = request("DELETE", "/api/bucket-list/" + alabamaItemId, null);
        assertThat(deleteResponse.statusCode()).isEqualTo(204);
        JsonNode placeAfterRemoval = json(request("GET", "/api/places/" + alabamaCityId, null));
        assertThat(placeAfterRemoval.path("city").path("id").asText()).isEqualTo(alabamaCityId);
        assertThat(placeAfterRemoval.path("visitCount").asInt()).isEqualTo(1);

        HttpResponse<String> missingDelete = request("DELETE", "/api/bucket-list/" + UUID.randomUUID(), null);
        assertThat(missingDelete.statusCode()).isEqualTo(404);
        assertThat(json(missingDelete).path("code").asText()).isEqualTo("BUCKET_LIST_ITEM_NOT_FOUND");
    }

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

        JsonNode romeStop = addStop(tripId, "Rome");
        JsonNode florenceStop = addStop(tripId, "Florence");
        addStop(tripId, "Bologna");
        JsonNode veniceStop = addStop(tripId, "Venice");

        assertThat(romeStop.path("city").path("latitude").asDouble()).isEqualTo(41.9028d);
        assertThat(romeStop.path("city").path("longitude").asDouble()).isEqualTo(12.4964d);
        assertThat(florenceStop.path("city").path("latitude").asDouble()).isEqualTo(43.7696d);
        assertThat(florenceStop.path("city").path("longitude").asDouble()).isEqualTo(11.2558d);

        HttpResponse<String> overviewResponse = request("GET", "/api/trips/map-overview", null);
        assertThat(overviewResponse.statusCode()).isEqualTo(200);
        JsonNode overview = json(overviewResponse);
        assertThat(overview.path("visitedCountryCodes")).anySatisfy(code ->
                assertThat(code.asText()).isEqualTo("IT"));
        assertThat(overview.path("memoryCount").isIntegralNumber()).isTrue();
        assertThat(overview.path("markers")).anySatisfy(marker -> {
            assertThat(marker.path("tripId").asText()).isEqualTo(tripId);
            assertThat(marker.path("cityId").asText()).isEqualTo(florenceStop.path("city").path("id").asText());
            assertThat(marker.path("cityName").asText()).isEqualTo("Florence");
            assertThat(marker.path("position").asInt()).isEqualTo(2);
            assertThat(marker.path("latitude").asDouble()).isEqualTo(43.7696d);
            assertThat(marker.path("country").path("code").asText()).isEqualTo("IT");
        });

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
    void exposesTheAggregateMemoryCountWithoutChangingExistingOverviewFields() throws Exception {
        JsonNode initialOverview = json(request("GET", "/api/trips/map-overview", null));
        long initialMemoryCount = initialOverview.path("memoryCount").asLong();
        String tripId = createTrip("Overview memories " + UUID.randomUUID());
        HttpResponse<String> stopResponse = request(
                "POST",
                "/api/trips/" + tripId + "/stops",
                """
                {"countryCode":"IT","cityName":"Memory note %s","note":"An evening to remember."}
                """.formatted(UUID.randomUUID()));
        assertThat(stopResponse.statusCode()).isEqualTo(201);

        JsonNode overview = json(request("GET", "/api/trips/map-overview", null));

        assertThat(overview.path("memoryCount").asLong()).isEqualTo(initialMemoryCount + 1);
        assertThat(overview.path("visitedCountryCodes").isArray()).isTrue();
        assertThat(overview.path("markers").isArray()).isTrue();
        assertThat(request("DELETE", "/api/trips/" + tripId, null).statusCode()).isEqualTo(204);
    }

    @Test
    void managesTripAndStopJournalFieldsEndToEnd() throws Exception {
        HttpResponse<String> createResponse = request(
                "POST",
                "/api/trips",
                """
                {
                  "name":"Japan 2026",
                  "startDate":"2026-04-01",
                  "endDate":"2026-04-12",
                  "description":"Cherry blossoms, trains, and quiet mornings."
                }
                """);
        assertThat(createResponse.statusCode()).isEqualTo(201);
        JsonNode createdTrip = json(createResponse);
        String tripId = createdTrip.path("id").asText();
        assertThat(createdTrip.path("startDate").asText()).isEqualTo("2026-04-01");
        assertThat(createdTrip.path("endDate").asText()).isEqualTo("2026-04-12");
        assertThat(createdTrip.path("description").asText())
                .isEqualTo("Cherry blossoms, trains, and quiet mornings.");

        HttpResponse<String> addResponse = request(
                "POST",
                "/api/trips/" + tripId + "/stops",
                """
                {
                  "countryCode":"JP",
                  "cityName":"Tokyo",
                  "latitude":35.6762,
                  "longitude":139.6503,
                  "arrivalDate":"2026-04-02",
                  "departureDate":"2026-04-05",
                  "note":"Cherry blossoms in Ueno Park."
                }
                """);
        assertThat(addResponse.statusCode()).isEqualTo(201);
        JsonNode createdStop = json(addResponse);
        String stopId = createdStop.path("id").asText();
        String cityId = createdStop.path("city").path("id").asText();
        assertThat(createdStop.path("arrivalDate").asText()).isEqualTo("2026-04-02");
        assertThat(createdStop.path("departureDate").asText()).isEqualTo("2026-04-05");
        assertThat(createdStop.path("note").asText()).isEqualTo("Cherry blossoms in Ueno Park.");

        JsonNode overviewBeforeJournalUpdate = json(request("GET", "/api/trips/map-overview", null));

        assertProblem(
                request(
                        "PATCH",
                        "/api/trips/" + tripId + "/stops/" + stopId + "/journal",
                        """
                        {"arrivalDate":"2026-04-06","departureDate":"2026-04-05"}
                        """),
                400,
                "INVALID_REQUEST");
        assertProblem(
                request(
                        "PATCH",
                        "/api/trips/" + tripId + "/stops/" + stopId + "/journal",
                        """
                        {"arrivalDate":"2026-03-31"}
                        """),
                400,
                "INVALID_REQUEST");
        assertProblem(
                request(
                        "PATCH",
                        "/api/trips/" + tripId + "/stops/" + stopId + "/journal",
                        """
                        {"departureDate":"2026-04-13"}
                        """),
                400,
                "INVALID_REQUEST");

        HttpResponse<String> journalResponse = request(
                "PATCH",
                "/api/trips/" + tripId + "/stops/" + stopId + "/journal",
                """
                {
                  "arrivalDate":"2026-04-03",
                  "departureDate":"2026-04-06",
                  "note":"Tsukiji breakfast and an evening in Shinjuku."
                }
                """);
        assertThat(journalResponse.statusCode()).isEqualTo(200);
        JsonNode updatedStop = json(journalResponse);
        assertThat(updatedStop.path("id").asText()).isEqualTo(stopId);
        assertThat(updatedStop.path("city").path("id").asText()).isEqualTo(cityId);
        assertThat(updatedStop.path("city").path("latitude").asDouble()).isEqualTo(35.6762d);
        assertThat(updatedStop.path("city").path("longitude").asDouble()).isEqualTo(139.6503d);
        assertThat(updatedStop.path("position").asInt()).isEqualTo(1);
        assertThat(updatedStop.path("arrivalDate").asText()).isEqualTo("2026-04-03");
        assertThat(updatedStop.path("departureDate").asText()).isEqualTo("2026-04-06");
        assertThat(updatedStop.path("note").asText())
                .isEqualTo("Tsukiji breakfast and an evening in Shinjuku.");
        assertThat(json(request("GET", "/api/trips/map-overview", null)))
                .isEqualTo(overviewBeforeJournalUpdate);

        assertProblem(
                request(
                        "PATCH",
                        "/api/trips/" + tripId,
                        """
                        {
                          "name":"Invalid shortened trip",
                          "startDate":"2026-04-04",
                          "endDate":"2026-04-12",
                          "description":"Must not persist"
                        }
                        """),
                400,
                "INVALID_REQUEST");
        assertThat(getTrip(tripId).path("name").asText()).isEqualTo("Japan 2026");

        HttpResponse<String> updateTripResponse = request(
                "PATCH",
                "/api/trips/" + tripId,
                """
                {
                  "name":"Japan Spring 2026",
                  "startDate":"2026-04-01",
                  "endDate":"2026-04-13",
                  "description":"Tokyo first, then Kyoto."
                }
                """);
        assertThat(updateTripResponse.statusCode()).isEqualTo(200);
        assertThat(json(updateTripResponse).path("description").asText()).isEqualTo("Tokyo first, then Kyoto.");

        JsonNode persistedTrip = getTrip(tripId);
        assertThat(persistedTrip.path("description").asText()).isEqualTo("Tokyo first, then Kyoto.");
        assertThat(persistedTrip.path("stops").get(0).path("arrivalDate").asText()).isEqualTo("2026-04-03");
        assertThat(persistedTrip.path("stops").get(0).path("departureDate").asText()).isEqualTo("2026-04-06");
        assertThat(persistedTrip.path("stops").get(0).path("note").asText())
                .isEqualTo("Tsukiji breakfast and an evening in Shinjuku.");

        HttpResponse<String> clearJournalResponse = request(
                "PATCH", "/api/trips/" + tripId + "/stops/" + stopId + "/journal", "{}");
        assertThat(clearJournalResponse.statusCode()).isEqualTo(200);
        JsonNode clearedStop = json(clearJournalResponse);
        assertThat(clearedStop.path("arrivalDate").isNull()).isTrue();
        assertThat(clearedStop.path("departureDate").isNull()).isTrue();
        assertThat(clearedStop.path("note").isNull()).isTrue();

        HttpResponse<String> clearTripJournalResponse = request(
                "PATCH", "/api/trips/" + tripId, "{\"name\":\"Japan journal cleared\"}");
        assertThat(clearTripJournalResponse.statusCode()).isEqualTo(200);
        JsonNode clearedTrip = json(clearTripJournalResponse);
        assertThat(clearedTrip.path("startDate").isNull()).isTrue();
        assertThat(clearedTrip.path("endDate").isNull()).isTrue();
        assertThat(clearedTrip.path("description").isNull()).isTrue();

        assertThat(request("DELETE", "/api/trips/" + tripId, null).statusCode()).isEqualTo(204);
    }

    @Test
    void keepsLegacyCoordinateLessAndJournalLessRequestsCompatible() throws Exception {
        String tripId = createTrip("Legacy journal fields " + UUID.randomUUID());
        JsonNode stop = addStop(tripId, "Rome legacy " + UUID.randomUUID());

        JsonNode trip = getTrip(tripId);
        assertThat(trip.path("description").isNull()).isTrue();
        assertThat(stop.path("arrivalDate").isNull()).isTrue();
        assertThat(stop.path("departureDate").isNull()).isTrue();
        assertThat(stop.path("note").isNull()).isTrue();
        assertThat(stop.path("photos").isArray()).isTrue();
        assertThat(stop.path("photos")).isEmpty();

        assertThat(request("DELETE", "/api/trips/" + tripId, null).statusCode()).isEqualTo(204);
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

    @Test
    void keepsUnresolvedCitiesValidWithoutMapMarkers() throws Exception {
        String tripId = createTrip("Unresolved location " + UUID.randomUUID());
        JsonNode pattayaStop = addStopWithCountry(tripId, "TH", "Pattaya");

        assertThat(pattayaStop.path("city").path("latitude").isNull()).isTrue();
        assertThat(pattayaStop.path("city").path("longitude").isNull()).isTrue();

        HttpResponse<String> overviewResponse = request("GET", "/api/trips/map-overview", null);
        assertThat(overviewResponse.statusCode()).isEqualTo(200);
        JsonNode overview = json(overviewResponse);
        assertThat(overview.path("visitedCountryCodes")).anySatisfy(code ->
                assertThat(code.asText()).isEqualTo("TH"));
        assertThat(overview.path("markers")).noneSatisfy(marker ->
                assertThat(marker.path("tripId").asText()).isEqualTo(tripId));

        HttpResponse<String> deleteResponse = request("DELETE", "/api/trips/" + tripId, null);
        assertThat(deleteResponse.statusCode()).isEqualTo(204);
    }

    @Test
    void persistsSelectedSearchCoordinatesForACityOutsideTheKnownCatalog() throws Exception {
        String tripId = createTrip("Selected geocoder result " + UUID.randomUUID());
        HttpResponse<String> addResponse = request(
                "POST",
                "/api/trips/" + tripId + "/stops",
                """
                {"countryCode":"IT","cityName":"Lucca","latitude":43.8429,"longitude":10.5027}
                """);

        assertThat(addResponse.statusCode()).isEqualTo(201);
        JsonNode city = json(addResponse).path("city");
        assertThat(city.path("name").asText()).isEqualTo("Lucca");
        assertThat(city.path("country").path("code").asText()).isEqualTo("IT");
        assertThat(city.path("latitude").asDouble()).isEqualTo(43.8429d);
        assertThat(city.path("longitude").asDouble()).isEqualTo(10.5027d);

        JsonNode overview = json(request("GET", "/api/trips/map-overview", null));
        assertThat(overview.path("visitedCountryCodes")).anySatisfy(code ->
                assertThat(code.asText()).isEqualTo("IT"));
        assertThat(overview.path("markers")).anySatisfy(marker -> {
            assertThat(marker.path("tripId").asText()).isEqualTo(tripId);
            assertThat(marker.path("cityId").asText()).isEqualTo(city.path("id").asText());
            assertThat(marker.path("cityName").asText()).isEqualTo("Lucca");
            assertThat(marker.path("latitude").asDouble()).isEqualTo(43.8429d);
            assertThat(marker.path("longitude").asDouble()).isEqualTo(10.5027d);
        });

        assertThat(request("DELETE", "/api/trips/" + tripId, null).statusCode()).isEqualTo(204);
    }

    @Test
    void keepsSameNameGeocodingSelectionsAtDifferentLocationsDistinct() throws Exception {
        long initialMemoryCount = json(request("GET", "/api/trips/map-overview", null))
                .path("memoryCount")
                .asLong();
        String tripId = createTrip("Two Florences " + UUID.randomUUID());

        JsonNode alabamaStop = addStopWithLocation(tripId, "US", "Florence", 34.7998125, -87.6773125);
        JsonNode southCarolinaStop = addStopWithLocation(tripId, "US", "Florence", 34.1954, -79.7626);
        JsonNode alabamaAgainStop = addStopWithLocation(tripId, "US", "  FLORENCE  ", 34.7998125, -87.6773125);

        String alabamaCityId = alabamaStop.path("city").path("id").asText();
        String southCarolinaCityId = southCarolinaStop.path("city").path("id").asText();
        assertThat(alabamaStop.path("id").asText()).isNotEqualTo(alabamaAgainStop.path("id").asText());
        assertThat(southCarolinaCityId).isNotEqualTo(alabamaCityId);
        assertThat(alabamaAgainStop.path("city").path("id").asText()).isEqualTo(alabamaCityId);

        JsonNode persistedStops = getTrip(tripId).path("stops");
        assertThat(persistedStops).hasSize(3);
        assertThat(persistedStops).extracting(stop -> stop.path("position").asInt())
                .containsExactly(1, 2, 3);
        assertThat(persistedStops).extracting(stop -> stop.path("id").asText())
                .doesNotHaveDuplicates();
        assertThat(persistedStops.get(0).path("city").path("id").asText()).isEqualTo(alabamaCityId);
        assertThat(persistedStops.get(0).path("city").path("latitude").asDouble()).isEqualTo(34.799813d);
        assertThat(persistedStops.get(0).path("city").path("longitude").asDouble()).isEqualTo(-87.677313d);
        assertThat(persistedStops.get(1).path("city").path("id").asText()).isEqualTo(southCarolinaCityId);
        assertThat(persistedStops.get(1).path("city").path("latitude").asDouble()).isEqualTo(34.1954d);
        assertThat(persistedStops.get(1).path("city").path("longitude").asDouble()).isEqualTo(-79.7626d);
        assertThat(persistedStops.get(2).path("city").path("id").asText()).isEqualTo(alabamaCityId);
        assertThat(json(request("GET", "/api/trips/map-overview", null)).path("memoryCount").asLong())
                .isEqualTo(initialMemoryCount);

        assertThat(request("DELETE", "/api/trips/" + tripId, null).statusCode()).isEqualTo(204);
    }

    @Test
    void mapOverviewKeepsOneStableCityIdentityAcrossMultipleTrips() throws Exception {
        String firstTripId = createTrip("Shared city A " + UUID.randomUUID());
        String secondTripId = createTrip("Shared city B " + UUID.randomUUID());
        String cityName = "Shared Rome " + UUID.randomUUID();
        JsonNode firstStop = addStopWithLocation(firstTripId, "IT", cityName, 41.9028, 12.4964);
        JsonNode secondStop = addStopWithLocation(secondTripId, "IT", cityName, 41.9028, 12.4964);
        String cityId = firstStop.path("city").path("id").asText();

        assertThat(secondStop.path("city").path("id").asText()).isEqualTo(cityId);

        JsonNode overview = json(request("GET", "/api/trips/map-overview", null));
        List<JsonNode> sharedCityMarkers = new ArrayList<>();
        for (JsonNode marker : overview.path("markers")) {
            if (marker.path("tripId").asText().equals(firstTripId)
                    || marker.path("tripId").asText().equals(secondTripId)) {
                sharedCityMarkers.add(marker);
            }
        }
        assertThat(sharedCityMarkers).hasSize(2).allSatisfy(marker -> {
            assertThat(marker.path("cityId").asText()).isEqualTo(cityId);
            assertThat(marker.path("cityName").asText()).isEqualTo(cityName);
            assertThat(marker.path("latitude").asDouble()).isEqualTo(41.9028d);
            assertThat(marker.path("longitude").asDouble()).isEqualTo(12.4964d);
            assertThat(marker.path("country").path("code").asText()).isEqualTo("IT");
        });

        assertThat(request("DELETE", "/api/trips/" + firstTripId, null).statusCode()).isEqualTo(204);
        assertThat(request("DELETE", "/api/trips/" + secondTripId, null).statusCode()).isEqualTo(204);
    }

    @Test
    void uploadsServesOrdersAndDeletesStopPhotosEndToEnd() throws Exception {
        String tripId = createTrip("Photo journal " + UUID.randomUUID());
        JsonNode stop = addStop(tripId, "Rome photos " + UUID.randomUUID());
        String stopId = stop.path("id").asText();
        byte[] jpegContent = imageBytes("jpg");
        byte[] pngContent = imageBytes("png");

        HttpResponse<String> jpegResponse = uploadPhoto(
                tripId,
                stopId,
                "../summer memories.jpg",
                "image/jpeg",
                jpegContent);
        HttpResponse<String> pngResponse = uploadPhoto(
                tripId,
                stopId,
                "second photo.png",
                "image/png",
                pngContent);
        HttpResponse<String> webpResponse = uploadPhoto(
                tripId,
                stopId,
                "third.webp",
                "image/webp",
                webp("VP8 ", bytes(1, 2, 3, 4)));

        assertThat(jpegResponse.statusCode()).isEqualTo(201);
        assertThat(pngResponse.statusCode()).isEqualTo(201);
        assertThat(webpResponse.statusCode()).isEqualTo(201);
        JsonNode jpeg = json(jpegResponse);
        JsonNode png = json(pngResponse);
        JsonNode webp = json(webpResponse);
        assertThat(jpeg.path("originalFilename").asText()).isEqualTo("summer memories.jpg");
        assertThat(jpeg.path("contentType").asText()).isEqualTo("image/jpeg");
        assertThat(jpeg.path("size").asLong()).isEqualTo(jpegContent.length);
        assertThat(jpeg.path("position").asInt()).isEqualTo(1);
        assertThat(png.path("position").asInt()).isEqualTo(2);
        assertThat(webp.path("position").asInt()).isEqualTo(3);
        assertThat(jpeg.path("contentUrl").asText()).isEqualTo(
                "/api/trips/" + tripId + "/stops/" + stopId + "/photos/" + jpeg.path("id").asText() + "/content");
        assertThat(jpeg.path("storageKey").isMissingNode()).isTrue();

        String jpegStorageKey = storageKey(jpeg.path("id").asText());
        String pngStorageKey = storageKey(png.path("id").asText());
        String webpStorageKey = storageKey(webp.path("id").asText());
        assertThat(jpegStorageKey).doesNotContain("summer memories.jpg").doesNotContain("..");
        assertThat(Files.exists(photoStorageRoot().resolve(jpegStorageKey))).isTrue();

        JsonNode persistedPhotos = getTrip(tripId).path("stops").get(0).path("photos");
        assertThat(persistedPhotos).hasSize(3);
        assertThat(persistedPhotos.get(0).path("id").asText()).isEqualTo(jpeg.path("id").asText());
        assertThat(persistedPhotos.get(1).path("id").asText()).isEqualTo(png.path("id").asText());
        assertThat(persistedPhotos.get(2).path("id").asText()).isEqualTo(webp.path("id").asText());

        HttpResponse<byte[]> contentResponse = requestBytes("GET", jpeg.path("contentUrl").asText());
        assertThat(contentResponse.statusCode()).isEqualTo(200);
        assertThat(contentResponse.headers().firstValue("Content-Type")).hasValue("image/jpeg");
        assertThat(contentResponse.headers().firstValue("X-Content-Type-Options")).hasValue("nosniff");
        assertThat(contentResponse.body()).containsExactly(jpegContent);

        assertThat(request(
                "DELETE",
                "/api/trips/" + tripId + "/stops/" + stopId + "/photos/" + jpeg.path("id").asText(),
                null).statusCode()).isEqualTo(204);
        assertThat(Files.exists(photoStorageRoot().resolve(jpegStorageKey))).isFalse();
        JsonNode remainingPhotos = getTrip(tripId).path("stops").get(0).path("photos");
        assertThat(remainingPhotos).hasSize(2);
        assertThat(remainingPhotos.get(0).path("position").asInt()).isEqualTo(1);
        assertThat(remainingPhotos.get(1).path("position").asInt()).isEqualTo(2);

        assertThat(request("DELETE", "/api/trips/" + tripId, null).statusCode()).isEqualTo(204);
        assertThat(Files.exists(photoStorageRoot().resolve(pngStorageKey))).isFalse();
        assertThat(Files.exists(photoStorageRoot().resolve(webpStorageKey))).isFalse();
    }

    @Test
    void validatesPhotoContentSizeAndOwnership() throws Exception {
        String firstTripId = createTrip("Photo validation A " + UUID.randomUUID());
        String secondTripId = createTrip("Photo validation B " + UUID.randomUUID());
        String firstStopId = addStop(firstTripId, "Photo A " + UUID.randomUUID()).path("id").asText();
        String secondStopId = addStop(secondTripId, "Photo B " + UUID.randomUUID()).path("id").asText();

        assertProblem(uploadPhoto(firstTripId, firstStopId, "empty.jpg", "image/jpeg", new byte[0]), 400, "PHOTO_EMPTY");
        assertProblem(
                uploadPhoto(firstTripId, firstStopId, "notes.txt", "text/plain", "not an image".getBytes(StandardCharsets.UTF_8)),
                415,
                "PHOTO_UNSUPPORTED_TYPE");
        assertProblem(
                uploadPhoto(firstTripId, firstStopId, "fake.png", "image/png", bytes(0xff, 0xd8, 0xff)),
                400,
                "PHOTO_INVALID_CONTENT");
        assertProblem(
                uploadPhoto(
                        firstTripId,
                        firstStopId,
                        "fake.webp",
                        "image/webp",
                        bytes('R', 'I', 'F', 'F', 4, 0, 0, 0, 'W', 'E', 'B', 'P')),
                400,
                "PHOTO_INVALID_CONTENT");

        byte[] oversized = new byte[1025];
        Arrays.fill(oversized, (byte) 1);
        oversized[0] = (byte) 0xff;
        oversized[1] = (byte) 0xd8;
        oversized[2] = (byte) 0xff;
        assertProblem(uploadPhoto(firstTripId, firstStopId, "large.jpg", "image/jpeg", oversized), 413, "PHOTO_TOO_LARGE");

        assertProblem(
                uploadPhoto(UUID.randomUUID().toString(), firstStopId, "photo.jpg", "image/jpeg", imageBytes("jpg")),
                404,
                "TRIP_NOT_FOUND");
        assertProblem(
                uploadPhoto(firstTripId, UUID.randomUUID().toString(), "photo.jpg", "image/jpeg", imageBytes("jpg")),
                404,
                "TRIP_STOP_NOT_FOUND");
        assertProblem(
                uploadPhoto(firstTripId, secondStopId, "photo.jpg", "image/jpeg", imageBytes("jpg")),
                404,
                "TRIP_STOP_NOT_FOUND");

        assertThat(request("DELETE", "/api/trips/" + firstTripId, null).statusCode()).isEqualTo(204);
        assertThat(request("DELETE", "/api/trips/" + secondTripId, null).statusCode()).isEqualTo(204);
    }

    @Test
    void deletingAStopRemovesItsStoredPhotos() throws Exception {
        String tripId = createTrip("Stop photo cleanup " + UUID.randomUUID());
        String stopId = addStop(tripId, "Cleanup city " + UUID.randomUUID()).path("id").asText();
        JsonNode photo = json(uploadPhoto(
                tripId, stopId, "cleanup.jpg", "image/jpeg", imageBytes("jpg")));
        String storageKey = storageKey(photo.path("id").asText());
        assertThat(Files.exists(photoStorageRoot().resolve(storageKey))).isTrue();

        assertThat(request("DELETE", "/api/trips/" + tripId + "/stops/" + stopId, null).statusCode()).isEqualTo(204);

        assertThat(Files.exists(photoStorageRoot().resolve(storageKey))).isFalse();
        assertThat(request("DELETE", "/api/trips/" + tripId, null).statusCode()).isEqualTo(204);
    }

    private String createTrip(String name) throws Exception {
        HttpResponse<String> response = request("POST", "/api/trips", "{\"name\":\"" + name + "\"}");
        assertThat(response.statusCode()).isEqualTo(201);
        return json(response).path("id").asText();
    }

    private JsonNode addStop(String tripId, String cityName) throws Exception {
        return addStopWithCountry(tripId, "IT", cityName);
    }

    private JsonNode addStopWithCountry(String tripId, String countryCode, String cityName) throws Exception {
        HttpResponse<String> response = request(
                "POST",
                "/api/trips/" + tripId + "/stops",
                "{\"countryCode\":\"" + countryCode + "\",\"cityName\":\"" + cityName + "\"}");
        assertThat(response.statusCode()).isEqualTo(201);
        return json(response);
    }

    private JsonNode addStopWithLocation(
            String tripId, String countryCode, String cityName, double latitude, double longitude) throws Exception {
        HttpResponse<String> response = request(
                "POST",
                "/api/trips/" + tripId + "/stops",
                """
                {"countryCode":"%s","cityName":"%s","latitude":%s,"longitude":%s}
                """.formatted(countryCode, cityName, latitude, longitude));
        assertThat(response.statusCode()).isEqualTo(201);
        return json(response);
    }

    private JsonNode getTrip(String tripId) throws Exception {
        HttpResponse<String> response = request("GET", "/api/trips/" + tripId, null);
        assertThat(response.statusCode()).isEqualTo(200);
        return json(response);
    }

    private HttpResponse<String> uploadPhoto(
            String tripId,
            String stopId,
            String filename,
            String contentType,
            byte[] content) throws Exception {
        String boundary = "WanderMapBoundary" + UUID.randomUUID();
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        body.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(("Content-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\n")
                .getBytes(StandardCharsets.UTF_8));
        body.write(("Content-Type: " + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(content);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));

        HttpRequest request = csrf(authenticatedRequest(
                        "/api/trips/" + tripId + "/stops/" + stopId + "/photos"))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<byte[]> requestBytes(String method, String path) throws Exception {
        HttpRequest request = authenticatedRequest(path)
                .method(method, HttpRequest.BodyPublishers.noBody())
                .build();
        return httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
    }

    private String storageKey(String photoId) {
        return jdbcTemplate.queryForObject(
                "SELECT storage_key FROM trip_stop_photos WHERE id = ?",
                String.class,
                UUID.fromString(photoId));
    }

    private static byte[] bytes(int... values) {
        byte[] result = new byte[values.length];
        for (int index = 0; index < values.length; index++) {
            result[index] = (byte) values[index];
        }
        return result;
    }

    private static byte[] webp(String chunkType, byte[] payload) {
        byte[] content = new byte[20 + payload.length + (payload.length & 1)];
        writeFourCc(content, 0, "RIFF");
        writeUnsignedLittleEndianInt(content, 4, content.length - 8L);
        writeFourCc(content, 8, "WEBP");
        writeFourCc(content, 12, chunkType);
        writeUnsignedLittleEndianInt(content, 16, payload.length);
        System.arraycopy(payload, 0, content, 20, payload.length);
        return content;
    }

    private static void writeFourCc(byte[] content, int offset, String value) {
        byte[] encoded = value.getBytes(StandardCharsets.US_ASCII);
        if (encoded.length != 4) {
            throw new IllegalArgumentException("FourCC must contain four ASCII bytes");
        }
        System.arraycopy(encoded, 0, content, offset, encoded.length);
    }

    private static void writeUnsignedLittleEndianInt(byte[] content, int offset, long value) {
        for (int index = 0; index < 4; index++) {
            content[offset + index] = (byte) (value >>> (index * 8));
        }
    }

    private static byte[] imageBytes(String format) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), format, output);
            return output.toByteArray();
        } catch (java.io.IOException exception) {
            throw new AssertionError(exception);
        }
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
        HttpRequest.Builder builder = authenticatedRequest(path);
        if (!"GET".equals(method) && !"HEAD".equals(method) && !"OPTIONS".equals(method)) {
            csrf(builder);
        }
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
