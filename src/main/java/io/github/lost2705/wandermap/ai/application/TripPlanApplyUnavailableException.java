package io.github.lost2705.wandermap.ai.application;

public class TripPlanApplyUnavailableException extends RuntimeException {

    public TripPlanApplyUnavailableException(RuntimeException cause) {
        super("Journey creation could not be completed; retry the same request", cause);
    }
}
