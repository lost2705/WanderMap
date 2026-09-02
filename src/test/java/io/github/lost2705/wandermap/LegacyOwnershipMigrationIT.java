package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.UUID;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class LegacyOwnershipMigrationIT extends PostgresIntegrationTestSupport {

    private static final UUID LEGACY_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Autowired
    private DataSource dataSource;

    @Test
    void backfillsExistingTripsAndBucketItemsWithoutLosingCanonicalPlaces() throws Exception {
        String schema = "legacy_" + UUID.randomUUID().toString().replace("-", "");
        UUID cityId = UUID.randomUUID();
        UUID tripId = UUID.randomUUID();
        UUID bucketId = UUID.randomUUID();

        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA " + schema);
            flyway(schema, "9").migrate();
            statement.execute("""
                    INSERT INTO %s.cities (id, country_code, name, normalized_name)
                    VALUES ('%s', 'IT', 'Legacy Rome', 'legacy rome')
                    """.formatted(schema, cityId));
            statement.execute("""
                    INSERT INTO %s.trips (id, name)
                    VALUES ('%s', 'Legacy journey')
                    """.formatted(schema, tripId));
            statement.execute("""
                    INSERT INTO %s.bucket_list_items (id, city_id, created_at)
                    VALUES ('%s', '%s', CURRENT_TIMESTAMP)
                    """.formatted(schema, bucketId, cityId));

            flyway(schema, "10").migrate();

            assertThat(singleUuid(statement, "SELECT user_id FROM " + schema + ".trips WHERE id = '" + tripId + "'"))
                    .isEqualTo(LEGACY_USER_ID);
            assertThat(singleUuid(
                            statement,
                            "SELECT user_id FROM " + schema + ".bucket_list_items WHERE id = '" + bucketId + "'"))
                    .isEqualTo(LEGACY_USER_ID);
            assertThat(singleLong(statement, "SELECT COUNT(*) FROM " + schema + ".cities WHERE id = '" + cityId + "'"))
                    .isEqualTo(1);
            assertThat(singleLong(statement,
                            "SELECT COUNT(*) FROM " + schema
                                    + ".users WHERE id = '" + LEGACY_USER_ID + "' AND email = 'legacy@wandermap.local'"))
                    .isEqualTo(1);

            assertThatThrownBy(() -> statement.execute(
                            "DELETE FROM " + schema + ".users WHERE id = '" + LEGACY_USER_ID + "'"))
                    .hasMessageContaining("fk_trips_user");
            assertThat(singleLong(statement, "SELECT COUNT(*) FROM " + schema + ".cities WHERE id = '" + cityId + "'"))
                    .isEqualTo(1);
        } finally {
            try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
                statement.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
            }
        }
    }

    private Flyway flyway(String schema, String target) {
        return Flyway.configure()
                .dataSource(dataSource)
                .defaultSchema(schema)
                .schemas(schema)
                .locations("classpath:db/migration")
                .target(target)
                .load();
    }

    private static UUID singleUuid(Statement statement, String sql) throws Exception {
        try (ResultSet result = statement.executeQuery(sql)) {
            if (!result.next()) {
                throw new AssertionError("Query returned no row");
            }
            return result.getObject(1, UUID.class);
        }
    }

    private static long singleLong(Statement statement, String sql) throws Exception {
        try (ResultSet result = statement.executeQuery(sql)) {
            if (!result.next()) {
                throw new AssertionError("Query returned no row");
            }
            return result.getLong(1);
        }
    }
}
