package io.github.lost2705.wandermap.ai.application;

public class InvalidTripPlanException extends RuntimeException {

    public InvalidTripPlanException(String message) {
        super(message);
    }

    public InvalidTripPlanException(String message, Throwable cause) {
        super(message, cause);
    }
}
