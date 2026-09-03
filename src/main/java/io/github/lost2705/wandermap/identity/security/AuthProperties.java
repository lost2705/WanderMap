package io.github.lost2705.wandermap.identity.security;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("wandermap.auth")
public record AuthProperties(String jwtSecret, Duration tokenTtl, boolean secureCookie) {

    public AuthProperties {
        jwtSecret = jwtSecret == null ? "" : jwtSecret.strip();
        tokenTtl = tokenTtl == null ? Duration.ofHours(12) : tokenTtl;
        if (tokenTtl.isNegative() || tokenTtl.isZero()) {
            throw new IllegalArgumentException("wandermap.auth.token-ttl must be positive");
        }
    }
}
