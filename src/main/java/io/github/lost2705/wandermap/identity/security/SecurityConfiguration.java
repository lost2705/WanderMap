package io.github.lost2705.wandermap.identity.security;

import jakarta.servlet.http.Cookie;
import java.io.IOException;
import java.security.SecureRandom;
import java.time.Clock;
import java.util.Base64;
import java.util.Set;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.MediaType;
import org.springframework.security.config.ObjectPostProcessor;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfFilter;

@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class SecurityConfiguration {

    private static final Logger LOGGER = LoggerFactory.getLogger(SecurityConfiguration.class);
    private static final int MINIMUM_HS256_KEY_BYTES = 32;
    private static final Set<String> SESSION_AGNOSTIC_PATHS = Set.of(
            "/api/auth/register",
            "/api/auth/login",
            "/api/auth/csrf",
            "/api/health");

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, JwtDecoder jwtDecoder) throws Exception {
        http
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .csrf(csrf -> csrf.spa().withObjectPostProcessor(requireCsrfForCookieAuthentication()))
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(
                                "/api/auth/register",
                                "/api/auth/login",
                                "/api/auth/csrf",
                                "/api/health")
                        .permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll())
                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, exception) -> writeUnauthorized(response)))
                .oauth2ResourceServer(oauth2 -> oauth2
                        .bearerTokenResolver(sessionCookieBearerTokenResolver())
                        .authenticationEntryPoint((request, response, exception) -> writeUnauthorized(response))
                        .jwt(jwt -> jwt.decoder(jwtDecoder)))
                .httpBasic(httpBasic -> httpBasic.disable())
                .formLogin(formLogin -> formLogin.disable())
                .logout(logout -> logout.disable());
        return http.build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }

    @Bean
    SecretKey jwtSigningKey(AuthProperties properties, Environment environment) {
        byte[] keyBytes;
        if (properties.jwtSecret().isBlank()) {
            if (!environment.acceptsProfiles(Profiles.of("local"))) {
                throw new IllegalStateException(
                        "WANDERMAP_JWT_SECRET is required outside the explicit local profile");
            }
            keyBytes = new byte[MINIMUM_HS256_KEY_BYTES];
            new SecureRandom().nextBytes(keyBytes);
            LOGGER.warn("WANDERMAP_JWT_SECRET is not configured; using an ephemeral local-development key");
        } else {
            try {
                keyBytes = Base64.getDecoder().decode(properties.jwtSecret());
            } catch (IllegalArgumentException exception) {
                throw new IllegalStateException("WANDERMAP_JWT_SECRET must be valid Base64", exception);
            }
            if (keyBytes.length < MINIMUM_HS256_KEY_BYTES) {
                throw new IllegalStateException("WANDERMAP_JWT_SECRET must decode to at least 32 bytes");
            }
        }
        return new SecretKeySpec(keyBytes, "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey secretKey) {
        return NimbusJwtEncoder.withSecretKey(secretKey).algorithm(MacAlgorithm.HS256).build();
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey secretKey) {
        NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(secretKey)
                .macAlgorithm(MacAlgorithm.HS256)
                .build();
        decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(JwtSessionService.ISSUER));
        return decoder;
    }

    private static BearerTokenResolver sessionCookieBearerTokenResolver() {
        return request -> {
            if (SESSION_AGNOSTIC_PATHS.contains(request.getServletPath())) {
                return null;
            }
            Cookie[] cookies = request.getCookies();
            if (cookies == null) {
                return null;
            }
            for (Cookie cookie : cookies) {
                if (JwtSessionService.COOKIE_NAME.equals(cookie.getName()) && !cookie.getValue().isBlank()) {
                    return cookie.getValue();
                }
            }
            return null;
        };
    }

    private static ObjectPostProcessor<CsrfFilter> requireCsrfForCookieAuthentication() {
        return new ObjectPostProcessor<>() {
            @Override
            public <O extends CsrfFilter> O postProcess(O filter) {
                // Resource servers normally exempt bearer-token requests. WanderMap's bearer token is
                // carried by a browser cookie, so unsafe requests still require CSRF protection.
                filter.setRequireCsrfProtectionMatcher(CsrfFilter.DEFAULT_CSRF_MATCHER);
                return filter;
            }
        };
    }

    private static void writeUnauthorized(jakarta.servlet.http.HttpServletResponse response) throws IOException {
        response.setStatus(401);
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.getWriter().write(
                "{\"title\":\"Authentication required\",\"status\":401,\"code\":\"AUTH_REQUIRED\"}");
    }
}
