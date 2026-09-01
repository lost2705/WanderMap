package io.github.lost2705.wandermap.travel.application;

import java.util.UUID;

public class DuplicateBucketListCityException extends RuntimeException {

    public DuplicateBucketListCityException(UUID cityId) {
        super("city is already on the bucket list: " + cityId);
    }
}
