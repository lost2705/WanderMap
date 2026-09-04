package io.github.lost2705.wandermap.ai.application;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record TravelAgentExecution(
        UUID runId,
        String finalOutput,
        List<String> toolsUsed,
        List<AiToolObservation> observations,
        int iterations,
        Instant startedAt) {

    TravelAgentExecution {
        toolsUsed = List.copyOf(toolsUsed);
        observations = List.copyOf(observations);
    }
}
