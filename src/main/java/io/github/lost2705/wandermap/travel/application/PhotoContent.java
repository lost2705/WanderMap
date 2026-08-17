package io.github.lost2705.wandermap.travel.application;

import java.util.Objects;

public record PhotoContent(String originalFilename, String contentType, byte[] bytes) {

    public PhotoContent {
        bytes = Objects.requireNonNull(bytes, "photo bytes must not be null").clone();
    }

    @Override
    public byte[] bytes() {
        return bytes.clone();
    }
}

