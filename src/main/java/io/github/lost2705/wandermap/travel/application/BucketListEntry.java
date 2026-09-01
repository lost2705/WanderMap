package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.BucketListItem;

public record BucketListEntry(BucketListItem item, boolean visited) {
}
