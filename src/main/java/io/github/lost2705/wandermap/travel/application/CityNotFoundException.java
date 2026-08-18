package io.github.lost2705.wandermap.travel.application;

import java.util.UUID;

public class CityNotFoundException extends RuntimeException {

    public CityNotFoundException(UUID cityId) {
        super("City not found: " + cityId);
    }
}
