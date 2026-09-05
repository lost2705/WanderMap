package io.github.lost2705.wandermap.ai.application;

public class TripPlanApplyConflictException extends RuntimeException {

    public TripPlanApplyConflictException() {
        super("The request key has already been used for another plan or a deleted Journey");
    }
}
