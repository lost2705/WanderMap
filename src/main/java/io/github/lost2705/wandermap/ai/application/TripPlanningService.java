package io.github.lost2705.wandermap.ai.application;

import io.github.lost2705.wandermap.ai.application.tool.GetBucketListTool;
import io.github.lost2705.wandermap.ai.application.tool.GetJourneysTool;
import io.github.lost2705.wandermap.ai.application.tool.GetTravelProfileTool;
import io.github.lost2705.wandermap.ai.application.tool.GetWeatherTool;
import io.github.lost2705.wandermap.ai.application.tool.SearchPlacesTool;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import tools.jackson.databind.ObjectMapper;

@Service
public class TripPlanningService {

    private static final Logger LOGGER = LoggerFactory.getLogger(TripPlanningService.class);

    private final TravelAgent travelAgent;
    private final TripPlanValidator validator;
    private final ObjectMapper objectMapper;

    public TripPlanningService(
            TravelAgent travelAgent,
            TripPlanValidator validator,
            ObjectMapper objectMapper) {
        this.travelAgent = travelAgent;
        this.validator = validator;
        this.objectMapper = objectMapper;
    }

    public TripPlanningResult createDraft(String message) {
        TravelAgentExecution execution = travelAgent.plan(message);
        try {
            TripPlanDraft parsed = parse(execution.finalOutput());
            List<ResolvedPlace> resolvedPlaces = resolvedPlaces(execution.observations());
            validator.validate(parsed, resolvedPlaces);
            TripPlanDraft plan = parsed.withSourcesUsed(sourceLabels(execution.observations()));
            LOGGER.info("travel_planner.plan.validated runId={} stops={} durationDays={} durationMs={}",
                    execution.runId(),
                    plan.stops().size(),
                    plan.durationDays(),
                    Duration.between(execution.startedAt(), Instant.now()).toMillis());
            TravelAgent.logCompleted("travel_planner", execution);
            return new TripPlanningResult(execution.runId(), plan, execution.toolsUsed());
        } catch (InvalidTripPlanException exception) {
            TravelAgent.logPlanValidationFailure(execution, exception);
            throw exception;
        }
    }

    private TripPlanDraft parse(String output) {
        try {
            return objectMapper.readValue(output, TripPlanDraft.class);
        } catch (Exception exception) {
            throw new InvalidTripPlanException("AI provider returned an invalid trip plan", exception);
        }
    }

    private static List<String> sourceLabels(List<AiToolObservation> observations) {
        LinkedHashSet<String> labels = new LinkedHashSet<>();
        for (AiToolObservation observation : observations) {
            switch (observation.toolName()) {
                case GetTravelProfileTool.NAME -> labels.add("Travel Profile");
                case GetJourneysTool.NAME -> labels.add("Journeys");
                case GetBucketListTool.NAME -> labels.add("Bucket List");
                case SearchPlacesTool.NAME -> labels.add("Place Search");
                case GetWeatherTool.NAME -> labels.add("Weather");
                default -> {
                    // Future tools are not exposed as sources until they receive a stable presentation label.
                }
            }
        }
        return List.copyOf(labels);
    }

    private static List<ResolvedPlace> resolvedPlaces(List<AiToolObservation> observations) {
        List<ResolvedPlace> places = new ArrayList<>();
        for (AiToolObservation observation : observations) {
            if (observation.data() instanceof GetJourneysTool.Result result) {
                result.journeys().stream()
                        .flatMap(journey -> journey.stops().stream())
                        .filter(stop -> stop.latitude() != null && stop.longitude() != null)
                        .map(stop -> new ResolvedPlace(
                                stop.city(),
                                stop.countryCode(),
                                stop.country(),
                                stop.latitude(),
                                stop.longitude(),
                                false,
                                true))
                        .forEach(places::add);
            } else if (observation.data() instanceof GetBucketListTool.Result result) {
                result.places().stream()
                        .filter(place -> place.latitude() != null && place.longitude() != null)
                        .map(place -> new ResolvedPlace(
                                place.city(),
                                place.countryCode(),
                                place.country(),
                                place.latitude(),
                                place.longitude(),
                                true,
                                "visited".equals(place.state())))
                        .forEach(places::add);
            } else if (observation.data() instanceof SearchPlacesTool.Result result) {
                result.places().stream()
                        .map(place -> new ResolvedPlace(
                                place.city(),
                                place.countryCode(),
                                place.country(),
                                place.latitude(),
                                place.longitude(),
                                false,
                                false))
                        .forEach(places::add);
            }
        }
        return List.copyOf(places);
    }
}
