package io.github.lost2705.wandermap.ai.application.tool;

import io.github.lost2705.wandermap.ai.application.AiToolDefinition;
import io.github.lost2705.wandermap.ai.application.TravelAgentTool;
import io.github.lost2705.wandermap.travel.application.TripService;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Component
public class GetJourneysTool implements TravelAgentTool {

    public static final String NAME = "get_journeys";

    private final TripService tripService;
    private final ObjectMapper objectMapper;

    public GetJourneysTool(TripService tripService, ObjectMapper objectMapper) {
        this.tripService = tripService;
        this.objectMapper = objectMapper;
    }

    @Override
    public AiToolDefinition definition() {
        return new AiToolDefinition(
                NAME,
                "Get the current authenticated user's Journeys with dates and itinerary stops in order. Takes no arguments.",
                ToolArguments.emptyObjectSchema());
    }

    @Override
    public Object execute(String argumentsJson) {
        ToolArguments.requireEmptyObject(objectMapper, argumentsJson);
        return new Result(tripService.listTripsWithCities().stream().map(GetJourneysTool::toJourney).toList());
    }

    private static Journey toJourney(Trip trip) {
        return new Journey(
                trip.getName(),
                trip.getStartDate(),
                trip.getEndDate(),
                trip.getStops().stream()
                        .sorted(Comparator.comparingInt(TripStop::getPosition))
                        .map(stop -> new Stop(
                                stop.getCity().getName(),
                                stop.getCity().getCountry().getName(),
                                stop.getCity().getCountry().getCode(),
                                stop.getCity().getLatitude(),
                                stop.getCity().getLongitude()))
                        .toList());
    }

    public record Result(List<Journey> journeys) {
    }

    public record Journey(String name, LocalDate startDate, LocalDate endDate, List<Stop> stops) {
    }

    public record Stop(
            String city,
            String country,
            String countryCode,
            BigDecimal latitude,
            BigDecimal longitude) {
    }
}
