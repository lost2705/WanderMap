package io.github.lost2705.wandermap.travel.domain;

import java.util.UUID;

public class TripStopPhotoNotFoundException extends RuntimeException {

    public TripStopPhotoNotFoundException(UUID photoId) {
        super("trip stop photo not found: " + photoId);
    }
}

