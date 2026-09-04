package io.github.lost2705.wandermap.ai.infrastructure.openai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withTooManyRequests;

import io.github.lost2705.wandermap.ai.application.AiMessage;
import io.github.lost2705.wandermap.ai.application.AiModelRequest;
import io.github.lost2705.wandermap.ai.application.AiModelResponse;
import io.github.lost2705.wandermap.ai.application.AiProviderException;
import io.github.lost2705.wandermap.ai.application.AiStructuredOutputDefinition;
import io.github.lost2705.wandermap.ai.application.AiToolCall;
import io.github.lost2705.wandermap.ai.application.AiToolDefinition;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

class OpenAiResponsesClientTest {

    private MockRestServiceServer server;
    private OpenAiResponsesClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://api.openai.test");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new OpenAiResponsesClient(builder.build(), "gpt-test", 1234, new ObjectMapper());
    }

    @Test
    void mapsApplicationMessagesToolsAndAResponsesApiFinalAnswer() {
        server.expect(once(), requestTo("https://api.openai.test/v1/responses"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(jsonPath("$.model").value("gpt-test"))
                .andExpect(jsonPath("$.instructions").value("system rules"))
                .andExpect(jsonPath("$.input[0].role").value("user"))
                .andExpect(jsonPath("$.tools[0].name").value("get_profile"))
                .andExpect(jsonPath("$.tools[0].strict").value(true))
                .andExpect(jsonPath("$.max_output_tokens").value(1234))
                .andExpect(jsonPath("$.store").value(false))
                .andExpect(jsonPath("$.include[0]").value("reasoning.encrypted_content"))
                .andRespond(withSuccess(
                        """
                        {"status":"completed","output":[{"type":"message","role":"assistant","content":[
                          {"type":"output_text","text":"Try Porto."}
                        ]}]}
                        """,
                        MediaType.APPLICATION_JSON));

        var response = client.chat(new AiModelRequest(
                List.of(AiMessage.system("system rules"), AiMessage.user("Where next?")),
                List.of(new AiToolDefinition("get_profile", "Profile", Map.of("type", "object")))));

        assertThat(response.finalText()).isEqualTo("Try Porto.");
        assertThat(response.toolCalls()).isEmpty();
        server.verify();
    }

    @Test
    void keepsStructuredRefinementContinuationAndFunctionOutputsInExplicitInputItems() {
        server.expect(once(), requestTo("https://api.openai.test/v1/responses"))
                .andExpect(jsonPath("$.instructions").value("refinement rules v1"))
                .andExpect(jsonPath("$.input[0].content").value("Current draft"))
                .andExpect(jsonPath("$.input[1].content").value("Make it calmer"))
                .andExpect(jsonPath("$.input[2].type").value("reasoning"))
                .andExpect(jsonPath("$.input[2].encrypted_content").value("opaque-reasoning"))
                .andExpect(jsonPath("$.input[3].type").value("function_call"))
                .andExpect(jsonPath("$.input[3].call_id").value("call-1"))
                .andExpect(jsonPath("$.input[4].type").value("function_call_output"))
                .andExpect(jsonPath("$.input[4].output").value("{\"status\":\"success\"}"))
                .andExpect(jsonPath("$.text.format.type").value("json_schema"))
                .andExpect(jsonPath("$.text.format.name").value("trip_plan"))
                .andExpect(jsonPath("$.text.format.strict").value(true))
                .andExpect(jsonPath("$.text.format.schema.additionalProperties").value(false))
                .andRespond(withSuccess(
                        """
                        {"status":"completed","output":[{"type":"function_call","call_id":"call-2",
                          "name":"get_weather","arguments":"{\\\"latitude\\\":41.1,\\\"longitude\\\":-8.6}"}]}
                        """,
                        MediaType.APPLICATION_JSON));

        var response = client.chat(new AiModelRequest(
                List.of(
                        AiMessage.system("refinement rules v1"),
                        AiMessage.user("Current draft"),
                        AiMessage.user("Make it calmer"),
                        AiMessage.assistantToolCalls(
                                List.of(new AiToolCall("call-1", "get_profile", "{}")),
                                """
                                [{"type":"reasoning","id":"rs-1","encrypted_content":"opaque-reasoning"},
                                 {"type":"function_call","call_id":"call-1","name":"get_profile","arguments":"{}"}]
                                """),
                        AiMessage.toolResult("call-1", "{\"status\":\"success\"}")),
                List.of(),
                structuredOutput()));

        assertThat(response.toolCalls()).containsExactly(new AiToolCall(
                "call-2", "get_weather", "{\"latitude\":41.1,\"longitude\":-8.6}"));
        server.verify();
    }

    @Test
    void serializesTheExactResponsesApiStructuredRefinementContractAndParsesItsJsonText() {
        server.expect(once(), requestTo("https://api.openai.test/v1/responses"))
                .andExpect(jsonPath("$.model").value("gpt-test"))
                .andExpect(jsonPath("$.instructions").value("refinement rules v1"))
                .andExpect(jsonPath("$.input[0].role").value("user"))
                .andExpect(jsonPath("$.input[0].content").value("Current draft: {\"title\":\"Italy\"}"))
                .andExpect(jsonPath("$.input[1].role").value("user"))
                .andExpect(jsonPath("$.input[1].content").value("Make it more relaxed"))
                .andExpect(jsonPath("$.tools[0].name").value("search_places"))
                .andExpect(jsonPath("$.tools[0].strict").value(true))
                .andExpect(jsonPath("$.text.format.type").value("json_schema"))
                .andExpect(jsonPath("$.text.format.name").value("trip_plan"))
                .andExpect(jsonPath("$.text.format.description").value("Trip plan"))
                .andExpect(jsonPath("$.text.format.strict").value(true))
                .andExpect(jsonPath("$.text.format.schema.type").value("object"))
                .andExpect(jsonPath("$.max_output_tokens").value(1234))
                .andExpect(jsonPath("$.store").value(false))
                .andRespond(withSuccess(
                        """
                        {"status":"completed","output":[{"type":"message","role":"assistant","content":[
                          {"type":"output_text","text":"{\\\"title\\\":\\\"Italy\\\"}"}
                        ]}]}
                        """,
                        MediaType.APPLICATION_JSON));

        AiModelResponse response = client.chat(new AiModelRequest(
                List.of(
                        AiMessage.system("refinement rules v1"),
                        AiMessage.user("Current draft: {\"title\":\"Italy\"}"),
                        AiMessage.user("Make it more relaxed")),
                List.of(new AiToolDefinition("search_places", "Resolve places", Map.of("type", "object"))),
                structuredOutput()));

        assertThat(response.finalText()).isEqualTo("{\"title\":\"Italy\"}");
        server.verify();
    }

    @Test
    void mapsRateLimitsAndMalformedResponsesToControlledProviderFailures() {
        server.expect(once(), requestTo("https://api.openai.test/v1/responses"))
                .andRespond(withTooManyRequests());
        assertThatThrownBy(() -> client.chat(new AiModelRequest(List.of(AiMessage.user("Hi")), List.of())))
                .isInstanceOfSatisfying(AiProviderException.class,
                        exception -> assertThat(exception.getReason()).isEqualTo(AiProviderException.Reason.RATE_LIMITED));
        server.verify();

        setUp();
        server.expect(once(), requestTo("https://api.openai.test/v1/responses"))
                .andRespond(withSuccess("{\"status\":\"completed\",\"output\":[]}", MediaType.APPLICATION_JSON));
        assertThatThrownBy(() -> client.chat(new AiModelRequest(List.of(AiMessage.user("Hi")), List.of())))
                .isInstanceOfSatisfying(AiProviderException.class,
                        exception -> assertThat(exception.getReason())
                                .isEqualTo(AiProviderException.Reason.MALFORMED_RESPONSE));
        server.verify();
    }

    @ParameterizedTest
    @ValueSource(strings = {"incomplete", "failed"})
    void rejectsResponsesThatDidNotComplete(String status) {
        server.expect(once(), requestTo("https://api.openai.test/v1/responses"))
                .andRespond(withSuccess(
                        """
                        {"status":"%s","output":[{"type":"message","content":[
                          {"type":"output_text","text":"Partial answer"}
                        ]}]}
                        """.formatted(status),
                        MediaType.APPLICATION_JSON));

        assertThatThrownBy(() -> client.chat(new AiModelRequest(List.of(AiMessage.user("Hi")), List.of())))
                .isInstanceOfSatisfying(AiProviderException.class,
                        exception -> assertThat(exception.getReason())
                                .isEqualTo(AiProviderException.Reason.MALFORMED_RESPONSE));
        server.verify();
    }

    private static AiStructuredOutputDefinition structuredOutput() {
        return new AiStructuredOutputDefinition(
                "trip_plan",
                "Trip plan",
                Map.of(
                        "type", "object",
                        "properties", Map.of("title", Map.of("type", "string")),
                        "required", List.of("title"),
                        "additionalProperties", false));
    }
}
