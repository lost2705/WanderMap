package io.github.lost2705.wandermap.ai.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import io.github.lost2705.wandermap.ai.application.tool.GetBucketListTool;
import io.github.lost2705.wandermap.ai.application.tool.GetJourneysTool;
import io.github.lost2705.wandermap.ai.application.tool.GetTravelProfileTool;
import io.github.lost2705.wandermap.ai.application.tool.GetWeatherTool;
import io.github.lost2705.wandermap.ai.application.tool.SearchPlacesTool;
import java.math.BigDecimal;
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

    private TripPlanningService service(ScriptedModel model, TravelAgentTool... tools) {
        TravelAgent agent = new TravelAgent(model, objectMapper, List.of(tools), 6, 12, 100_000);
        return new TripPlanningService(agent, new TripPlanValidator(), objectMapper);
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
