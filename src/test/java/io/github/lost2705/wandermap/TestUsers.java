package io.github.lost2705.wandermap;

import io.github.lost2705.wandermap.identity.domain.UserAccount;
import java.util.UUID;

public final class TestUsers {

    private TestUsers() {
    }

    public static UserAccount user() {
        return user("traveller-" + UUID.randomUUID() + "@example.com");
    }

    public static UserAccount user(String email) {
        return new UserAccount(email, "$2a$12$test-only-password-hash", "Test Traveller");
    }
}
