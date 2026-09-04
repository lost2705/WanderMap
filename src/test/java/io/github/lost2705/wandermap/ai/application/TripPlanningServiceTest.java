package io.github.lost2705.wandermap.ai.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.lost2705.wandermap.ai.application.tool.GetBucketListTool;
import io.github.lost2705.wandermap.ai.application.tool.GetJourneysTool;
import io.github.lost2705.wandermap.ai.application.tool.GetTravelProfileTool;
import io.github.lost2705.wandermap.ai.application.tool.GetWeatherTool;
import io.github.lost2705.wandermap.ai.application.tool.SearchPlacesTool;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class TripPlanningServiceTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void reusesTheAgentLoopForPersonalFactsPlaceResolutionAndStructuredOutput() {
        ScriptedModel model = new ScriptedModel(
                call("profile", GetTravelProfileTool.NAME),
                call("journeys", GetJourneysTool.NAME),
                call("places", SearchPlacesTool.NAME),
                AiModelResponse.finalAnswer(planJson("Rome", "IT", "Italy", "41.9028", "12.4964", true, false)));
        TripPlanningService service = service(
                model,
                tool(GetTravelProfileTool.NAME, Map.of("countryCount", 1)),
                tool(GetJourneysTool.NAME, journeys("Rome", "IT", "Italy", "41.9028", "12.4964")),
                tool(SearchPlacesTool.NAME, places("Rome", "IT", "Italy", "41.9028", "12.4964")));

        TripPlanningResult result = service.createDraft("Plan one relaxed day in Rome.");

        assertThat(result.plan().stops()).singleElement().satisfies(stop -> {
            assertThat(stop.cityName()).isEqualTo("Rome");
            assertThat(stop.alreadyVisited()).isTrue();
        });
        assertThat(result.plan().sourcesUsed())
                .containsExactly("Travel Profile", "Journeys", "Place Search");
        assertThat(result.toolsUsed())
                .containsExactly(GetTravelProfileTool.NAME, GetJourneysTool.NAME, SearchPlacesTool.NAME);
        assertThat(model.requests.getFirst().structuredOutput().name()).isEqualTo(TripPlanSchema.NAME);
        assertThat(model.requests.getFirst().messages().getFirst().content())
                .contains("RELAXED", "Resolve every proposed stop", "Do not claim or perform any database");
    }

    @Test
    void createsABucketListGroundedPlan() {
        ScriptedModel model = new ScriptedModel(
                call("bucket", GetBucketListTool.NAME),
                AiModelResponse.finalAnswer(planJson("Porto", "PT", "Portugal", "41.1579", "-8.6291", false, true)));
        GetBucketListTool.Result bucket = new GetBucketListTool.Result(List.of(new GetBucketListTool.Place(
                "Porto", "Portugal", "PT", decimal("41.1579"), decimal("-8.6291"), "want_to_visit")));

        TripPlanningResult result = service(model, tool(GetBucketListTool.NAME, bucket))
                .createDraft("Use my Bucket List.");

        assertThat(result.plan().stops().getFirst().bucketListMatch()).isTrue();
        assertThat(result.plan().sourcesUsed()).containsExactly("Bucket List");
    }

    @Test
    void carriesShortTermWeatherAsAnExplicitSource() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(
                        new AiToolCall("places", SearchPlacesTool.NAME, "{}"),
                        new AiToolCall("weather", GetWeatherTool.NAME, "{}")),
                AiModelResponse.finalAnswer(planJson("Rome", "IT", "Italy", "41.9028", "12.4964", false, false)));

        TripPlanningResult result = service(
                model,
                tool(SearchPlacesTool.NAME, places("Rome", "IT", "Italy", "41.9028", "12.4964")),
                tool(GetWeatherTool.NAME, Map.of("summary", "clear")))
                .createDraft("Plan Rome this week and check the weather.");

        assertThat(result.plan().sourcesUsed()).containsExactly("Place Search", "Weather");
    }

    @Test
    void distantDatePlanningDoesNotRequireAWeatherCall() {
        ScriptedModel model = new ScriptedModel(
                call("places", SearchPlacesTool.NAME),
                AiModelResponse.finalAnswer(planJsonWithConsideration(
                        "Rome", "IT", "Italy", "41.9028", "12.4964",
                        "Exact October weather is not available yet.")));

        TripPlanningResult result = service(
                model,
                tool(SearchPlacesTool.NAME, places("Rome", "IT", "Italy", "41.9028", "12.4964")))
                .createDraft("Plan Rome next October.");

        assertThat(result.toolsUsed()).doesNotContain(GetWeatherTool.NAME);
        assertThat(result.plan().considerations()).contains("Exact October weather is not available yet.");
    }

    @Test
    void rejectsInvalidStructuredOutputWithoutRepairRetry() {
        ScriptedModel model = new ScriptedModel(AiModelResponse.finalAnswer("""
                {"title":"Broken","summary":"Broken","durationDays":1,"startDate":null,"endDate":null,
                 "destinationSummary":"Nowhere","pace":"RELAXED","stops":[],"considerations":[],"sourcesUsed":[]}
                """));

        assertThatThrownBy(() -> service(model).createDraft("Make a plan."))
                .isInstanceOf(InvalidTripPlanException.class);
        assertThat(model.requests).hasSize(1);
    }

    @Test
    void rejectsMalformedStructuredOutputWithoutExposingOrRetryingIt() {
        ScriptedModel model = new ScriptedModel(AiModelResponse.finalAnswer("not-json-personal-data"));

        assertThatThrownBy(() -> service(model).createDraft("Make a plan."))
                .isInstanceOf(InvalidTripPlanException.class)
                .hasMessage("AI provider returned an invalid trip plan")
                .hasMessageNotContaining("personal-data");
        assertThat(model.requests).hasSize(1);
    }

    @Test
    void canFinishFromJourneyFactsWhenPlaceSearchFails() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(
                        new AiToolCall("journeys", GetJourneysTool.NAME, "{}"),
                        new AiToolCall("places", SearchPlacesTool.NAME, "{}")),
                AiModelResponse.finalAnswer(planJson("Rome", "IT", "Italy", "41.9028", "12.4964", true, false)));
        TravelAgentTool failingSearch = new FixedTool(SearchPlacesTool.NAME, null, true);

        TripPlanningResult result = service(
                model,
                tool(GetJourneysTool.NAME, journeys("Rome", "IT", "Italy", "41.9028", "12.4964")),
                failingSearch)
                .createDraft("Plan somewhere I know even if search is unavailable.");

        assertThat(result.plan().sourcesUsed()).containsExactly("Journeys");
        assertThat(result.toolsUsed()).containsExactly(GetJourneysTool.NAME, SearchPlacesTool.NAME);
    }

    @Test
    void planningKeepsTheExistingToolCallLimit() {
        AiToolCall[] calls = IntStream.rangeClosed(1, 13)
                .mapToObj(index -> new AiToolCall("call-" + index, GetTravelProfileTool.NAME, "{}"))
                .toArray(AiToolCall[]::new);
        ScriptedModel model = new ScriptedModel(AiModelResponse.toolCalls(calls));

        assertThatThrownBy(() -> service(model, tool(GetTravelProfileTool.NAME, Map.of()))
                .createDraft("Use every tool."))
                .isInstanceOf(AgentToolCallLimitException.class);
    }

    @Test
    void refinementModifiesRequestedFieldsAndPreservesUnaffectedContent() throws Exception {
        TripPlanDraft current = draft(
                "Italy week",
                "Food and architecture.",
                7,
                null,
                null,
                TripPlanPace.BALANCED,
                List.of(
                        stop("Rome", "IT", "Italy", "41.9028", "12.4964", 3),
                        stop("Florence", "IT", "Italy", "43.7696", "11.2558", 2),
                        stop("Bologna", "IT", "Italy", "44.4949", "11.3426", 2)));
        TripPlanDraft refined = draft(
                "Italy week",
                "Food and architecture.",
                7,
                null,
                null,
                TripPlanPace.RELAXED,
                List.of(
                        stop("Rome", "IT", "Italy", "41.9028", "12.4964", 3),
                        stop("Florence", "IT", "Italy", "43.7696", "11.2558", 4)));
        ScriptedModel model = refinementModel(refined);

        TripPlanningResult result = refinementService(model)
                .refineDraft(current, "Remove Bologna, make it relaxed, and give Florence another two days.");

        assertThat(result.plan().title()).isEqualTo(current.title());
        assertThat(result.plan().summary()).isEqualTo(current.summary());
        assertThat(result.plan().pace()).isEqualTo(TripPlanPace.RELAXED);
        assertThat(result.plan().stops()).extracting(TripPlanStop::cityName)
                .containsExactly("Rome", "Florence");
        assertThat(result.plan().stops()).extracting(TripPlanStop::daysAtStop)
                .containsExactly(3, 4);
        assertThat(model.requests).hasSize(2);
        assertRefinementContract(model.requests.getFirst());
    }

    @Test
    void refinementCanResolveANewPlaceAcrossMultipleToolCallIterations() throws Exception {
        TripPlanDraft current = oneDayDraft("Rome", "IT", "Italy", "41.9028", "12.4964");
        TripPlanDraft refined = draft(
                "Rome and Paris",
                current.summary(),
                2,
                null,
                null,
                TripPlanPace.BALANCED,
                List.of(
                        stop("Rome", "IT", "Italy", "41.9028", "12.4964", 1),
                        stop("Paris", "FR", "France", "48.8566", "2.3522", 1)));
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(
                        new AiToolCall("journeys", GetJourneysTool.NAME, "{}"),
                        new AiToolCall("bucket", GetBucketListTool.NAME, "{}")),
                call("rome", SearchPlacesTool.NAME),
                call("paris", SearchPlacesTool.NAME),
                AiModelResponse.finalAnswer(json(refined)));

        TripPlanningResult result = service(
                model,
                tool(GetJourneysTool.NAME, new GetJourneysTool.Result(List.of())),
                tool(GetBucketListTool.NAME, new GetBucketListTool.Result(List.of())),
                tool(SearchPlacesTool.NAME, places(List.of(
                        place("Rome", "IT", "Italy", "41.9028", "12.4964"),
                        place("Paris", "FR", "France", "48.8566", "2.3522")))))
                .refineDraft(current, "Add Paris at the end.");

        assertThat(result.plan().stops()).extracting(TripPlanStop::cityName)
                .containsExactly("Rome", "Paris");
        assertThat(result.toolsUsed()).containsExactly(
                GetJourneysTool.NAME, GetBucketListTool.NAME, SearchPlacesTool.NAME);
        assertThat(model.requests).hasSize(4);
    }

    @Test
    void refinementSupportsCoherentDurationAndInclusiveDateChanges() throws Exception {
        TripPlanDraft current = oneDayDraft("Rome", "IT", "Italy", "41.9028", "12.4964");
        TripPlanDraft refined = draft(
                current.title(),
                current.summary(),
                7,
                LocalDate.of(2026, 10, 10),
                LocalDate.of(2026, 10, 16),
                current.pace(),
                List.of(stop("Rome", "IT", "Italy", "41.9028", "12.4964", 7)));
        ScriptedModel model = refinementModel(refined);

        TripPlanDraft result = refinementService(model)
                .refineDraft(current, "Move this to October 10-16 and make it seven days.")
                .plan();

        assertThat(result.durationDays()).isEqualTo(7);
        assertThat(result.startDate()).isEqualTo(LocalDate.of(2026, 10, 10));
        assertThat(result.endDate()).isEqualTo(LocalDate.of(2026, 10, 16));
        assertThat(result.stops().getFirst().daysAtStop()).isEqualTo(7);
    }

    @Test
    void refinementReestablishesBucketAndVisitedFlagsAndIgnoresClientSources() throws Exception {
        TripPlanDraft clientDraft = new TripPlanDraft(
                "Porto",
                "A proposal.",
                1,
                null,
                null,
                "Porto",
                TripPlanPace.RELAXED,
                List.of(new TripPlanStop(
                        "Porto", "PT", "Portugal", decimal("41.1579"), decimal("-8.6291"), 1,
                        "A good fit.", List.of("Walk"), false, true)),
                List.of("Keep it calm."),
                List.of("Weather"));
        TripPlanDraft modelDraft = draft(
                clientDraft.title(), clientDraft.summary(), 1, null, null, TripPlanPace.RELAXED,
                List.of(new TripPlanStop(
                        "Porto", "PT", "Portugal", decimal("41.1579"), decimal("-8.6291"), 1,
                        "A good fit.", List.of("Walk"), true, false)));
        GetBucketListTool.Result bucket = new GetBucketListTool.Result(List.of(new GetBucketListTool.Place(
                "Porto", "Portugal", "PT", decimal("41.1579"), decimal("-8.6291"), "want_to_visit")));
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(
                        new AiToolCall("journeys", GetJourneysTool.NAME, "{}"),
                        new AiToolCall("bucket", GetBucketListTool.NAME, "{}")),
                AiModelResponse.finalAnswer(json(modelDraft)));

        TripPlanningResult result = service(
                model,
                tool(GetJourneysTool.NAME, new GetJourneysTool.Result(List.of())),
                tool(GetBucketListTool.NAME, bucket))
                .refineDraft(clientDraft, "Keep Porto but use my current personal context.");

        assertThat(result.plan().stops().getFirst().bucketListMatch()).isTrue();
        assertThat(result.plan().stops().getFirst().alreadyVisited()).isFalse();
        assertThat(result.plan().sourcesUsed()).containsExactly("Journeys", "Bucket List");
        String currentDraftContext = model.requests.getFirst().messages().get(1).content();
        assertThat(currentDraftContext)
                .doesNotContain("sourcesUsed", "bucketListMatch", "alreadyVisited", "Weather");
    }

    @Test
    void refinementCanAvoidVisitedPlacesUsingFreshJourneyEvidence() throws Exception {
        TripPlanDraft current = oneDayDraft("Rome", "IT", "Italy", "41.9028", "12.4964");
        TripPlanDraft refined = oneDayDraft("Paris", "FR", "France", "48.8566", "2.3522");
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(
                        new AiToolCall("journeys", GetJourneysTool.NAME, "{}"),
                        new AiToolCall("bucket", GetBucketListTool.NAME, "{}"),
                        new AiToolCall("search", SearchPlacesTool.NAME, "{}")),
                AiModelResponse.finalAnswer(json(refined)));

        TripPlanningResult result = service(
                model,
                tool(GetJourneysTool.NAME, journeys("Rome", "IT", "Italy", "41.9028", "12.4964")),
                tool(GetBucketListTool.NAME, new GetBucketListTool.Result(List.of())),
                tool(SearchPlacesTool.NAME, places("Paris", "FR", "France", "48.8566", "2.3522")))
                .refineDraft(current, "Remove all visited cities and suggest a resolved alternative.");

        assertThat(result.plan().stops()).singleElement().satisfies(stop -> {
            assertThat(stop.cityName()).isEqualTo("Paris");
            assertThat(stop.alreadyVisited()).isFalse();
        });
    }

    @Test
    void refinementRejectsAnInvalidClientDraftBeforeCallingTheModel() {
        TripPlanDraft invalid = draft(
                "Broken", "Broken", 5, null, null, TripPlanPace.BALANCED,
                List.of(stop("Rome", "IT", "Italy", "41.9028", "12.4964", 1)));
        ScriptedModel model = new ScriptedModel(AiModelResponse.finalAnswer("unused"));

        assertThatThrownBy(() -> refinementService(model).refineDraft(invalid, "Fix it."))
                .isInstanceOf(InvalidTripPlanRequestException.class);
        assertThat(model.requests).isEmpty();
    }

    @Test
    void refinementRejectsUnresolvedPlacesAndMissingPersonalEvidenceWithoutRepairRetry() throws Exception {
        TripPlanDraft current = oneDayDraft("Rome", "IT", "Italy", "41.9028", "12.4964");
        TripPlanDraft paris = oneDayDraft("Paris", "FR", "France", "48.8566", "2.3522");
        ScriptedModel unresolved = new ScriptedModel(
                AiModelResponse.toolCalls(
                        new AiToolCall("journeys", GetJourneysTool.NAME, "{}"),
                        new AiToolCall("bucket", GetBucketListTool.NAME, "{}"),
                        new AiToolCall("search", SearchPlacesTool.NAME, "{}")),
                AiModelResponse.finalAnswer(json(paris)));
        TravelAgentTool failingSearch = new FixedTool(SearchPlacesTool.NAME, null, true);

        assertThatThrownBy(() -> service(
                        unresolved,
                        tool(GetJourneysTool.NAME, new GetJourneysTool.Result(List.of())),
                        tool(GetBucketListTool.NAME, new GetBucketListTool.Result(List.of())),
                        failingSearch)
                .refineDraft(current, "Replace Rome with Paris."))
                .isInstanceOf(InvalidTripPlanException.class);
        assertThat(unresolved.requests).hasSize(2);

        ScriptedModel missingPersonalEvidence = new ScriptedModel(
                call("search", SearchPlacesTool.NAME),
                AiModelResponse.finalAnswer(json(current)));
        assertThatThrownBy(() -> service(
                        missingPersonalEvidence,
                        tool(SearchPlacesTool.NAME, places("Rome", "IT", "Italy", "41.9028", "12.4964")))
                .refineDraft(current, "Keep it."))
                .isInstanceOf(InvalidTripPlanException.class)
                .hasMessageContaining("re-establish");
        assertThat(missingPersonalEvidence.requests).hasSize(2);
    }

    @Test
    void refinementRejectsInvalidModelOutputWithoutHiddenRepair() {
        TripPlanDraft current = oneDayDraft("Rome", "IT", "Italy", "41.9028", "12.4964");
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(
                        new AiToolCall("journeys", GetJourneysTool.NAME, "{}"),
                        new AiToolCall("bucket", GetBucketListTool.NAME, "{}")),
                AiModelResponse.finalAnswer("not-json-private-output"));

        assertThatThrownBy(() -> service(
                        model,
                        tool(GetJourneysTool.NAME, new GetJourneysTool.Result(List.of())),
                        tool(GetBucketListTool.NAME, new GetBucketListTool.Result(List.of())))
                .refineDraft(current, "Change it."))
                .isInstanceOf(InvalidTripPlanException.class)
                .hasMessageNotContaining("private-output");
        assertThat(model.requests).hasSize(2);
    }

    private TripPlanningService service(ScriptedModel model, TravelAgentTool... tools) {
        TravelAgent agent = new TravelAgent(model, objectMapper, List.of(tools), 6, 12, 100_000);
        return new TripPlanningService(agent, new TripPlanValidator(), objectMapper);
    }

    private TripPlanningService refinementService(ScriptedModel model) {
        return service(
                model,
                tool(GetTravelProfileTool.NAME, Map.of()),
                tool(GetJourneysTool.NAME, new GetJourneysTool.Result(List.of())),
                tool(GetBucketListTool.NAME, new GetBucketListTool.Result(List.of())),
                tool(GetWeatherTool.NAME, Map.of()),
                tool(SearchPlacesTool.NAME, places(List.of(
                        place("Rome", "IT", "Italy", "41.9028", "12.4964"),
                        place("Florence", "IT", "Italy", "43.7696", "11.2558"),
                        place("Bologna", "IT", "Italy", "44.4949", "11.3426")))));
    }

    private ScriptedModel refinementModel(TripPlanDraft plan) throws Exception {
        return new ScriptedModel(
                AiModelResponse.toolCalls(
                        new AiToolCall("journeys", GetJourneysTool.NAME, "{}"),
                        new AiToolCall("bucket", GetBucketListTool.NAME, "{}"),
                        new AiToolCall("places", SearchPlacesTool.NAME, "{}")),
                AiModelResponse.finalAnswer(json(plan)));
    }

    private static void assertRefinementContract(AiModelRequest request) {
        assertThat(request.structuredOutput().name()).isEqualTo(TripPlanSchema.NAME);
        assertThat(request.tools()).extracting(AiToolDefinition::name)
                .contains(GetTravelProfileTool.NAME, GetJourneysTool.NAME, GetBucketListTool.NAME,
                        GetWeatherTool.NAME, SearchPlacesTool.NAME);
        assertThat(request.messages().getFirst().content())
                .contains("untrusted", "get_journeys", "get_bucket_list", "read-only")
                .doesNotContain("wander-map-trip-planner-v1");
        assertThat(request.messages().get(1).content()).contains("Current draft proposal", "Italy week");
        assertThat(request.messages().get(2).content()).contains("Refinement instruction", "Remove Bologna");
    }

    private static TripPlanDraft oneDayDraft(
            String city, String countryCode, String country, String latitude, String longitude) {
        return draft(
                "A calm draft", "A grounded plan.", 1, null, null, TripPlanPace.RELAXED,
                List.of(stop(city, countryCode, country, latitude, longitude, 1)));
    }

    private static TripPlanDraft draft(
            String title,
            String summary,
            int durationDays,
            LocalDate startDate,
            LocalDate endDate,
            TripPlanPace pace,
            List<TripPlanStop> stops) {
        return new TripPlanDraft(
                title,
                summary,
                durationDays,
                startDate,
                endDate,
                stops.stream().map(TripPlanStop::countryName).distinct().reduce((left, right) -> left + " and " + right)
                        .orElse("Trip"),
                pace,
                stops,
                List.of("Pack light."),
                List.of());
    }

    private static TripPlanStop stop(
            String city,
            String countryCode,
            String country,
            String latitude,
            String longitude,
            int days) {
        return new TripPlanStop(
                city,
                countryCode,
                country,
                decimal(latitude),
                decimal(longitude),
                days,
                "It fits the request.",
                List.of("Architecture"),
                false,
                false);
    }

    private static SearchPlacesTool.Place place(
            String city, String countryCode, String country, String latitude, String longitude) {
        return new SearchPlacesTool.Place(
                city, country, null, countryCode, decimal(latitude), decimal(longitude));
    }

    private static SearchPlacesTool.Result places(List<SearchPlacesTool.Place> places) {
        return new SearchPlacesTool.Result(places);
    }

    private String json(TripPlanDraft draft) throws Exception {
        return objectMapper.writeValueAsString(draft);
    }

    private static AiModelResponse call(String id, String name) {
        return AiModelResponse.toolCalls(new AiToolCall(id, name, "{}"));
    }

    private static TravelAgentTool tool(String name, Object result) {
        return new FixedTool(name, result, false);
    }

    private static GetJourneysTool.Result journeys(
            String city, String countryCode, String country, String latitude, String longitude) {
        return new GetJourneysTool.Result(List.of(new GetJourneysTool.Journey(
                "Known journey", null, null, List.of(new GetJourneysTool.Stop(
                        city, country, countryCode, decimal(latitude), decimal(longitude))))));
    }

    private static SearchPlacesTool.Result places(
            String city, String countryCode, String country, String latitude, String longitude) {
        return new SearchPlacesTool.Result(List.of(new SearchPlacesTool.Place(
                city, country, null, countryCode, decimal(latitude), decimal(longitude))));
    }

    private static String planJson(
            String city,
            String countryCode,
            String country,
            String latitude,
            String longitude,
            boolean visited,
            boolean bucket) {
        return planJsonWithConsideration(city, countryCode, country, latitude, longitude, "Pack light.")
                .replace("\"alreadyVisited\":false", "\"alreadyVisited\":" + visited)
                .replace("\"bucketListMatch\":false", "\"bucketListMatch\":" + bucket);
    }

    private static String planJsonWithConsideration(
            String city,
            String countryCode,
            String country,
            String latitude,
            String longitude,
            String consideration) {
        return """
                {"title":"A calm draft","summary":"A grounded plan.","durationDays":1,
                 "startDate":null,"endDate":null,"destinationSummary":"%s",
                 "pace":"RELAXED","stops":[{"cityName":"%s","countryCode":"%s",
                 "countryName":"%s","latitude":%s,"longitude":%s,"daysAtStop":1,
                 "reason":"It fits the request.","activities":["Architecture"],
                 "bucketListMatch":false,"alreadyVisited":false}],
                 "considerations":["%s"],"sourcesUsed":[]}
                """.formatted(country, city, countryCode, country, latitude, longitude, consideration);
    }

    private static BigDecimal decimal(String value) {
        return new BigDecimal(value);
    }

    private static final class ScriptedModel implements AiModelClient {
        private final Deque<AiModelResponse> responses;
        private final List<AiModelRequest> requests = new ArrayList<>();

        private ScriptedModel(AiModelResponse... responses) {
            this.responses = new ArrayDeque<>(List.of(responses));
        }

        @Override
        public AiModelResponse chat(AiModelRequest request) {
            requests.add(request);
            return responses.removeFirst();
        }
    }

    private static final class FixedTool implements TravelAgentTool {
        private final AiToolDefinition definition;
        private final Object result;
        private final boolean fails;

        private FixedTool(String name, Object result, boolean fails) {
            this.definition = new AiToolDefinition(name, "test", Map.of("type", "object"));
            this.result = result;
            this.fails = fails;
        }

        @Override
        public AiToolDefinition definition() {
            return definition;
        }

        @Override
        public Object execute(String argumentsJson) {
            if (fails) {
                throw new IllegalStateException("provider failure");
            }
            return result;
        }
    }
}
