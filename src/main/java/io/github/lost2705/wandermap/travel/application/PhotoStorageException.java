package io.github.lost2705.wandermap.travel.application;

public class PhotoStorageException extends RuntimeException {

    public PhotoStorageException(String message, Throwable cause) {
        super(message, cause);
    }

    public PhotoStorageException(String message) {
        super(message);
    }
}

