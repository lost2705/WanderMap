package io.github.lost2705.wandermap.ai.application.tool;

import io.github.lost2705.wandermap.ai.application.ToolArgumentException;
import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
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

    static PlaceSearch placeSearch(ObjectMapper objectMapper, String argumentsJson) {
        JsonNode arguments = object(objectMapper, argumentsJson);
        if (arguments.size() != 3
                || !arguments.has("query")
                || !arguments.has("countryCode")
                || !arguments.has("limit")) {
            throw new ToolArgumentException("query, countryCode, and limit are required and no other arguments are allowed");
        }
        String query = arguments.path("query").isTextual() ? arguments.path("query").asText().strip() : "";
        if (query.length() < 2 || query.length() > 160) {
            throw new ToolArgumentException("query must contain between 2 and 160 characters");
        }
        String countryCode = null;
        JsonNode countryNode = arguments.get("countryCode");
        if (!countryNode.isNull()) {
            if (!countryNode.isTextual()) {
                throw new ToolArgumentException("countryCode must be null or a two-letter country code");
            }
            countryCode = countryNode.asText().strip().toUpperCase(Locale.ROOT);
            if (!countryCode.matches("[A-Z]{2}")) {
                throw new ToolArgumentException("countryCode must be null or a two-letter country code");
            }
        }
        if (!arguments.path("limit").isIntegralNumber()) {
            throw new ToolArgumentException("limit must be an integer between 1 and 8");
        }
        int limit = arguments.path("limit").asInt();
        if (limit < 1 || limit > 8) {
            throw new ToolArgumentException("limit must be an integer between 1 and 8");
        }
        return new PlaceSearch(query, countryCode, limit);
    }

    static Map<String, Object> placeSearchSchema() {
        return Map.of(
                "type", "object",
                "properties", Map.of(
                        "query", Map.of(
                                "type", "string",
                                "minLength", 2,
                                "maxLength", 160,
                                "description", "A concrete city or locality name to resolve, not a recommendation query"),
                        "countryCode", Map.of(
                                "anyOf", List.of(
                                        Map.of("type", "string", "pattern", "^[A-Z]{2}$"),
                                        Map.of("type", "null")),
                                "description", "Optional ISO alpha-2 country filter"),
                        "limit", Map.of(
                                "type", "integer",
                                "minimum", 1,
                                "maximum", 8)),
                "required", List.of("query", "countryCode", "limit"),
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

    record PlaceSearch(String query, String countryCode, int limit) {
    }
}
