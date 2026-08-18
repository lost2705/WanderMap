package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.Trip;
import java.util.List;

public record TripMapOverview(List<Trip> trips, long memoryCount) {

    public TripMapOverview {
        trips = List.copyOf(trips);
        if (memoryCount < 0) {
            throw new IllegalArgumentException("memory count must not be negative");
        }
    }
}
