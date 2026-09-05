package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.ai.application.AiModelClient;
import io.github.lost2705.wandermap.travel.application.CitySearchResult;
import io.github.lost2705.wandermap.travel.application.CitySearchService;
import io.github.lost2705.wandermap.travel.application.GeocodingUnavailableException;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import java.math.BigDecimal;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "wandermap.ai.enabled=false")
@ExtendWith(OutputCaptureExtension.class)
class TripPlanApplyApiIT extends AuthenticatedIntegrationTestSupport {

    private static final String APPLY = "/api/ai/trip-plan/apply";
    @Autowired private JdbcClient jdbc;
    @Autowired private DataSource dataSource;
    @Autowired private CityRepository cities;
    @Autowired private CountryRepository countries;
    @MockitoBean private CitySearchService search;
    @MockitoBean private AiModelClient model;
    private City rome;
    private City florence;

    @BeforeEach
    void preparePlacesAndForbidModelCalls() {
        rome = known("Rome", "IT", "41.9028", "12.4964");
        florence = known("Florence", "IT", "43.7696", "11.2558");
        doAnswer(call -> { throw new AssertionError("Apply must never invoke the model"); }).when(model).chat(any());
        when(search.searchCities(any())).thenReturn(List.of());
    }

    @AfterEach
    void noModelWasCalled() {
        verify(model, never()).chat(any());
    }

    @Test
    void appliesWithoutAiAndReturnsOrdinaryJourneyWithOwnedOrderedCanonicalStops() throws Exception {
        var draft = plan();
        draft.put("startDate", "2026-10-01").put("endDate", "2026-10-03");
        var result = apply(draft, UUID.randomUUID());
        assertThat(result.statusCode()).as(result.body()).isEqualTo(200);
        var trip = body(result);
        assertThat(trip.path("name").asText()).isEqualTo("Italy review");
        assertThat(trip.path("startDate").asText()).isEqualTo("2026-10-01");
        assertThat(trip.path("endDate").asText()).isEqualTo("2026-10-03");
        assertThat(trip.path("description").isNull()).isTrue();
        assertThat(trip.path("stops")).extracting(stop -> stop.path("position").asInt()).containsExactly(1, 2);
        assertThat(trip.path("stops")).extracting(stop -> stop.path("city").path("id").asText())
                .containsExactly(rome.getId().toString(), florence.getId().toString());
        assertThat(trip.path("stops")).allSatisfy(stop -> {
            assertThat(stop.path("note").isNull()).isTrue();
            assertThat(stop.path("arrivalDate").isNull()).isTrue();
            assertThat(stop.path("departureDate").isNull()).isTrue();
        });
        assertThat(ownerOf(trip.path("id").asText())).isEqualTo(currentUser.getId());
        assertThat(get("/api/trips/" + trip.path("id").asText()).body()).contains("Italy review", "Florence");
        verify(search, never()).searchCities(any());
    }

    @Test
    void nullDatesStayNullAndPlannerProseDoesNotCreateMemoriesOrChangeBucketList() throws Exception {
        post("/api/bucket-list", """
                {"countryCode":"IT","cityName":"Rome","latitude":41.9028,"longitude":12.4964}
                """);
        var before = body(get("/api/bucket-list"));
        var created = body(apply(plan(), UUID.randomUUID()));
        assertThat(created.path("startDate").isNull()).isTrue();
        assertThat(created.path("endDate").isNull()).isTrue();
        var after = body(get("/api/bucket-list"));
        assertThat(after).hasSize(before.size());
        assertThat(after.get(0).path("id")).isEqualTo(before.get(0).path("id"));
        assertThat(after.get(0).path("visited").asBoolean()).isTrue();
        var profile = body(get("/api/travel-profile"));
        assertThat(profile.path("journeyCount").asInt()).isEqualTo(1);
        assertThat(profile.path("uniqueCityCount").asInt()).isEqualTo(2);
        assertThat(profile.path("memoryCount").asInt()).isZero();
        assertThat(body(get("/api/trips/map-overview")).path("markers")).hasSize(2);
    }

