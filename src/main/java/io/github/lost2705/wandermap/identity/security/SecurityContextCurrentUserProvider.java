package io.github.lost2705.wandermap.identity.security;

import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.identity.application.CurrentUserUnavailableException;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.identity.persistence.UserAccountRepository;
import java.util.UUID;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

@Component
public class SecurityContextCurrentUserProvider implements CurrentUserProvider {

    private final UserAccountRepository userRepository;

    public SecurityContextCurrentUserProvider(UserAccountRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    public UserAccount getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new CurrentUserUnavailableException();
        }
        UUID userId;
        try {
            userId = UUID.fromString(authentication.getName());
        } catch (IllegalArgumentException exception) {
            throw new CurrentUserUnavailableException();
        }
        return userRepository.findById(userId).orElseThrow(CurrentUserUnavailableException::new);
    }
}
