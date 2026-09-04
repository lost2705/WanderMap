package io.github.lost2705.wandermap.ai.application.tool;

import io.github.lost2705.wandermap.ai.application.AiToolDefinition;
import io.github.lost2705.wandermap.ai.application.TravelAgentTool;
import io.github.lost2705.wandermap.travel.application.BucketListEntry;
import io.github.lost2705.wandermap.travel.application.BucketListService;
import java.math.BigDecimal;
import java.util.List;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class GetBucketListTool implements TravelAgentTool {

    public static final String NAME = "get_bucket_list";

    private final BucketListService bucketListService;
    private final ObjectMapper objectMapper;

    public GetBucketListTool(BucketListService bucketListService, ObjectMapper objectMapper) {
        this.bucketListService = bucketListService;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiToolDefinition definition() {
        return new AiToolDefinition(
                NAME,
                "Get places on the current authenticated user's WanderMap Bucket List. Takes no arguments.",
                ToolArguments.emptyObjectSchema());
    }

    @Override
    public Object execute(String argumentsJson) {
        ToolArguments.requireEmptyObject(objectMapper, argumentsJson);
        return new Result(bucketListService.listItems().stream().map(GetBucketListTool::toPlace).toList());
    }

    private static Place toPlace(BucketListEntry entry) {
        return new Place(
                entry.item().getCity().getName(),
                entry.item().getCity().getCountry().getName(),
                entry.item().getCity().getCountry().getCode(),
                entry.item().getCity().getLatitude(),
                entry.item().getCity().getLongitude(),
                entry.visited() ? "visited" : "want_to_visit");
    }

    public record Result(List<Place> places) {
    }

    public record Place(
            String city,
            String country,
            String countryCode,
            BigDecimal latitude,
            BigDecimal longitude,
            String state) {
    }
}
