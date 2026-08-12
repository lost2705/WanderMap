package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class FoundationIT extends PostgresIntegrationTestSupport {

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void foundationIsOperational() throws Exception {
        HttpResponse<String> healthResponse = HttpClient.newHttpClient()
                .send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/health"))
                        .GET()
                        .build(), HttpResponse.BodyHandlers.ofString());

        assertThat(healthResponse.statusCode()).isEqualTo(200);

        JsonNode healthBody = objectMapper.readTree(healthResponse.body());
        assertThat(healthBody.path("status").asText()).isEqualTo("UP");
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '1' AND success = TRUE",
                Integer.class)).isEqualTo(1);
        assertThat(jdbcTemplate.queryForObject("SELECT PostGIS_Version()", String.class)).isNotBlank();
    }
}
