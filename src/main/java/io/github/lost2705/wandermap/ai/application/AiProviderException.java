package io.github.lost2705.wandermap.ai.application;

public class AiProviderException extends RuntimeException {

    private final Reason reason;

    public AiProviderException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }

    public AiProviderException(Reason reason, String message, Throwable cause) {
        super(message, cause);
        this.reason = reason;
    }

    public Reason getReason() {
        return reason;
    }

    public enum Reason {
        DISABLED,
        RATE_LIMITED,
        UNAVAILABLE,
        MALFORMED_RESPONSE
    }
}
