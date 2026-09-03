package io.github.lost2705.wandermap.identity.security;

import io.github.lost2705.wandermap.identity.domain.UserAccount;
import java.time.Clock;
import java.time.Instant;
import org.springframework.http.ResponseCookie;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Component;

@Component
public class JwtSessionService {

    public static final String COOKIE_NAME = "WANDERMAP_SESSION";
    static final String ISSUER = "wandermap";

    private final JwtEncoder jwtEncoder;
    private final AuthProperties properties;
    private final Clock clock;

    public JwtSessionService(JwtEncoder jwtEncoder, AuthProperties properties, Clock clock) {
        this.jwtEncoder = jwtEncoder;
        this.properties = properties;
        this.clock = clock;
    }

    public String createSessionCookie(UserAccount user) {
        Instant issuedAt = clock.instant();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(ISSUER)
                .subject(user.getId().toString())
                .issuedAt(issuedAt)
                .expiresAt(issuedAt.plus(properties.tokenTtl()))
                .claim("email", user.getEmail())
                .claim("display_name", user.getDisplayName())
                .build();
        String token = jwtEncoder.encode(JwtEncoderParameters.from(
                        JwsHeader.with(MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
        return sessionCookie(token, properties.tokenTtl()).toString();
    }

    public String clearSessionCookie() {
        return sessionCookie("", java.time.Duration.ZERO).toString();
    }

    private ResponseCookie sessionCookie(String value, java.time.Duration maxAge) {
        return ResponseCookie.from(COOKIE_NAME, value)
                .httpOnly(true)
                .secure(properties.secureCookie())
                .sameSite("Strict")
                .path("/api")
                .maxAge(maxAge)
                .build();
    }
}
