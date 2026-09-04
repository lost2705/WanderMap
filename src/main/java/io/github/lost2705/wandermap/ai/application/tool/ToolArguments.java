package io.github.lost2705.wandermap.ai.application.tool;

import io.github.lost2705.wandermap.ai.application.ToolArgumentException;
import java.math.BigDecimal;
import java.util.Map;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

final class ToolArguments {

    private ToolArguments() {
    }

    static void requireEmptyObject(ObjectMapper objectMapper, String argumentsJson) {
        JsonNode arguments = object(objectMapper, argumentsJson);
        if (!arguments.isEmpty()) {
            throw new ToolArgumentException("This tool does not accept arguments");
        }
    }

    static Coordinates coordinates(ObjectMapper objectMapper, String argumentsJson) {
        JsonNode arguments = object(objectMapper, argumentsJson);
        if (arguments.size() != 2 || !arguments.has("latitude") || !arguments.has("longitude")) {
            throw new ToolArgumentException("latitude and longitude are required and no other arguments are allowed");
        }
        JsonNode latitudeNode = arguments.get("latitude");
        JsonNode longitudeNode = arguments.get("longitude");
        if (!latitudeNode.isNumber() || !longitudeNode.isNumber()) {
            throw new ToolArgumentException("latitude and longitude must be numbers");
        }

        if ((latitudeNode.isFloatingPointNumber() && !Double.isFinite(latitudeNode.asDouble()))
                || (longitudeNode.isFloatingPointNumber() && !Double.isFinite(longitudeNode.asDouble()))) {
            throw new ToolArgumentException("latitude and longitude must be finite numbers");
        }

        BigDecimal latitude;
        BigDecimal longitude;
        try {
            latitude = latitudeNode.decimalValue();
            longitude = longitudeNode.decimalValue();
        } catch (RuntimeException exception) {
            throw new ToolArgumentException("latitude and longitude must be finite numbers", exception);
        }
        if (latitude.compareTo(BigDecimal.valueOf(-90)) < 0
                || latitude.compareTo(BigDecimal.valueOf(90)) > 0) {
            throw new ToolArgumentException("latitude must be between -90 and 90");
        }
        if (longitude.compareTo(BigDecimal.valueOf(-180)) < 0
                || longitude.compareTo(BigDecimal.valueOf(180)) > 0) {
            throw new ToolArgumentException("longitude must be between -180 and 180");
        }
        return new Coordinates(latitude, longitude);
    }

    static Map<String, Object> emptyObjectSchema() {
        return Map.of(
                "type", "object",
                "properties", Map.of(),
                "required", java.util.List.of(),
                "additionalProperties", false);
    }

    static Map<String, Object> coordinatesSchema() {
        return Map.of(
                "type", "object",
                "properties", Map.of(
                        "latitude", Map.of(
                                "type", "number",
                                "minimum", -90,
                                "maximum", 90,
                                "description", "WGS84 latitude"),
                        "longitude", Map.of(
                                "type", "number",
                                "minimum", -180,
                                "maximum", 180,
                                "description", "WGS84 longitude")),
                "required", java.util.List.of("latitude", "longitude"),
                "additionalProperties", false);
    }

    private static JsonNode object(ObjectMapper objectMapper, String argumentsJson) {
        if (argumentsJson == null || argumentsJson.isBlank()) {
            throw new ToolArgumentException("tool arguments must be a JSON object");
        }
        try {
            JsonNode arguments = objectMapper.readTree(argumentsJson);
            if (arguments == null || !arguments.isObject()) {
                throw new ToolArgumentException("tool arguments must be a JSON object");
            }
            return arguments;
        } catch (ToolArgumentException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ToolArgumentException("tool arguments must contain valid JSON", exception);
        }
    }

    record Coordinates(BigDecimal latitude, BigDecimal longitude) {
    }
}