    @Test
    void repeatedRequestsSurviveSeparateTransactionsAndConflictingPayloadIs409() throws Exception {
        UUID key = UUID.randomUUID();
        var draft = plan();
        var first = body(apply(draft, key));
        var second = apply(draft, key);
        assertThat(second.statusCode()).as(second.body()).isEqualTo(200);
        assertThat(body(second)).isEqualTo(first);
        assertThat(tripCount()).isEqualTo(1);
        draft.put("title", "A different Journey");
        var conflict = apply(draft, key);
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(body(conflict).path("code").asText()).isEqualTo("CONFLICT");
        assertThat(tripCount()).isEqualTo(1);
    }

    @Test
    void equivalentDraftRepresentationsReplayTheSameJourney() throws Exception {
        UUID key = UUID.randomUUID();
        var draft = plan();
        draft.putArray("considerations");
        draft.putArray("sourcesUsed").add("Weather").add("Place Search");
        ((ObjectNode) draft.path("stops").get(0)).putArray("activities");
        var first = apply(draft, key);
        assertThat(first.statusCode()).as(first.body()).isEqualTo(200);

        // Send raw numeric spellings, not a JsonNode round trip that might normalize them first.
        for (String latitude : List.of("41.902800", "4.19028e1", "41.9028001")) {
            String json = "{\n\"plan\":" + draft.toString().replace("41.9028", latitude)
                    + ",\"requestId\":\"" + key + "\"}";
            var replay = post(APPLY, json);
            assertThat(replay.statusCode()).as(replay.body()).isEqualTo(200);
            assertThat(body(replay)).isEqualTo(body(first));
        }
        draft.put("title", "  Italy review  ");
        draft.remove("startDate");
        draft.remove("endDate");
        draft.putNull("considerations");
        draft.putArray("sourcesUsed").add("Place Search").add("Weather");
        ((ObjectNode) draft.path("stops").get(0)).put("cityName", " rOME ")
                .put("countryName", " ITALY ").putNull("activities");
        var replay = apply(draft, key);
        assertThat(replay.statusCode()).as(replay.body()).isEqualTo(200);
        assertThat(body(replay)).isEqualTo(body(first));
        assertThat(tripCount()).isEqualTo(1);
        assertThat(ledgerCount(key)).isEqualTo(1);
        verify(search, never()).searchCities(any());
    }

