package io.github.lost2705.wandermap.ai.api;

import io.github.lost2705.wandermap.ai.api.dto.TripPlanningRequest;
import io.github.lost2705.wandermap.ai.api.dto.TripPlanRefinementRequest;
import io.github.lost2705.wandermap.ai.api.dto.TripPlanningResponse;
import io.github.lost2705.wandermap.ai.application.TripPlanningResult;
import io.github.lost2705.wandermap.ai.application.TripPlanningService;
import io.github.lost2705.wandermap.ai.application.TripPlanApplyService;
import io.github.lost2705.wandermap.ai.api.dto.TripPlanApplyRequest;
import io.github.lost2705.wandermap.travel.api.TravelApiMapper;
import io.github.lost2705.wandermap.travel.api.dto.TripResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/trip-plan")
public class TripPlanningController {

    private final TripPlanningService tripPlanningService;
    private final TripPlanApplyService tripPlanApplyService;

    public TripPlanningController(TripPlanningService tripPlanningService, TripPlanApplyService tripPlanApplyService) {
        this.tripPlanningService = tripPlanningService;
        this.tripPlanApplyService = tripPlanApplyService;
    }

    @PostMapping("/apply")
    public TripResponse applyDraft(@Valid @RequestBody TripPlanApplyRequest request) {
        return TravelApiMapper.toResponse(tripPlanApplyService.apply(request.plan(), request.requestId()));
    }

    @PostMapping
    public TripPlanningResponse createDraft(@Valid @RequestBody TripPlanningRequest request) {
        TripPlanningResult result = tripPlanningService.createDraft(request.message());
        return new TripPlanningResponse(result.runId(), result.plan(), result.toolsUsed());
    }

    @PostMapping("/refine")
    public TripPlanningResponse refineDraft(@Valid @RequestBody TripPlanRefinementRequest request) {
        TripPlanningResult result = tripPlanningService.refineDraft(request.plan(), request.message());
        return new TripPlanningResponse(result.runId(), result.plan(), result.toolsUsed());
    }
}
