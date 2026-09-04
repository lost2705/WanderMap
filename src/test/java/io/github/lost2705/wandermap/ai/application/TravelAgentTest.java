package io.github.lost2705.wandermap.ai.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class TravelAgentTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void returnsADirectFinalAnswerWithoutCallingTools() {
        ScriptedModel model = new ScriptedModel(AiModelResponse.finalAnswer("Try Lisbon."));
        RecordingTool tool = new RecordingTool("get_travel_profile", Map.of("countries", 3));

        TravelAgentResult result = agent(model, 6, tool).answer("Where next?");

        assertThat(result.answer()).isEqualTo("Try Lisbon.");
        assertThat(result.toolsUsed()).isEmpty();
        assertThat(tool.arguments).isEmpty();
        assertThat(model.requests).hasSize(1);
    }

    @Test
    void refinementSupportDoesNotChangeTheNormalAssistantContract() {
        ScriptedModel model = new ScriptedModel(AiModelResponse.finalAnswer("Try Lisbon."));

        TravelAgentResult result = agent(
                model,
                6,
                new RecordingTool("search_places", Map.of()),
                new RecordingTool("get_travel_profile", Map.of()))
                .answer("Where next?");

        assertThat(result.answer()).isEqualTo("Try Lisbon.");
        assertThat(model.requests.getFirst().structuredOutput()).isNull();
        assertThat(model.requests.getFirst().tools()).extracting(AiToolDefinition::name)
                .containsExactly("get_travel_profile");
        assertThat(model.requests.getFirst().messages().getFirst().content())
                .contains("WanderMap Travel Assistant")
                .doesNotContain("current draft", "refining");
    }

    @Test
    void executesOneToolAndReturnsItsStructuredResultToTheModel() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(new AiToolCall("call-1", "get_travel_profile", "{}")),
                AiModelResponse.finalAnswer("Portugal would add a new country."));
        RecordingTool tool = new RecordingTool("get_travel_profile", Map.of("countryCount", 5));

        TravelAgentResult result = agent(model, 6, tool).answer("Suggest somewhere different.");

        assertThat(result.toolsUsed()).containsExactly("get_travel_profile");
        assertThat(model.requests.get(1).messages().getLast().content())
                .contains("\"status\":\"success\"", "\"countryCount\":5");
    }

    @Test
    void supportsMultiStepAndMultipleToolCallsWhileKeepingFirstUseOrder() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(new AiToolCall("profile", "get_travel_profile", "{}")),
                AiModelResponse.toolCalls(
                        new AiToolCall("journeys", "get_journeys", "{}"),
                        new AiToolCall("bucket", "get_bucket_list", "{}")),
                AiModelResponse.finalAnswer("Choose Porto from your list."));

        TravelAgentResult result = agent(
                        model,
                        6,
                        new RecordingTool("get_travel_profile", Map.of()),
                        new RecordingTool("get_journeys", List.of()),
                        new RecordingTool("get_bucket_list", List.of("Porto")))
                .answer("Where next?");

        assertThat(result.toolsUsed())
                .containsExactly("get_travel_profile", "get_journeys", "get_bucket_list");
        assertThat(model.requests).hasSize(3);
        assertThat(model.requests.get(2).messages())
                .filteredOn(message -> message.role() == AiMessage.Role.TOOL)
                .hasSize(3);
    }

    @Test
    void returnsUnknownToolAsAControlledToolResult() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(new AiToolCall("unknown", "read_database", "{}")),
                AiModelResponse.finalAnswer("I cannot access that data."));

        TravelAgentResult result = agent(model, 6).answer("Read everything.");

        assertThat(result.toolsUsed()).isEmpty();
        assertThat(model.requests.get(1).messages().getLast().content())
                .contains("UNKNOWN_TOOL")
                .doesNotContain("stack");
    }

    @Test
    void returnsMalformedArgumentsAsAControlledToolResult() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(new AiToolCall("bad", "get_travel_profile", "not-json")),
                AiModelResponse.finalAnswer("I could not read the profile."));
        TravelAgentTool tool = new TravelAgentTool() {
            @Override
            public AiToolDefinition definition() {
                return TravelAgentTest.definition("get_travel_profile");
            }

            @Override
            public Object execute(String argumentsJson) {
                throw new ToolArgumentException("tool arguments must contain valid JSON");
            }
        };

        TravelAgentResult result = agent(model, 6, tool).answer("Use my profile.");

        assertThat(result.toolsUsed()).containsExactly("get_travel_profile");
        assertThat(model.requests.get(1).messages().getLast().content()).contains("INVALID_ARGUMENTS");
    }

    @Test
    void containsToolExceptionsAndLetsTheModelFinishGracefully() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(new AiToolCall("weather", "get_weather", "{\"latitude\":1}")),
                AiModelResponse.finalAnswer("Weather is unavailable, so I will not guess."));
        TravelAgentTool tool = new TravelAgentTool() {
            @Override
            public AiToolDefinition definition() {
                return TravelAgentTest.definition("get_weather");
            }

            @Override
            public Object execute(String argumentsJson) {
                throw new IllegalStateException("provider secret detail");
            }
        };

        TravelAgentResult result = agent(model, 6, tool).answer("Weather?");

        assertThat(result.answer()).contains("unavailable");
        assertThat(model.requests.get(1).messages().getLast().content())
                .contains("TOOL_FAILED")
                .doesNotContain("provider secret detail");
    }

    @Test
    void stopsAtTheConfiguredMaximumNumberOfModelIterations() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(new AiToolCall("one", "get_travel_profile", "{}")),
                AiModelResponse.toolCalls(new AiToolCall("two", "get_travel_profile", "{}")));

        assertThatThrownBy(() -> agent(
                        model, 2, new RecordingTool("get_travel_profile", Map.of()))
                .answer("Loop forever."))
                .isInstanceOf(AgentIterationLimitException.class)
                .hasMessageContaining("2 model iterations");
        assertThat(model.requests).hasSize(2);
    }

    @Test
    void rejectsBlankAndOversizedMessagesBeforeCallingTheProvider() {
        ScriptedModel model = new ScriptedModel(AiModelResponse.finalAnswer("unused"));
        TravelAgent agent = agent(model, 6);

        assertThatThrownBy(() -> agent.answer("   ")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> agent.answer("x".repeat(4_001))).isInstanceOf(IllegalArgumentException.class);
        assertThat(model.requests).isEmpty();
    }

    @Test
    void rejectsMalformedToolCallEnvelopesBeforeExecutingATool() {
        ScriptedModel model = new ScriptedModel(AiModelResponse.toolCalls(
                new AiToolCall("duplicate", "get_travel_profile", "{}"),
                new AiToolCall("duplicate", "get_travel_profile", "{}")));
        RecordingTool tool = new RecordingTool("get_travel_profile", Map.of());

        assertThatThrownBy(() -> agent(model, 6, tool).answer("Use my profile."))
                .isInstanceOf(AiProviderException.class)
                .extracting(exception -> ((AiProviderException) exception).getReason())
                .isEqualTo(AiProviderException.Reason.MALFORMED_RESPONSE);
        assertThat(tool.arguments).isEmpty();
    }

    @Test
    void rejectsAToolCallIdReusedAcrossModelIterations() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(new AiToolCall("duplicate", "get_travel_profile", "{}")),
                AiModelResponse.toolCalls(new AiToolCall("duplicate", "get_travel_profile", "{}")));
        RecordingTool tool = new RecordingTool("get_travel_profile", Map.of());

        assertThatThrownBy(() -> agent(model, 6, tool).answer("Use my profile twice."))
                .isInstanceOf(AiProviderException.class)
                .extracting(exception -> ((AiProviderException) exception).getReason())
                .isEqualTo(AiProviderException.Reason.MALFORMED_RESPONSE);
        assertThat(tool.arguments).containsExactly("{}");
    }

    @Test
    void stopsBeforeExecutingCallsThatWouldExceedThePerRunToolCallLimit() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(new AiToolCall("one", "get_travel_profile", "{}")),
                AiModelResponse.toolCalls(
                        new AiToolCall("two", "get_travel_profile", "{}"),
                        new AiToolCall("three", "get_travel_profile", "{}")));
        RecordingTool tool = new RecordingTool("get_travel_profile", Map.of());

        assertThatThrownBy(() -> agent(model, 6, 2, tool).answer("Use every tool."))
                .isInstanceOf(AgentToolCallLimitException.class)
                .hasMessageContaining("2 tool calls");
        assertThat(tool.arguments).containsExactly("{}");
    }

    @Test
    void stopsBeforeSendingToolResultsThatWouldExceedThePerRunContextLimit() {
        ScriptedModel model = new ScriptedModel(
                AiModelResponse.toolCalls(new AiToolCall("large", "get_travel_profile", "{}")));
        RecordingTool tool = new RecordingTool("get_travel_profile", "x".repeat(100));

        assertThatThrownBy(() -> agent(model, 6, 12, 50, tool).answer("Use all my data."))
                .isInstanceOf(AgentContextLimitException.class)
                .hasMessageContaining("50 tool-result characters");
        assertThat(model.requests).hasSize(1);
    }

    private TravelAgent agent(ScriptedModel model, int maximumIterations, TravelAgentTool... tools) {
        return agent(model, maximumIterations, 12, tools);
    }

    private TravelAgent agent(
            ScriptedModel model,
            int maximumIterations,
            int maximumToolCalls,
            TravelAgentTool... tools) {
        return agent(model, maximumIterations, maximumToolCalls, 100_000, tools);
    }

    private TravelAgent agent(
            ScriptedModel model,
            int maximumIterations,
            int maximumToolCalls,
            int maximumToolResultCharacters,
            TravelAgentTool... tools) {
        return new TravelAgent(
                model,
                objectMapper,
                List.of(tools),
                maximumIterations,
                maximumToolCalls,
                maximumToolResultCharacters);
    }

    private static AiToolDefinition definition(String name) {
        return new AiToolDefinition(name, "test tool", Map.of("type", "object"));
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

    private static final class RecordingTool implements TravelAgentTool {
        private final AiToolDefinition definition;
        private final Object result;
        private final List<String> arguments = new ArrayList<>();

        private RecordingTool(String name, Object result) {
            this.definition = TravelAgentTest.definition(name);
            this.result = result;
        }

        @Override
        public AiToolDefinition definition() {
            return definition;
        }

        @Override
        public Object execute(String argumentsJson) {
            arguments.add(argumentsJson);
            return result;
        }
    }
}
