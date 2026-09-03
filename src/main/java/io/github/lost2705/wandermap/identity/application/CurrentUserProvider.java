package io.github.lost2705.wandermap.identity.application;

import io.github.lost2705.wandermap.identity.domain.UserAccount;

public interface CurrentUserProvider {

    UserAccount getCurrentUser();
}
