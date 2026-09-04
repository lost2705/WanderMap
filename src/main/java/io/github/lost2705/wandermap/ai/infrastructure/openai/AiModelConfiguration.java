package io.github.lost2705.wandermap.ai.infrastructure.openai;

import io.github.lost2705.wandermap.ai.application.AiModelClient;
import io.github.lost2705.wandermap.ai.application.AiProviderException;
import java.net.http.HttpClient;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.ObjectMapper;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(AiProperties.class)
class AiModelConfiguration {

    @Bean
    AiModelClient aiModelClient(AiProperties properties, ObjectMapper objectMapper) {
        if (!properties.enabled()) {
            return request -> {
                throw new AiProviderException(
                        AiProviderException.Reason.DISABLED,
                        "Travel Assistant is disabled");
            };
        }
        if (!"openai".equalsIgnoreCase(properties.provider())) {
            throw new IllegalStateException("Unsupported WanderMap AI provider: " + properties.provider());
        }
        if (properties.openai().apiKey().isBlank()) {
            throw new IllegalStateException("OPENAI_API_KEY is required when WanderMap AI is enabled");
        }

        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(properties.connectTimeout())
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(properties.readTimeout());
        RestClient restClient = RestClient.builder()
                .baseUrl(properties.openai().baseUrl())
                .requestFactory(requestFactory)
                .defaultHeader(HttpHeaders.AUTHORIZATION, "Bearer " + properties.openai().apiKey())
                .build();
        return new OpenAiResponsesClient(
                restClient,
                properties.model(),
                properties.maxOutputTokens(),
                objectMapper);
    }
}
