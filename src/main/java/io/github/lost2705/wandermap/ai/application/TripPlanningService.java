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
import java.util.Map;
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
            TripPlanDraft plan = validatedPlan(execution);
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

    public TripPlanningResult refineDraft(TripPlanDraft currentDraft, String message) {
        validator.validateClientDraft(currentDraft);
        TravelAgentExecution execution = travelAgent.refine(refinementContext(currentDraft), message);
        try {
            requireRefinementPersonalEvidence(execution.observations());
            TripPlanDraft plan = validatedPlan(execution);
            TravelAgent.logRefinementCompleted(execution);
            return new TripPlanningResult(execution.runId(), plan, execution.toolsUsed());
        } catch (InvalidTripPlanException exception) {
            TravelAgent.logRefinementValidationFailure(execution, exception);
            throw exception;
        }
    }

    private TripPlanDraft validatedPlan(TravelAgentExecution execution) {
        TripPlanDraft parsed = parse(execution.finalOutput());
        List<ResolvedPlace> resolvedPlaces = resolvedPlaces(execution.observations());
        validator.validate(parsed, resolvedPlaces);
        return parsed.withSourcesUsed(sourceLabels(execution.observations()));
    }

    private String refinementContext(TripPlanDraft draft) {
        List<Map<String, Object>> stops = draft.stops().stream()
                .map(stop -> Map.<String, Object>ofEntries(
                        Map.entry("cityName", stop.cityName()),
                        Map.entry("countryCode", stop.countryCode()),
                        Map.entry("countryName", stop.countryName()),
                        Map.entry("latitude", stop.latitude()),
                        Map.entry("longitude", stop.longitude()),
                        Map.entry("daysAtStop", stop.daysAtStop()),
                        Map.entry("reason", stop.reason()),
                        Map.entry("activities", stop.activities())))
                .toList();
        Map<String, Object> context = new java.util.LinkedHashMap<>();
        context.put("title", draft.title());
        context.put("summary", draft.summary());
        context.put("durationDays", draft.durationDays());
        context.put("startDate", draft.startDate());
        context.put("endDate", draft.endDate());
        context.put("destinationSummary", draft.destinationSummary());
        context.put("pace", draft.pace());
        context.put("stops", stops);
        context.put("considerations", draft.considerations());
        try {
            return objectMapper.writeValueAsString(context);
        } catch (Exception exception) {
            throw new IllegalStateException("Could not serialize the current trip plan", exception);
        }
    }

    private static void requireRefinementPersonalEvidence(List<AiToolObservation> observations) {
        boolean journeys = observations.stream()
                .anyMatch(observation -> GetJourneysTool.NAME.equals(observation.toolName()));
        boolean bucketList = observations.stream()
                .anyMatch(observation -> GetBucketListTool.NAME.equals(observation.toolName()));
        if (!journeys || !bucketList) {
            throw new InvalidTripPlanException(
                    "refinement must re-establish Journey and Bucket List evidence");
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
