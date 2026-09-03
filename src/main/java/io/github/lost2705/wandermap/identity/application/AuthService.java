package io.github.lost2705.wandermap.identity.application;

import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.identity.persistence.UserAccountRepository;
import java.nio.charset.StandardCharsets;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private static final int MINIMUM_PASSWORD_LENGTH = 8;
    private static final int MAXIMUM_PASSWORD_BYTES = 72;

    private final UserAccountRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserAccountRepository userRepository, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public UserAccount register(String email, String password, String displayName) {
        String normalizedEmail = UserAccount.normalizeEmail(email);
        validatePassword(password);
        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new DuplicateEmailException();
        }
        try {
            return userRepository.saveAndFlush(
                    new UserAccount(normalizedEmail, passwordEncoder.encode(password), displayName));
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateEmailException();
        }
    }

    @Transactional(readOnly = true)
    public UserAccount login(String email, String password) {
        String normalizedEmail = UserAccount.normalizeEmail(email);
        UserAccount user = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(InvalidCredentialsException::new);
        if (password == null
                || exceedsBcryptByteLimit(password)
                || !passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }
        return user;
    }

    private static void validatePassword(String password) {
        if (password == null || password.length() < MINIMUM_PASSWORD_LENGTH) {
            throw new IllegalArgumentException("password must contain at least 8 characters");
        }
        if (exceedsBcryptByteLimit(password)) {
            throw new IllegalArgumentException("password must not exceed 72 UTF-8 bytes");
        }
    }

    private static boolean exceedsBcryptByteLimit(String password) {
        return password.getBytes(StandardCharsets.UTF_8).length > MAXIMUM_PASSWORD_BYTES;
    }
}
