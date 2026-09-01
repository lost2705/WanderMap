package io.github.lost2705.wandermap.travel.application;

import java.util.UUID;

public class BucketListItemNotFoundException extends RuntimeException {

    public BucketListItemNotFoundException(UUID itemId) {
        super("bucket list item not found: " + itemId);
    }
}
