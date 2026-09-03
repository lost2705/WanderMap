package io.github.lost2705.wandermap.identity.application;

public class DuplicateEmailException extends RuntimeException {

    public DuplicateEmailException() {
        super("An account already exists for this email");
    }
}
