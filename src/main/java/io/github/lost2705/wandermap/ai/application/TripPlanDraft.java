package io.github.lost2705.wandermap.ai.application;

import java.time.LocalDate;
import java.util.List;

public record TripPlanDraft(
        String title,
        String summary,
        int durationDays,
        LocalDate startDate,
        LocalDate endDate,
        String destinationSummary,
        TripPlanPace pace,
        List<TripPlanStop> stops,
        List<String> considerations,
        List<String> sourcesUsed) {

    public TripPlanDraft {
        stops = stops == null ? List.of() : List.copyOf(stops);
        considerations = considerations == null ? List.of() : List.copyOf(considerations);
        sourcesUsed = sourcesUsed == null ? List.of() : List.copyOf(sourcesUsed);
    }

    TripPlanDraft withSourcesUsed(List<String> sources) {
        return new TripPlanDraft(
                title,
                summary,
                durationDays,
                startDate,
                endDate,
                destinationSummary,
                pace,
                stops,
                considerations,
                sources);
    }
}
