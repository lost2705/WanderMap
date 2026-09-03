package io.github.lost2705.wandermap.identity.api;

import io.github.lost2705.wandermap.identity.api.dto.CsrfTokenResponse;
import io.github.lost2705.wandermap.identity.api.dto.CurrentUserResponse;
import io.github.lost2705.wandermap.identity.api.dto.LoginRequest;
import io.github.lost2705.wandermap.identity.api.dto.RegisterRequest;
import io.github.lost2705.wandermap.identity.application.AuthService;
import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.identity.security.JwtSessionService;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AuthController {

    private final AuthService authService;
    private final CurrentUserProvider currentUserProvider;
    private final JwtSessionService jwtSessionService;

    public AuthController(
            AuthService authService,
            CurrentUserProvider currentUserProvider,
            JwtSessionService jwtSessionService) {
        this.authService = authService;
        this.currentUserProvider = currentUserProvider;
        this.jwtSessionService = jwtSessionService;
    }

    @PostMapping("/api/auth/register")
    public ResponseEntity<CurrentUserResponse> register(@Valid @RequestBody RegisterRequest request) {
        UserAccount user = authService.register(request.email(), request.password(), request.displayName());
        return ResponseEntity.created(URI.create("/api/me"))
                .header(HttpHeaders.SET_COOKIE, jwtSessionService.createSessionCookie(user))
                .body(toResponse(user));
    }

    @PostMapping("/api/auth/login")
    public ResponseEntity<CurrentUserResponse> login(@Valid @RequestBody LoginRequest request) {
        UserAccount user = authService.login(request.email(), request.password());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, jwtSessionService.createSessionCookie(user))
                .body(toResponse(user));
    }

    @PostMapping("/api/auth/logout")
    public ResponseEntity<Void> logout() {
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, jwtSessionService.clearSessionCookie())
                .build();
    }

    @GetMapping("/api/auth/csrf")
    public CsrfTokenResponse csrf(CsrfToken csrfToken) {
        return new CsrfTokenResponse(csrfToken.getHeaderName(), csrfToken.getToken());
    }

    @GetMapping("/api/me")
    public CurrentUserResponse me() {
        return toResponse(currentUserProvider.getCurrentUser());
    }

    private static CurrentUserResponse toResponse(UserAccount user) {
        return new CurrentUserResponse(user.getId(), user.getEmail(), user.getDisplayName());
    }
}
