package io.github.lost2705.wandermap;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

abstract class PostgresIntegrationTestSupport {

    private static final DockerImageName POSTGIS_IMAGE =
            DockerImageName.parse("postgis/postgis:17-3.5").asCompatibleSubstituteFor("postgres");

    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(POSTGIS_IMAGE)
                    .withDatabaseName("wandermap")
                    .withUsername("wandermap")
                    .withPassword("wandermap");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void configureDataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
    }
}
