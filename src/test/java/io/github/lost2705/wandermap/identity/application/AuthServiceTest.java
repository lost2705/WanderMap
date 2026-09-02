package io.github.lost2705.wandermap.identity.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.identity.persistence.UserAccountRepository;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserAccountRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    private AuthService service;

    @BeforeEach
    void setUp() {
        service = new AuthService(userRepository, passwordEncoder);
    }

    @Test
    void registersANormalizedAccountWithOnlyAnEncodedPassword() {
        when(passwordEncoder.encode("correct horse")).thenReturn("encoded-password");
        when(userRepository.saveAndFlush(any(UserAccount.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        UserAccount user = service.register("  Alice@Example.COM  ", "correct horse", " Alice ");

        assertThat(user.getEmail()).isEqualTo("alice@example.com");
        assertThat(user.getDisplayName()).isEqualTo("Alice");
        assertThat(user.getPasswordHash()).isEqualTo("encoded-password");
        assertThat(user.getPasswordHash()).doesNotContain("correct horse");
    }

    @Test
    void rejectsDuplicateEmailBeforeEncodingAndTranslatesTheUniqueConstraintRace() {
        when(userRepository.existsByEmail("alice@example.com")).thenReturn(true);

        assertThatThrownBy(() -> service.register("ALICE@example.com", "correct horse", "Alice"))
                .isInstanceOf(DuplicateEmailException.class);
        verify(passwordEncoder, never()).encode(any());

        when(userRepository.existsByEmail("bob@example.com")).thenReturn(false);
        when(passwordEncoder.encode("correct horse")).thenReturn("encoded-password");
        when(userRepository.saveAndFlush(any(UserAccount.class)))
                .thenThrow(new DataIntegrityViolationException("uq_users_email"));

        assertThatThrownBy(() -> service.register("bob@example.com", "correct horse", "Bob"))
                .isInstanceOf(DuplicateEmailException.class);
    }

    @Test
    void validatesAReasonablePasswordLength() {
        assertThatThrownBy(() -> service.register("alice@example.com", "short", "Alice"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("at least 8");
        verify(userRepository, never()).saveAndFlush(any());
    }

    @Test
    void acceptsASeventyTwoByteAsciiPassword() {
        String password = "a".repeat(72);
        when(passwordEncoder.encode(password)).thenReturn("encoded-password");
        when(userRepository.saveAndFlush(any(UserAccount.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        assertThat(service.register("alice@example.com", password, "Alice").getPasswordHash())
                .isEqualTo("encoded-password");
        verify(passwordEncoder).encode(password);
    }

    @Test
    void rejectsASeventyThreeByteAsciiPasswordBeforeEncoding() {
        assertThatThrownBy(() -> service.register("alice@example.com", "a".repeat(73), "Alice"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("72 UTF-8 bytes");

        verify(passwordEncoder, never()).encode(any());
        verify(userRepository, never()).saveAndFlush(any());
    }

    @Test
    void rejectsAMultibytePasswordThatCrossesTheBcryptByteLimitBeforeEncoding() {
        String password = "😀".repeat(19);

        assertThatThrownBy(() -> service.register("alice@example.com", password, "Alice"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("72 UTF-8 bytes");

        verify(passwordEncoder, never()).encode(any());
        verify(userRepository, never()).saveAndFlush(any());
    }

    @Test
    void authenticatesOnlyWhenTheStoredHashMatches() {
        UserAccount user = new UserAccount("alice@example.com", "encoded-password", "Alice");
        when(userRepository.findByEmail("alice@example.com")).thenReturn(Optional.of(user));
        when(passwordEncoder.matches("correct horse", "encoded-password")).thenReturn(true);

        assertThat(service.login("ALICE@EXAMPLE.COM", "correct horse")).isSameAs(user);

        when(passwordEncoder.matches("wrong password", "encoded-password")).thenReturn(false);
        assertThatThrownBy(() -> service.login("alice@example.com", "wrong password"))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Email or password is incorrect");
    }

    @Test
    void usesTheSameCredentialErrorForAnUnknownAccount() {
        when(userRepository.findByEmail("unknown@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.login("unknown@example.com", "wrong password"))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Email or password is incorrect");
    }

    @Test
    void rejectsAnOversizedLoginPasswordBeforeMatching() {
        UserAccount user = new UserAccount("alice@example.com", "encoded-password", "Alice");
        when(userRepository.findByEmail("alice@example.com")).thenReturn(Optional.of(user));

        assertThatThrownBy(() -> service.login("alice@example.com", "a".repeat(73)))
                .isInstanceOf(InvalidCredentialsException.class)
                .hasMessage("Email or password is incorrect");
        verify(passwordEncoder, never()).matches(any(), any());
    }
}
