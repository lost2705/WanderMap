package io.github.lost2705.wandermap.ai.api;

import io.github.lost2705.wandermap.ai.api.dto.TravelAssistantRequest;
import io.github.lost2705.wandermap.ai.api.dto.TravelAssistantResponse;
import io.github.lost2705.wandermap.ai.application.TravelAgent;
import io.github.lost2705.wandermap.ai.application.TravelAgentResult;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/travel-assistant")
public class TravelAssistantController {

    private final TravelAgent travelAgent;

    public TravelAssistantController(TravelAgent travelAgent) {
        this.travelAgent = travelAgent;
    }

    @PostMapping
    public TravelAssistantResponse answer(@Valid @RequestBody TravelAssistantRequest request) {
        TravelAgentResult result = travelAgent.answer(request.message());
        return new TravelAssistantResponse(result.runId(), result.answer(), result.toolsUsed());
    }
}
