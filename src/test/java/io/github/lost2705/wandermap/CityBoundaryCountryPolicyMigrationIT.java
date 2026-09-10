package io.github.lost2705.wandermap;

import static org.assertj.core.api.Assertions.assertThat;

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
class CityBoundaryCountryPolicyMigrationIT extends PostgresIntegrationTestSupport {

    private static final UUID LEGACY_USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Autowired
    private DataSource dataSource;

    @Test
    void invalidatesAffectedPositiveAndNegativeRowsWithoutDeletingTravelData() throws Exception {
        String schema = schemaName();
        UUID amsterdamId = UUID.randomUUID();
        UUID parisId = UUID.randomUUID();
        UUID romeId = UUID.randomUUID();
        UUID vaduzId = UUID.randomUUID();
        UUID tripId = UUID.randomUUID();

        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA " + schema);
            flyway(schema, "12").migrate();
            insertCity(statement, schema, amsterdamId, "NL", "Amsterdam", "52.370216", "4.895168");
            insertCity(statement, schema, parisId, "FR", "Paris", "48.856613", "2.352222");
            insertCity(statement, schema, romeId, "IT", "Rome", "41.902782", "12.496366");
            insertCity(statement, schema, vaduzId, "LI", "Vaduz", "47.141030", "9.520927");
            statement.execute("""
                    INSERT INTO %s.trips (id, name, user_id)
                    VALUES ('%s', 'Policy migration journey', '%s')
                    """.formatted(schema, tripId, LEGACY_USER_ID));
            insertStop(statement, schema, tripId, amsterdamId, 1);
            insertStop(statement, schema, tripId, parisId, 2);
            insertStop(statement, schema, tripId, romeId, 3);
            insertStop(statement, schema, tripId, vaduzId, 4);
            insertAvailable(statement, schema, amsterdamId, "old-amsterdam");
            insertUnavailable(statement, schema, parisId);
            insertAvailable(statement, schema, romeId, "old-rome");
            insertUnavailable(statement, schema, vaduzId);

            flyway(schema, "13").migrate();

            assertThat(count(statement, "SELECT COUNT(*) FROM " + schema
                    + ".city_boundaries WHERE city_id IN ('" + amsterdamId + "', '" + parisId + "', '"
                    + romeId + "', '" + vaduzId + "')"))
                    .isZero();
            assertThat(count(statement, "SELECT COUNT(*) FROM " + schema
                    + ".cities WHERE id IN ('" + amsterdamId + "', '" + parisId + "', '"
                    + romeId + "', '" + vaduzId + "')"))
                    .isEqualTo(4);
            assertThat(count(statement, "SELECT COUNT(*) FROM " + schema
                    + ".countries WHERE code IN ('NL', 'FR', 'IT', 'LI')"))
                    .isEqualTo(4);
            assertThat(count(statement, "SELECT COUNT(*) FROM " + schema + ".trips WHERE id = '" + tripId + "'"))
                    .isEqualTo(1);
            assertThat(count(statement, "SELECT COUNT(*) FROM " + schema
                    + ".trip_stops WHERE trip_id = '" + tripId + "' AND city_id IN ('"
                    + amsterdamId + "', '" + parisId + "', '" + romeId + "', '" + vaduzId + "')"))
                    .isEqualTo(4);
        } finally {
            dropSchema(schema);
        }
    }

    @Test
    void preservesBoundaryRowsForCountriesOutsideTheStageCPolicies() throws Exception {
        String schema = schemaName();
        UUID bostonId = UUID.randomUUID();

        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("CREATE SCHEMA " + schema);
            flyway(schema, "12").migrate();
            insertCity(statement, schema, bostonId, "US", "Boston", "42.360081", "-71.058884");
            insertAvailable(statement, schema, bostonId, "existing-us-boundary");

            flyway(schema, "13").migrate();

            assertThat(count(statement, "SELECT COUNT(*) FROM " + schema
                    + ".city_boundaries WHERE city_id = '" + bostonId + "'"))
                    .isEqualTo(1);
            assertThat(singleString(statement, "SELECT provider_boundary_id FROM " + schema
                    + ".city_boundaries WHERE city_id = '" + bostonId + "'"))
                    .isEqualTo("existing-us-boundary");
            assertThat(count(statement, "SELECT COUNT(*) FROM " + schema
                    + ".cities WHERE id = '" + bostonId + "' AND country_code = 'US'"))
                    .isEqualTo(1);
        } finally {
            dropSchema(schema);
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

    private void dropSchema(String schema) throws Exception {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("DROP SCHEMA IF EXISTS " + schema + " CASCADE");
        }
    }

    private static String schemaName() {
        return "boundary_policy_" + UUID.randomUUID().toString().replace("-", "");
    }

    private static void insertCity(Statement statement, String schema, UUID id, String countryCode, String name,
            String latitude, String longitude) throws Exception {
        statement.execute("""
                INSERT INTO %s.cities (id, country_code, name, normalized_name, latitude, longitude)
                VALUES ('%s', '%s', '%s', '%s', %s, %s)
                """.formatted(schema, id, countryCode, name, name.toLowerCase(), latitude, longitude));
    }

    private static void insertStop(Statement statement, String schema, UUID tripId, UUID cityId, int position)
            throws Exception {
        statement.execute("""
                INSERT INTO %s.trip_stops (id, trip_id, city_id, position)
                VALUES ('%s', '%s', '%s', %d)
                """.formatted(schema, UUID.randomUUID(), tripId, cityId, position));
    }

    private static void insertAvailable(Statement statement, String schema, UUID cityId, String boundaryId)
            throws Exception {
        statement.execute("""
                INSERT INTO %s.city_boundaries
                    (city_id, lookup_status, geometry, display_geometry, provider, provider_boundary_id,
                     checked_at, retry_at)
                VALUES (
                    '%s', 'AVAILABLE',
                    ST_GeomFromText('MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)))', 4326),
                    ST_GeomFromText('MULTIPOLYGON(((0 0, 1 0, 1 1, 0 0)))', 4326),
                    'test', '%s', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days')
                """.formatted(schema, cityId, boundaryId));
    }

    private static void insertUnavailable(Statement statement, String schema, UUID cityId) throws Exception {
        statement.execute("""
                INSERT INTO %s.city_boundaries
                    (city_id, lookup_status, checked_at, retry_at)
                VALUES ('%s', 'UNAVAILABLE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '1 day')
                """.formatted(schema, cityId));
    }

    private static long count(Statement statement, String sql) throws Exception {
        try (ResultSet result = statement.executeQuery(sql)) {
            if (!result.next()) {
                throw new AssertionError("Query returned no row");
            }
            return result.getLong(1);
        }
    }

    private static String singleString(Statement statement, String sql) throws Exception {
        try (ResultSet result = statement.executeQuery(sql)) {
            if (!result.next()) {
                throw new AssertionError("Query returned no row");
            }
            return result.getString(1);
        }
    }
}
