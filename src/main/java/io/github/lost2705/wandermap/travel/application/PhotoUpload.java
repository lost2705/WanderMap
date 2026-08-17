package io.github.lost2705.wandermap.travel.application;

import java.util.Objects;

public record PhotoUpload(String originalFilename, String contentType, byte[] content) {

    public PhotoUpload {
        content = Objects.requireNonNull(content, "photo content must not be null").clone();
    }

    @Override
    public byte[] content() {
        return content.clone();
    }

    public long size() {
        return content.length;
    }
}