    @Test
    void concurrentDuplicateRequestsCreateExactlyOneJourney() throws Exception {
        UUID key = UUID.randomUUID();
        var choice = new CitySearchResult("Bergen", "Norway", null, "NO",
                new BigDecimal("60.3913"), new BigDecimal("5.3221"));
        var resolving = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(search.searchCities(choice.name())).thenAnswer(call -> {
            resolving.countDown();
            assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
            return List.of(choice);
        });
        HttpRequest request = applyRequest(planWithPlace(choice), key);
        var first = httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString());
        CompletableFuture<HttpResponse<String>> second;
        try {
            assertThat(resolving.await(10, TimeUnit.SECONDS)).isTrue();
            second = httpClient.sendAsync(request, HttpResponse.BodyHandlers.ofString());
            awaitBlockedQueries("%INSERT INTO trip_plan_apply_requests%", 1);
        } finally {
            release.countDown();
        }
        var a = first.get(20, TimeUnit.SECONDS);
        var b = second.get(20, TimeUnit.SECONDS);
        assertThat(a.statusCode()).as(a.body()).isEqualTo(200);
        assertThat(b.statusCode()).as(b.body()).isEqualTo(200);
        assertThat(body(a).path("id")).isEqualTo(body(b).path("id"));
        assertThat(tripCount()).isEqualTo(1);
        assertThat(ledgerCount(key)).isEqualTo(1);
    }

    @Test
    void concurrentNewCityCreationReturnsCleanRetryableFailureWithoutPartialData(CapturedOutput output) throws Exception {
        var choice = new CitySearchResult("Leiden", "Netherlands", null, "NL",
                new BigDecimal("52.1601"), new BigDecimal("4.4970"));
        when(search.searchCities(choice.name())).thenReturn(List.of(choice));
        var draft = planWithPlace(choice);
        UUID firstKey = UUID.randomUUID();
        UUID secondKey = UUID.randomUUID();
        CompletableFuture<HttpResponse<String>> first;
        CompletableFuture<HttpResponse<String>> second;
        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (var statement = connection.createStatement()) {
                statement.execute("LOCK TABLE cities IN SHARE MODE");
                first = httpClient.sendAsync(applyRequest(draft, firstKey), HttpResponse.BodyHandlers.ofString());
                second = httpClient.sendAsync(applyRequest(draft, secondKey), HttpResponse.BodyHandlers.ofString());
                awaitBlockedQueries("%insert into cities%", 2);
            } finally {
                connection.rollback();
            }
        }
        var a = first.get(20, TimeUnit.SECONDS);
        var b = second.get(20, TimeUnit.SECONDS);
        assertThat(List.of(a.statusCode(), b.statusCode())).containsExactlyInAnyOrder(200, 503);
        var failed = a.statusCode() == 503 ? a : b;
        UUID failedKey = a.statusCode() == 503 ? firstKey : secondKey;
        assertThat(body(failed).path("code").asText()).isEqualTo("APPLY_UNAVAILABLE");
        assertThat(failed.body()).doesNotContain("SQL", "constraint", "Leiden", "52.1601");
        assertThat(output.getAll()).doesNotContain("leiden", "52.160100", "4.497000");
        assertThat(tripCount()).isEqualTo(1);
        assertThat(ledgerCount(failedKey)).isZero();
        var retry = apply(draft, failedKey);
        assertThat(retry.statusCode()).as(retry.body()).isEqualTo(200);
        var winner = a.statusCode() == 200 ? a : b;
        assertThat(body(retry).path("stops").get(1).path("city").path("id"))
                .isEqualTo(body(winner).path("stops").get(1).path("city").path("id"));
        assertThat(tripCount()).isEqualTo(2);
    }

    @Test
    void concurrentEnrichmentCannotMoveAnotherJourneysCity() throws Exception {
        var unlocated = cities.saveAndFlush(new City(countries.findById("US").orElseThrow(), "Springfield"));
        var illinois = new CitySearchResult("Springfield", "United States", "Illinois", "US",
                new BigDecimal("39.7817"), new BigDecimal("-89.6501"));
        var missouri = new CitySearchResult("Springfield", "United States", "Missouri", "US",
                new BigDecimal("37.2090"), new BigDecimal("-93.2923"));
        when(search.searchCities("Springfield")).thenReturn(List.of(illinois, missouri));
        CompletableFuture<HttpResponse<String>> first;
        CompletableFuture<HttpResponse<String>> second;
        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (var statement = connection.prepareStatement("SELECT id FROM cities WHERE id=? FOR UPDATE")) {
                statement.setObject(1, unlocated.getId());
                statement.executeQuery().close();
                first = httpClient.sendAsync(applyRequest(planWithPlace(illinois), UUID.randomUUID()),
                        HttpResponse.BodyHandlers.ofString());
                second = httpClient.sendAsync(applyRequest(planWithPlace(missouri), UUID.randomUUID()),
                        HttpResponse.BodyHandlers.ofString());
                // Before the fix this may block at a TripStop FK insert before the City UPDATE.
                awaitBlockedQueries("%", 2);
            } finally {
                connection.rollback();
            }
        }
        var a = first.get(20, TimeUnit.SECONDS);
        var b = second.get(20, TimeUnit.SECONDS);
        assertThat(a.statusCode()).as(a.body()).isEqualTo(200);
        assertThat(b.statusCode()).as(b.body()).isEqualTo(200);
        var firstCity = body(get("/api/trips/" + body(a).path("id").asText())).path("stops").get(1).path("city");
        var secondCity = body(get("/api/trips/" + body(b).path("id").asText())).path("stops").get(1).path("city");
        assertThat(firstCity.path("id")).isNotEqualTo(secondCity.path("id"));
        assertThat(firstCity.path("latitude").decimalValue()).isEqualByComparingTo(illinois.latitude());
        assertThat(secondCity.path("latitude").decimalValue()).isEqualByComparingTo(missouri.latitude());
        assertThat(List.of(firstCity.path("id").asText(), secondCity.path("id").asText()))
                .contains(unlocated.getId().toString());
    }

    @Test
    void deletedJourneyKeepsATombstoneAndCannotBeRecreatedByRetry() throws Exception {
        UUID key = UUID.randomUUID();
        String tripId = body(apply(plan(), key)).path("id").asText();
        var delete = csrf(authenticatedRequest("/api/trips/" + tripId)).DELETE().build();
        assertThat(httpClient.send(delete, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(204);
        assertThat(apply(plan(), key).statusCode()).isEqualTo(409);
        assertThat(tripCount()).isZero();
        assertThat(ledgerCount(key)).isEqualTo(1);
    }

    @Test
    void fullDraftContentAndItineraryOrderRemainPartOfTheRequestIdentity() throws Exception {
        UUID key = UUID.randomUUID();
        assertThat(apply(plan(), key).statusCode()).isEqualTo(200);
        for (String change : List.of("dates", "order", "location", "reason", "flag", "summary")) {
            var draft = plan();
            var first = (ObjectNode) draft.path("stops").get(0);
            switch (change) {
                case "dates" -> draft.put("startDate", "2026-10-01").put("endDate", "2026-10-03");
                case "order" -> draft.putArray("stops").add(plan().path("stops").get(1)).add(first);
                case "location" -> first.put("latitude", 41.9029);
                case "reason" -> first.put("reason", "Changed draft idea");
                case "flag" -> first.put("bucketListMatch", false);
                case "summary" -> draft.put("summary", "Changed summary");
                default -> throw new AssertionError(change);
            }
            var response = apply(draft, key);
            assertThat(response.statusCode()).as(change + ": " + response.body()).isEqualTo(409);
            assertThat(body(response).path("code").asText()).isEqualTo("CONFLICT");
        }
        assertThat(tripCount()).isEqualTo(1);
        verify(search, never()).searchCities(any());
    }

    @Test
    void rejectsMalformedDraftsAndBoundsBeforeSearchOrWrites() throws Exception {
        for (String field : List.of("title", "summary", "destinationSummary")) {
            var draft = plan();
            draft.put(field, " ".repeat(2000));
            assertInvalid(draft);
        }
        var badDates = plan().put("startDate", "2026-10-03").put("endDate", "2026-10-01");
        assertInvalid(badDates);
        assertInvalid(plan().put("durationDays", 4));
        assertInvalid(plan().put("startDate", "2026-10-01"));
        var manyStops = plan();
        var stops = manyStops.putArray("stops");
        for (int i = 0; i < 13; i++) stops.add(plan().path("stops").get(0));
        assertInvalid(manyStops);
        var extremeScale = plan();
        ((ObjectNode) extremeScale.path("stops").get(0)).put("latitude", new BigDecimal("1E-100000"));
        assertInvalid(extremeScale);
        assertThat(post(APPLY, "{\"plan\":null,\"requestId\":\"not-a-uuid\"}").statusCode()).isEqualTo(400);
        verify(search, never()).searchCities(any());
        assertThat(tripCount()).isZero();
    }

    @Test
    void rejectsNullRequiredFieldsAndNullCollectionEntriesWithControlled400() throws Exception {
        UUID key = UUID.randomUUID();
        assertThat(post(APPLY, "{\"plan\":null,\"requestId\":\"" + key + "\"}").statusCode()).isEqualTo(400);
        assertThat(post(APPLY, "{\"plan\":" + plan() + "}").statusCode()).isEqualTo(400);
        assertInvalid(plan().put("ownerId", UUID.randomUUID().toString()));
        assertInvalid(plan().putNull("stops"));
        assertInvalid(plan().put("durationDays", 0));
        assertInvalid(plan().put("durationDays", 61));
        for (String collection : List.of("stops", "considerations", "sourcesUsed", "activities")) {
            var draft = plan();
            var parent = collection.equals("activities") ? (ObjectNode) draft.path("stops").get(0) : draft;
            parent.putArray(collection).addNull();
            assertInvalid(draft);
        }
        verify(search, never()).searchCities(any());
        assertThat(tripCount()).isZero();
        assertThat(ledgerCount(key)).isZero();
    }

    @Test
    void rejectsTamperedLocationNameCountryAndDuplicateCanonicalPlace() throws Exception {
        for (String field : List.of("cityName", "countryName", "countryCode", "latitude")) {
            var draft = plan();
            ObjectNode stop = (ObjectNode) draft.path("stops").get(0);
            if (field.equals("latitude")) stop.put(field, 41.9029);
            else stop.put(field, field.equals("countryCode") ? "FR" : "France");
            var response = apply(draft, UUID.randomUUID());
            assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
            assertThat(body(response).path("code").asText()).isEqualTo("PLACE_UNRESOLVED");
        }
        var duplicate = plan();
        ObjectNode second = (ObjectNode) duplicate.path("stops").get(1);
        second.put("cityName", " rOME ").put("latitude", 41.9028001).put("longitude", 12.4964001);
        assertInvalid(duplicate);
        assertThat(tripCount()).isZero();
    }

    @Test
    void failedPlaceVerificationAndSearchOutageLeaveTheSameKeyRetryable() throws Exception {
        UUID key = UUID.randomUUID();
        var place = new CitySearchResult("Braga", "Portugal", null, "PT",
                new BigDecimal("41.5454"), new BigDecimal("-8.4265"));
        var draft = planWithPlace(place);
        when(search.searchCities(place.name())).thenReturn(List.of())
                .thenThrow(new GeocodingUnavailableException(new IllegalStateException("private provider details")))
                .thenReturn(List.of(place));
        var unresolved = apply(draft, key);
        assertThat(unresolved.statusCode()).isEqualTo(400);
        assertThat(body(unresolved).path("code").asText()).isEqualTo("PLACE_UNRESOLVED");
        assertThat(ledgerCount(key)).isZero();
        var unavailable = apply(draft, key);
        assertThat(unavailable.statusCode()).isEqualTo(503);
        assertThat(body(unavailable).path("code").asText()).isEqualTo("GEOCODING_UNAVAILABLE");
        assertThat(unavailable.body()).doesNotContain("private provider details", "Braga");
        assertThat(ledgerCount(key)).isZero();
        assertThat(tripCount()).isZero();
        assertThat(apply(draft, key).statusCode()).isEqualTo(200);
        assertThat(tripCount()).isEqualTo(1);
        assertThat(ledgerCount(key)).isEqualTo(1);
    }

    @Test
    void reResolvesNewPlacesAndEnrichesAnUnlocatedCityWithoutMovingLocatedCities() throws Exception {
        var unlocated = cities.saveAndFlush(new City(countries.findById("PT").orElseThrow(), "Coimbra"));
        var choice = new CitySearchResult("Coimbra", "Portugal", null, "PT",
                new BigDecimal("40.2033"), new BigDecimal("-8.4103"));
        when(search.searchCities("Coimbra")).thenReturn(List.of(choice));
        var draft = plan();
        ((ObjectNode) draft.path("stops").get(1)).put("cityName", "Coimbra").put("countryCode", "PT")
                .put("countryName", "Portugal").put("latitude", choice.latitude()).put("longitude", choice.longitude());
        var response = apply(draft, UUID.randomUUID());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        assertThat(body(response).path("stops").get(1).path("city").path("id").asText())
                .isEqualTo(unlocated.getId().toString());
        assertThat(cities.findById(unlocated.getId()).orElseThrow().getLatitude()).isEqualByComparingTo("40.2033");
        assertThat(cities.findById(rome.getId()).orElseThrow().getLatitude()).isEqualByComparingTo("41.9028");
    }

    @Test
    void createsNewCanonicalPlaceFromSearchAndReusesItOnAnotherApply() throws Exception {
        var choice = new CitySearchResult("Utrecht", "Netherlands", null, "NL",
                new BigDecimal("52.090737"), new BigDecimal("5.121420"));
        when(search.searchCities("Utrecht")).thenReturn(List.of(choice));
        var draft = plan();
        ((ObjectNode) draft.path("stops").get(1)).put("cityName", choice.name()).put("countryCode", choice.countryCode())
                .put("countryName", choice.countryName()).put("latitude", choice.latitude()).put("longitude", choice.longitude());
        var first = apply(draft, UUID.randomUUID());
        assertThat(first.statusCode()).as(first.body()).isEqualTo(200);
        var second = apply(draft, UUID.randomUUID());
        assertThat(second.statusCode()).as(second.body()).isEqualTo(200);
        assertThat(body(second).path("stops").get(1).path("city").path("id"))
                .isEqualTo(body(first).path("stops").get(1).path("city").path("id"));
    }

    @Test
    void secondStopDatabaseFailureRollsBackJourneyStopsAndKeyAndAllowsRetry(CapturedOutput output) throws Exception {
        UUID key = UUID.randomUUID();
        var draft = plan().put("title", "Rollback itinerary");
        var choice = new CitySearchResult("Aveiro", "Portugal", null, "PT",
                new BigDecimal("40.640496"), new BigDecimal("-8.653784"));
        when(search.searchCities("Aveiro")).thenReturn(List.of(choice));
        ((ObjectNode) draft.path("stops").get(1)).put("cityName", choice.name()).put("countryCode", choice.countryCode())
                .put("countryName", choice.countryName()).put("latitude", choice.latitude()).put("longitude", choice.longitude());
        jdbc.sql("""
                CREATE FUNCTION test_apply_stop_failure() RETURNS trigger LANGUAGE plpgsql AS $$
                BEGIN
                  IF NEW.position = 2 AND EXISTS
                    (SELECT 1 FROM trips WHERE id = NEW.trip_id AND name = 'Rollback itinerary') THEN
                    IF NOT EXISTS (SELECT 1 FROM trip_stops WHERE trip_id = NEW.trip_id AND position = 1)
                       OR NOT EXISTS (SELECT 1 FROM cities WHERE id = NEW.city_id AND normalized_name = 'aveiro') THEN
                      RAISE EXCEPTION 'Rollback test precondition not reached';
                    END IF;
                    RAISE EXCEPTION 'Injected failure after first stop and new city';
                  END IF;
                  RETURN NEW;
                END $$
                """).update();
        jdbc.sql("""
                CREATE TRIGGER test_apply_stop_failure BEFORE INSERT ON trip_stops
                FOR EACH ROW EXECUTE FUNCTION test_apply_stop_failure()
                """).update();
        try {
            var response = apply(draft, key);
            assertThat(response.statusCode()).as(response.body()).isEqualTo(503);
            assertThat(body(response).path("code").asText()).isEqualTo("APPLY_UNAVAILABLE");
            assertThat(output.getAll()).contains("Injected failure after first stop and new city")
                    .doesNotContain("Rollback test precondition not reached");
            assertThat(tripCount()).isZero();
            assertThat(ledgerCount(key)).isZero();
            assertThat(cities.findByIdentity("PT", "aveiro", choice.latitude(), choice.longitude())).isEmpty();
            assertThat(jdbc.sql("SELECT count(*) FROM trip_stops s JOIN trips t ON t.id=s.trip_id WHERE t.user_id=:owner")
                    .param("owner", currentUser.getId()).query(Long.class).single()).isZero();
        } finally {
            jdbc.sql("DROP TRIGGER test_apply_stop_failure ON trip_stops").update();
            jdbc.sql("DROP FUNCTION test_apply_stop_failure()").update();
        }
        assertThat(apply(draft, key).statusCode()).isEqualTo(200);
        assertThat(tripCount()).isEqualTo(1);
    }

    @Test
    void sameNameCitiesInDifferentCountriesAndUsLocationsSurvivePersistenceIndependently() throws Exception {
        var alabama = known("Florence", "US", "34.7998", "-87.6773");
        var carolina = known("Florence", "US", "34.1954", "-79.7626");
        var draft = plan();
        var stops = draft.putArray("stops");
        for (City city : List.of(florence, alabama, carolina)) {
            var stop = plan().path("stops").get(1).deepCopy();
            ((ObjectNode) stop).put("cityName", city.getName()).put("countryCode", city.getCountry().getCode())
                    .put("countryName", city.getCountry().getName()).put("latitude", city.getLatitude())
                    .put("longitude", city.getLongitude());
            stops.add(stop);
        }
        var response = apply(draft, UUID.randomUUID());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        var persisted = body(get("/api/trips/" + body(response).path("id").asText()));
        assertThat(persisted.path("stops")).extracting(stop -> stop.path("city").path("id").asText())
                .containsExactly(florence.getId().toString(), alabama.getId().toString(), carolina.getId().toString());
        assertThat(cities.findById(alabama.getId()).orElseThrow().getLatitude()).isEqualByComparingTo("34.7998");
        assertThat(cities.findById(carolina.getId()).orElseThrow().getLatitude()).isEqualByComparingTo("34.1954");
    }

    @Test
    void rejectsAliasedCitiesAtTheSamePhysicalCoordinates() throws Exception {
        known("Roma", "IT", "41.9028", "12.4964");
        var draft = plan();
        ((ObjectNode) draft.path("stops").get(1)).put("cityName", "Roma").put("latitude", 41.9028).put("longitude", 12.4964);
        assertInvalid(draft);
        assertThat(tripCount()).isZero();
    }

    @Test
    void requiresAuthenticationAndCsrf() throws Exception {
        var anonymous = new Session();
        assertThat(anonymous.post(APPLY, requestBody(plan(), UUID.randomUUID())).statusCode()).isEqualTo(401);
        for (boolean wrong : List.of(false, true)) {
            var builder = authenticatedRequest(APPLY).header("Content-Type", "application/json");
            if (wrong) builder.header("X-XSRF-TOKEN", "wrong");
            var request = builder.POST(HttpRequest.BodyPublishers.ofString(requestBody(plan(), UUID.randomUUID()))).build();
            assertThat(httpClient.send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(403);
        }
        assertThat(tripCount()).isZero();
    }

    @Test
    void aliceAndBobOwnSeparateJourneysEvenWithTheSameRequestIdAndSharedCity() throws Exception {
        UUID key = UUID.randomUUID();
        var aliceTrip = body(apply(plan(), key));
        String aliceId = aliceTrip.path("id").asText();
        var bob = new Session();
        var registration = bob.post("/api/auth/register", """
                {"email":"bob-apply-%s@example.com","password":"correct horse","displayName":"Bob"}
                """.formatted(UUID.randomUUID()));
        assertThat(registration.statusCode()).isEqualTo(201);
        assertThat(bob.get("/api/trips/" + aliceId).statusCode()).isEqualTo(404);
        assertThat(bob.post("/api/trips/" + aliceId + "/stops",
                "{\"cityName\":\"Rome\",\"countryCode\":\"IT\"}").statusCode()).isEqualTo(404);
        assertThat(body(bob.get("/api/trips"))).isEmpty();
        assertThat(body(bob.get("/api/trips/map-overview")).path("markers")).isEmpty();
        assertThat(body(bob.get("/api/travel-profile")).path("journeyCount").asInt()).isZero();
        var response = bob.post(APPLY, requestBody(plan(), key));
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        var bobTrip = body(response);
        assertThat(bobTrip.path("id")).isNotEqualTo(aliceTrip.path("id"));
        assertThat(ownerOf(bobTrip.path("id").asText())).isNotEqualTo(currentUser.getId());
        assertThat(bobTrip.path("stops").get(0).path("city").path("id"))
                .isEqualTo(aliceTrip.path("stops").get(0).path("city").path("id"));
        assertThat(get("/api/trips/" + bobTrip.path("id").asText()).statusCode()).isEqualTo(404);
    }

    private void assertInvalid(ObjectNode plan) throws Exception {
        var response = apply(plan, UUID.randomUUID());
        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(body(response).path("code").asText()).isEqualTo("INVALID_REQUEST");
    }

    private void awaitBlockedQueries(String pattern, int expected) {
        await().atMost(Duration.ofSeconds(10)).untilAsserted(() -> assertThat(jdbc.sql("""
                SELECT count(*) FROM pg_stat_activity
                WHERE pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query ILIKE :pattern
                """).param("pattern", pattern).query(Long.class).single()).isEqualTo(expected));
    }

    private ObjectNode planWithPlace(CitySearchResult place) {
        var draft = plan();
        ((ObjectNode) draft.path("stops").get(1)).put("cityName", place.name()).put("countryCode", place.countryCode())
                .put("countryName", place.countryName()).put("latitude", place.latitude()).put("longitude", place.longitude());
        return draft;
    }

    private City known(String name, String code, String lat, String lon) {
        var location = new CityLocation(new BigDecimal(lat), new BigDecimal(lon));
        City city = cities.findByIdentity(code, City.normalizeName(name), location.latitude(), location.longitude())
                .orElseGet(() -> cities.saveAndFlush(new City(countries.findById(code).orElseThrow(), name, location)));
        return cities.findByIdWithCountry(city.getId()).orElseThrow();
    }

    private long tripCount() {
        return jdbc.sql("SELECT count(*) FROM trips WHERE user_id=:owner").param("owner", currentUser.getId())
                .query(Long.class).single();
    }

    private long ledgerCount(UUID key) {
        return jdbc.sql("SELECT count(*) FROM trip_plan_apply_requests WHERE user_id=:owner AND request_id=:key")
                .param("owner", currentUser.getId()).param("key", key).query(Long.class).single();
    }

    private UUID ownerOf(String tripId) {
        return jdbc.sql("SELECT user_id FROM trips WHERE id=:id").param("id", UUID.fromString(tripId))
                .query(UUID.class).single();
    }

    private ObjectNode plan() {
        return (ObjectNode) objectMapper.readTree("""
                {"title":"Italy review","summary":"Ideas only","durationDays":3,"startDate":null,"endDate":null,
                 "destinationSummary":"Italy","pace":"RELAXED","stops":[
                 {"cityName":"Rome","countryCode":"IT","countryName":"Italy","latitude":41.9028,"longitude":12.4964,
                  "daysAtStop":2,"reason":"History","activities":["Walk"],"bucketListMatch":true,"alreadyVisited":true},
                 {"cityName":"Florence","countryCode":"IT","countryName":"Italy","latitude":43.7696,"longitude":11.2558,
                  "daysAtStop":1,"reason":"Art","activities":[],"bucketListMatch":false,"alreadyVisited":true}],
                 "considerations":["Draft only"],"sourcesUsed":["Weather"]}
                """);
    }

    private JsonNode body(HttpResponse<String> response) { return objectMapper.readTree(response.body()); }

    private String requestBody(JsonNode plan, UUID key) {
        return "{\"requestId\":\"" + key + "\",\"plan\":" + plan + "}";
    }

    private HttpRequest applyRequest(JsonNode plan, UUID key) {
        return csrf(authenticatedRequest(APPLY)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(requestBody(plan, key))).build();
    }

    private HttpResponse<String> apply(JsonNode plan, UUID key) throws Exception {
        return httpClient.send(applyRequest(plan, key), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> post(String path, String body) throws Exception {
        return httpClient.send(csrf(authenticatedRequest(path)).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> get(String path) throws Exception {
        return httpClient.send(authenticatedRequest(path).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private final class Session {
        private final CookieManager cookies = new CookieManager(null, CookiePolicy.ACCEPT_ALL);
        private final HttpClient client = HttpClient.newBuilder().cookieHandler(cookies).build();

        HttpResponse<String> get(String path) throws Exception {
            return client.send(HttpRequest.newBuilder(uri(path)).GET().build(), HttpResponse.BodyHandlers.ofString());
        }

        HttpResponse<String> post(String path, String body) throws Exception {
            String header = TripPlanApplyApiIT.this.body(get("/api/auth/csrf")).path("headerName").asText();
            String token = cookies.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("XSRF-TOKEN"))
                    .findFirst().map(HttpCookie::getValue).orElseThrow();
            return client.send(HttpRequest.newBuilder(uri(path)).header(header, token)
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                    HttpResponse.BodyHandlers.ofString());
        }
    }
}
