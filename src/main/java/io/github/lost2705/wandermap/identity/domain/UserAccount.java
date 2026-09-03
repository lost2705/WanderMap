package io.github.lost2705.wandermap.identity.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

@Entity
@Table(name = "users", uniqueConstraints = @UniqueConstraint(name = "uq_users_email", columnNames = "email"))
public class UserAccount {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "email", nullable = false, updatable = false, length = 320)
    @NotBlank
    @Size(max = 320)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 100)
    @NotBlank
    @Size(max = 100)
    private String passwordHash;

    @Column(name = "display_name", nullable = false, length = 100)
    @NotBlank
    @Size(max = 100)
    private String displayName;

    @Column(name = "created_at", nullable = false, updatable = false)
    @NotNull
    private Instant createdAt;

    protected UserAccount() {
    }

    public UserAccount(String email, String passwordHash, String displayName) {
        this.id = UUID.randomUUID();
        this.email = normalizeEmail(email);
        this.passwordHash = requireText(passwordHash, "password hash", 100);
        this.displayName = requireText(displayName, "display name", 100);
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getDisplayName() {
        return displayName;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public static String normalizeEmail(String email) {
        String normalized = requireText(email, "email", 320).toLowerCase(Locale.ROOT);
        if (!normalized.contains("@")) {
            throw new IllegalArgumentException("email must be valid");
        }
        return normalized;
    }

    private static String requireText(String value, String label, int maximumLength) {
        Objects.requireNonNull(value, label + " must not be null");
        String normalized = value.strip();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException(label + " must not be blank");
        }
        if (normalized.length() > maximumLength) {
            throw new IllegalArgumentException(label + " must not exceed " + maximumLength + " characters");
        }
        return normalized;
    }
}
