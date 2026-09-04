package io.github.lost2705.wandermap.ai.application.tool;

import io.github.lost2705.wandermap.ai.application.AiToolDefinition;
import io.github.lost2705.wandermap.ai.application.TravelAgentTool;
import io.github.lost2705.wandermap.ai.application.WeatherClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class GetWeatherTool implements TravelAgentTool {

    public static final String NAME = "get_weather";

    private final WeatherClient weatherClient;
    private final ObjectMapper objectMapper;

    public GetWeatherTool(WeatherClient weatherClient, ObjectMapper objectMapper) {
        this.weatherClient = weatherClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiToolDefinition definition() {
        return new AiToolDefinition(
                NAME,
                "Get today's short-term weather forecast for WGS84 coordinates. This is not climate data and cannot provide a reliable forecast more than 16 days ahead.",
                ToolArguments.coordinatesSchema());
    }

    @Override
    public Object execute(String argumentsJson) {
        ToolArguments.Coordinates coordinates = ToolArguments.coordinates(objectMapper, argumentsJson);
        return weatherClient.getShortTermForecast(coordinates.latitude(), coordinates.longitude());
    }
}
