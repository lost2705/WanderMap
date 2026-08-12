package io.github.lost2705.wandermap.travel.application;

import java.util.UUID;

/**
 * Raised when a requested trip does not exist.
 */
public class TripNotFoundException extends RuntimeException {

    public TripNotFoundException(UUID tripId) {
        super("trip not found: " + tripId);
    }
}
