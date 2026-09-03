package io.github.lost2705.wandermap.identity.api.dto;

import java.util.UUID;

public record CurrentUserResponse(UUID id, String email, String displayName) {
}
