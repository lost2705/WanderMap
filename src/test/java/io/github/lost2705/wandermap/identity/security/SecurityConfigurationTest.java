package io.github.lost2705.wandermap.identity.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicReference;
import javax.crypto.SecretKey;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.StandardEnvironment;

class SecurityConfigurationTest {

    private static final String VALID_SECRET = Base64.getEncoder()
            .encodeToString("01234567890123456789012345678901".getBytes(StandardCharsets.UTF_8));

    @Test
    void localProfileAllowsAnEphemeralKeyAndUsesAnInsecureLocalhostCookie() {
        AtomicReference<byte[]> firstKey = new AtomicReference<>();
        localContext().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(AuthProperties.class).secureCookie()).isFalse();
            assertThat(context.getEnvironment().getActiveProfiles()).containsExactly("local");
            firstKey.set(context.getBean(SecretKey.class).getEncoded());
        });

        localContext().run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(SecretKey.class).getEncoded())
                    .hasSize(32)
                    .isNotEqualTo(firstKey.get());
        });
    }

    @Test
    void defaultConfigurationRequiresASecretAndUsesSecureCookies() {
        productionContext("").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .hasRootCauseMessage("WANDERMAP_JWT_SECRET is required outside the explicit local profile");
        });

        propertiesContext().run(context -> {
            assertThat(context).hasNotFailed();
            AuthProperties properties = context.getBean(AuthProperties.class);
            assertThat(properties.secureCookie()).isTrue();
            assertThat(context.getEnvironment().getActiveProfiles()).isEmpty();
        });
    }

    @Test
    void rejectsInvalidAndTooShortConfiguredSecrets() {
        productionContext("not-base64!").run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .hasStackTraceContaining("WANDERMAP_JWT_SECRET must be valid Base64");
        });

        String shortSecret = Base64.getEncoder()
                .encodeToString("only-sixteen-byte".getBytes(StandardCharsets.UTF_8));
        productionContext(shortSecret).run(context -> {
            assertThat(context).hasFailed();
            assertThat(context.getStartupFailure())
                    .hasRootCauseMessage("WANDERMAP_JWT_SECRET must decode to at least 32 bytes");
        });
    }

    @Test
    void acceptsAConfiguredSecretWithAtLeastThirtyTwoDecodedBytes() {
        productionContext(VALID_SECRET).run(context -> {
            assertThat(context).hasNotFailed();
            assertThat(context.getBean(AuthProperties.class).secureCookie()).isTrue();
            assertThat(context.getBean(SecretKey.class).getEncoded())
                    .containsExactly("01234567890123456789012345678901".getBytes(StandardCharsets.UTF_8));
        });
    }

    private static ApplicationContextRunner localContext() {
        return baseContext()
                .withPropertyValues("spring.profiles.active=local")
                .withUserConfiguration(SigningKeyConfiguration.class);
    }

    private static ApplicationContextRunner productionContext(String secret) {
        return baseContext()
                .withPropertyValues("wandermap.auth.jwt-secret=" + secret)
                .withUserConfiguration(SigningKeyConfiguration.class);
    }

    private static ApplicationContextRunner propertiesContext() {
        return baseContext().withUserConfiguration(PropertiesConfiguration.class);
    }

    private static ApplicationContextRunner baseContext() {
        return new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withInitializer(SecurityConfigurationTest::removeHostConfiguration);
    }

    private static void removeHostConfiguration(ConfigurableApplicationContext context) {
        context.getEnvironment()
                .getPropertySources()
                .remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        context.getEnvironment()
                .getPropertySources()
                .remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AuthProperties.class)
    static class PropertiesConfiguration {
    }

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(AuthProperties.class)
    static class SigningKeyConfiguration {

        @Bean
        SecretKey jwtSigningKey(AuthProperties properties, Environment environment) {
            return new SecurityConfiguration().jwtSigningKey(properties, environment);
        }
    }
}
