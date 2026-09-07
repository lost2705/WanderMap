package io.github.lost2705.wandermap.travel.persistence;

import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryClient.Candidate;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryClient.Query;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryGeometry;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryResult.Status;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.ObjectMapper;

/** Native PostGIS through the existing datasource; no Hibernate Spatial mapping is necessary. */
@Repository
public class CityBoundaryRepository {
    private final JdbcClient jdbc;
    private final ObjectMapper mapper;

    public CityBoundaryRepository(JdbcClient jdbc, ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.mapper = mapper;
    }

    public Optional<Cached> find(UUID cityId) {
        return jdbc.sql("""
                SELECT lookup_status, ST_AsGeoJSON(display_geometry, 15) AS geojson, checked_at, retry_at
                FROM city_boundaries WHERE city_id = :id
                """).param("id", cityId).query((rs, row) -> new Cached(
                        Status.valueOf(rs.getString("lookup_status")),
                        rs.getString("geojson") == null ? null : CityBoundaryGeometry.fromJson(mapper.readTree(rs.getString("geojson"))),
                        rs.getTimestamp("checked_at").toInstant(), rs.getTimestamp("retry_at").toInstant())).optional();
    }

    /** Short durable lease prevents concurrent misses from duplicating provider calls, even across instances. */
    public Optional<Instant> claim(UUID cityId, Instant now) {
        return jdbc.sql("""
                INSERT INTO city_boundaries (city_id, lookup_status, checked_at, retry_at)
                VALUES (:id, 'TEMPORARILY_UNAVAILABLE', :now, :lease)
                ON CONFLICT (city_id) DO UPDATE SET retry_at = EXCLUDED.retry_at
                WHERE city_boundaries.retry_at <= :now
                RETURNING retry_at
                """).param("id", cityId).param("now", Timestamp.from(now))
                .param("lease", Timestamp.from(now.plusSeconds(30)))
                .query((rs, row) -> rs.getTimestamp("retry_at").toInstant()).optional();
    }

    public Optional<Verified> verify(CityBoundaryGeometry geometry, Query city) {
        String original = mapper.writeValueAsString(geometry);
        // CASE guards topology operations on invalid geometries. Do not silently ST_MakeValid.
        return jdbc.sql("""
                WITH input AS (SELECT ST_GeomFromGeoJSON(:json) AS g, ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) AS p),
                valid AS (SELECT g, p FROM input WHERE ST_IsValid(g) AND NOT ST_IsEmpty(g)),
                matched AS (SELECT g, p FROM valid WHERE CASE WHEN ST_IsValid(g)
                    THEN ST_Covers(g, p) AND ST_Area(g::geography) <= 20000000000 ELSE false END),
                simplified AS (SELECT g, p, ST_SimplifyPreserveTopology(g, 0.0001) AS s FROM matched),
                display AS (SELECT CASE WHEN ST_Covers(s, p) THEN s ELSE g END AS g, p FROM simplified),
                encoded AS (SELECT ST_AsGeoJSON(g, 15) AS geojson, p FROM display
                    WHERE ST_IsValid(g) AND ST_NPoints(g) <= 10000)
                SELECT geojson FROM encoded WHERE octet_length(geojson) <= 500000
                  AND CASE WHEN ST_IsValid(ST_GeomFromGeoJSON(geojson))
                    THEN ST_Covers(ST_GeomFromGeoJSON(geojson), p) ELSE false END
                """).param("json", original).param("lon", city.longitude()).param("lat", city.latitude())
                .query((rs, row) -> new Verified(original, rs.getString("geojson"))).optional();
    }

    public boolean saveAvailable(UUID id, Candidate candidate, Verified geometry, Instant lease, Instant now, Duration ttl) {
        // Compare the database-returned lease (including PostgreSQL timestamp precision), not just City ID.
        return jdbc.sql("""
                UPDATE city_boundaries SET lookup_status = 'AVAILABLE',
                  geometry = ST_Multi(ST_GeomFromGeoJSON(:original)),
                  display_geometry = ST_Multi(ST_GeomFromGeoJSON(:display)),
                  provider = :provider, provider_boundary_id = :boundary, checked_at = :now, retry_at = :retry
                WHERE city_id = :id AND retry_at = :lease
                """).param("id", id).param("original", geometry.original()).param("display", geometry.display())
                .param("provider", candidate.provider()).param("boundary", candidate.boundaryId())
                .param("lease", Timestamp.from(lease)).param("now", Timestamp.from(now))
                .param("retry", Timestamp.from(now.plus(ttl))).update() == 1;
    }

    public boolean saveNegative(UUID id, Status status, Instant lease, Instant now, Duration ttl) {
        boolean unavailable = status == Status.UNAVAILABLE;
        return jdbc.sql("""
                UPDATE city_boundaries SET lookup_status = :status,
                  geometry = CASE WHEN :clear THEN NULL ELSE geometry END,
                  display_geometry = CASE WHEN :clear THEN NULL ELSE display_geometry END,
                  checked_at = :now, retry_at = :retry WHERE city_id = :id AND retry_at = :lease
                """).param("id", id).param("status", status.name()).param("clear", unavailable)
                .param("lease", Timestamp.from(lease)).param("now", Timestamp.from(now))
                .param("retry", Timestamp.from(now.plus(ttl))).update() == 1;
    }

    public record Cached(Status status, CityBoundaryGeometry geometry, Instant checkedAt, Instant retryAt) {}
    public record Verified(String original, String display) {}
}
