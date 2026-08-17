package io.github.lost2705.wandermap.travel.infrastructure.geocoding;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration(proxyBeanMethods = false)
class GeocodingConfiguration {

    @Bean("geocodingRestClient")
    RestClient geocodingRestClient(
            @Value("${wandermap.geocoding.base-url}") String baseUrl,
            @Value("${wandermap.geocoding.user-agent}") String userAgent,
            @Value("${wandermap.geocoding.connect-timeout-millis}") long connectTimeoutMillis,
            @Value("${wandermap.geocoding.read-timeout-millis}") long readTimeoutMillis) {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(connectTimeoutMillis))
                .build();
        JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
        requestFactory.setReadTimeout(Duration.ofMillis(readTimeoutMillis));

        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(requestFactory)
                .defaultHeader(HttpHeaders.USER_AGENT, userAgent)
                .build();
    }
}
