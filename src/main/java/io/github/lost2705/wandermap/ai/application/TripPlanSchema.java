package io.github.lost2705.wandermap.ai.application;

import java.util.List;
import java.util.Map;

final class TripPlanSchema {

    static final String NAME = "wander_map_trip_plan_v1";

    private TripPlanSchema() {
    }

    static AiStructuredOutputDefinition definition() {
        Map<String, Object> stop = object(
                Map.ofEntries(
                        Map.entry("cityName", string(160)),
                        Map.entry("countryCode", Map.of("type", "string", "pattern", "^[A-Z]{2}$")),
                        Map.entry("countryName", string(100)),
                        Map.entry("latitude", Map.of("type", "number", "minimum", -90, "maximum", 90)),
                        Map.entry("longitude", Map.of("type", "number", "minimum", -180, "maximum", 180)),
                        Map.entry("daysAtStop", Map.of("type", "integer", "minimum", 1, "maximum", 60)),
                        Map.entry("reason", string(1_000)),
                        Map.entry("activities", Map.of(
                                "type", "array",
                                "items", string(200),
                                "maxItems", 8)),
                        Map.entry("bucketListMatch", Map.of("type", "boolean")),
                        Map.entry("alreadyVisited", Map.of("type", "boolean"))),
                List.of(
                        "cityName",
                        "countryCode",
                        "countryName",
                        "latitude",
                        "longitude",
                        "daysAtStop",
                        "reason",
                        "activities",
                        "bucketListMatch",
                        "alreadyVisited"));

        Map<String, Object> schema = object(
                Map.ofEntries(
                        Map.entry("title", string(160)),
                        Map.entry("summary", string(1_000)),
                        Map.entry("durationDays", Map.of("type", "integer", "minimum", 1, "maximum", 60)),
                        Map.entry("startDate", nullableDate()),
                        Map.entry("endDate", nullableDate()),
                        Map.entry("destinationSummary", string(500)),
                        Map.entry("pace", Map.of(
                                "type", "string",
                                "enum", List.of("RELAXED", "BALANCED", "FAST"))),
                        Map.entry("stops", Map.of(
                                "type", "array",
                                "items", stop,
                                "minItems", 1,
                                "maxItems", 12)),
                        Map.entry("considerations", Map.of(
                                "type", "array",
                                "items", string(500),
                                "maxItems", 10)),
                        Map.entry("sourcesUsed", Map.of(
                                "type", "array",
                                "items", Map.of(
                                        "type", "string",
                                        "enum", List.of(
                                                "Travel Profile",
                                                "Journeys",
                                                "Bucket List",
                                                "Place Search",
                                                "Weather")),
                                "maxItems", 5))),
                List.of(
                        "title",
                        "summary",
                        "durationDays",
                        "startDate",
                        "endDate",
                        "destinationSummary",
                        "pace",
                        "stops",
                        "considerations",
                        "sourcesUsed"));
        return new AiStructuredOutputDefinition(
                NAME,
                "A read-only WanderMap trip-plan draft with resolved places and internally consistent duration.",
                schema);
    }

    private static Map<String, Object> object(Map<String, Object> properties, List<String> required) {
        return Map.of(
                "type", "object",
                "properties", properties,
                "required", required,
                "additionalProperties", false);
    }

    private static Map<String, Object> string(int maximumLength) {
        return Map.of("type", "string", "minLength", 1, "maxLength", maximumLength);
    }

    private static Map<String, Object> nullableDate() {
        return Map.of("anyOf", List.of(
                Map.of("type", "string", "format", "date"),
                Map.of("type", "null")));
    }
}
