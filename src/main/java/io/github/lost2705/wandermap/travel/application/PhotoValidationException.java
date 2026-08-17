package io.github.lost2705.wandermap.travel.application;

public class PhotoValidationException extends RuntimeException {

    private final Reason reason;

    public PhotoValidationException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public Reason getReason() {
        return reason;
    }

    public enum Reason {
        EMPTY,
        UNSUPPORTED_TYPE,
        TOO_LARGE,
        INVALID_CONTENT
    }
}

