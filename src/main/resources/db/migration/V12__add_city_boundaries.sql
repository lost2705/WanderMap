-- Shared public geography belongs to City, not its users or Journeys.
CREATE TABLE city_boundaries (
    city_id UUID PRIMARY KEY REFERENCES cities (id) ON DELETE CASCADE,
    lookup_status VARCHAR(32) NOT NULL CHECK (lookup_status IN ('AVAILABLE', 'UNAVAILABLE', 'TEMPORARILY_UNAVAILABLE')),
    geometry geometry(MultiPolygon, 4326),
    display_geometry geometry(MultiPolygon, 4326),
    provider VARCHAR(40),
    provider_boundary_id VARCHAR(100),
    checked_at TIMESTAMPTZ NOT NULL,
    retry_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_city_boundary_geometry CHECK (
        (geometry IS NULL AND display_geometry IS NULL AND lookup_status <> 'AVAILABLE')
        OR (geometry IS NOT NULL AND display_geometry IS NOT NULL
            AND provider IS NOT NULL AND provider_boundary_id IS NOT NULL
            AND lookup_status <> 'UNAVAILABLE'
            AND ST_IsValid(geometry) AND NOT ST_IsEmpty(geometry)
            AND ST_IsValid(display_geometry) AND NOT ST_IsEmpty(display_geometry))
    )
);

-- Access is by the City primary key; no spatial search/index is needed in Phase 1.
