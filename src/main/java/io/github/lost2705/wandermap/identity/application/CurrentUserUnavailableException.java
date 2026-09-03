package io.github.lost2705.wandermap.identity.application;

public class CurrentUserUnavailableException extends RuntimeException {

    public CurrentUserUnavailableException() {
        super("Authentication is required");
    }
}
