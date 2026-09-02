package io.github.lost2705.wandermap;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

@ActiveProfiles("local")
abstract class PostgresIntegrationTestSupport {

    private static final DockerImageName POSTGIS_IMAGE =
            DockerImageName.parse("postgis/postgis:17-3.5").asCompatibleSubstituteFor("postgres");

    private static final PostgreSQLContainer POSTGRES =
            new PostgreSQLContainer(POSTGIS_IMAGE)
                    .withDatabaseName("wandermap")
                    .withUsername("wandermap")
                    .withPassword("wandermap");

    private static final Path PHOTO_STORAGE_ROOT = createPhotoStorageRoot();

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void configureDataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("wandermap.storage.photos.root", () -> PHOTO_STORAGE_ROOT.toString());
        registry.add("wandermap.storage.photos.max-size", () -> "1KB");
    }

    protected static Path photoStorageRoot() {
        return PHOTO_STORAGE_ROOT;
    }

    private static Path createPhotoStorageRoot() {
        try {
            return Files.createTempDirectory("wandermap-test-photos-");
        } catch (IOException exception) {
            throw new ExceptionInInitializerError(exception);
        }
    }
}
