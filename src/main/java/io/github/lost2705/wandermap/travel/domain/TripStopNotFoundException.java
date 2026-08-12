package io.github.lost2705.wandermap.travel.domain;

import java.util.UUID;

/**
 * Raised when a trip operation refers to a stop that is not part of the aggregate.
 */
public class TripStopNotFoundException extends IllegalArgumentException {

    public TripStopNotFoundException(UUID stopId) {
        super("trip does not contain stop " + stopId);
    }
}
