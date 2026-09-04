package io.github.lost2705.wandermap.ai.application.tool;

import io.github.lost2705.wandermap.ai.application.AiToolDefinition;
import io.github.lost2705.wandermap.ai.application.TravelAgentTool;
import io.github.lost2705.wandermap.travel.application.CitySearchResult;
import io.github.lost2705.wandermap.travel.application.CitySearchService;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class SearchPlacesTool implements TravelAgentTool {

    public static final String NAME = "search_places";

    private final CitySearchService citySearchService;
    private final ObjectMapper objectMapper;

    public SearchPlacesTool(CitySearchService citySearchService, ObjectMapper objectMapper) {
        this.citySearchService = citySearchService;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiToolDefinition definition() {
        return new AiToolDefinition(
                NAME,
                "Resolve concrete populated-place names to provider-neutral city, country, and WGS84 coordinates. This searches places; it does not rank the best destinations for an interest.",
                ToolArguments.placeSearchSchema());
    }

    @Override
    public Object execute(String argumentsJson) {
        ToolArguments.PlaceSearch arguments = ToolArguments.placeSearch(objectMapper, argumentsJson);
        return new Result(citySearchService.searchCities(arguments.query()).stream()
                .filter(result -> arguments.countryCode() == null
                        || arguments.countryCode().equals(result.countryCode()))
                .limit(arguments.limit())
                .map(SearchPlacesTool::toPlace)
                .toList());
    }

    private static Place toPlace(CitySearchResult result) {
        return new Place(
                result.name(),
                result.countryName(),
                result.regionName(),
                result.countryCode(),
                result.latitude(),
                result.longitude());
    }

    public record Result(List<Place> places) {

        public Result {
            places = List.copyOf(places);
        }
    }

    public record Place(
            String city,
            String country,
            String region,
            String countryCode,
            BigDecimal latitude,
            BigDecimal longitude) {
    }
}
