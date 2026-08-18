package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import java.util.List;

public record PlaceDetails(City city, List<TripStop> visits) {

    public PlaceDetails {
        visits = List.copyOf(visits);
    }
}
