package io.github.lost2705.wandermap.ai.infrastructure.openai;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("wandermap.ai")
public record AiProperties(
        boolean enabled,
        String provider,
        String model,
        int maxToolIterations,
        int maxToolCalls,
        int maxToolResultCharacters,
        int maxOutputTokens,
        Duration connectTimeout,
        Duration readTimeout,
        OpenAi openai) {

    public AiProperties {
        provider = provider == null || provider.isBlank() ? "openai" : provider.strip();
        model = model == null || model.isBlank() ? "gpt-5-mini" : model.strip();
        maxToolIterations = maxToolIterations == 0 ? 6 : maxToolIterations;
        maxToolCalls = maxToolCalls == 0 ? 12 : maxToolCalls;
        maxToolResultCharacters = maxToolResultCharacters == 0 ? 100_000 : maxToolResultCharacters;
        maxOutputTokens = maxOutputTokens == 0 ? 4_000 : maxOutputTokens;
        connectTimeout = connectTimeout == null ? Duration.ofSeconds(3) : connectTimeout;
        readTimeout = readTimeout == null ? Duration.ofSeconds(45) : readTimeout;
        openai = openai == null ? new OpenAi("https://api.openai.com", "") : openai;
        if (maxToolIterations < 1 || maxToolIterations > 20) {
            throw new IllegalArgumentException("wandermap.ai.max-tool-iterations must be between 1 and 20");
        }
        if (maxToolCalls < 1 || maxToolCalls > 100) {
            throw new IllegalArgumentException("wandermap.ai.max-tool-calls must be between 1 and 100");
        }
        if (maxToolResultCharacters < 1 || maxToolResultCharacters > 1_000_000) {
            throw new IllegalArgumentException(
                    "wandermap.ai.max-tool-result-characters must be between 1 and 1000000");
        }
        if (maxOutputTokens < 1 || maxOutputTokens > 32_768) {
            throw new IllegalArgumentException("wandermap.ai.max-output-tokens must be between 1 and 32768");
        }
        if (connectTimeout.isNegative() || connectTimeout.isZero()
                || readTimeout.isNegative() || readTimeout.isZero()) {
            throw new IllegalArgumentException("WanderMap AI timeouts must be positive");
        }
    }

    public record OpenAi(String baseUrl, String apiKey) {
        public OpenAi {
            baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://api.openai.com" : baseUrl.strip();
            apiKey = apiKey == null ? "" : apiKey.strip();
        }
    }
}
