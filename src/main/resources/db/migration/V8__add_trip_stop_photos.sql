CREATE TABLE trip_stop_photos (
    id UUID PRIMARY KEY,
    trip_stop_id UUID NOT NULL,
    storage_key VARCHAR(500) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(50) NOT NULL,
    size_bytes BIGINT NOT NULL,
    position INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT fk_trip_stop_photos_stop
        FOREIGN KEY (trip_stop_id) REFERENCES trip_stops (id) ON DELETE CASCADE,
    CONSTRAINT uq_trip_stop_photos_storage_key UNIQUE (storage_key),
    CONSTRAINT ck_trip_stop_photos_size_positive CHECK (size_bytes > 0),
    CONSTRAINT ck_trip_stop_photos_position_positive CHECK (position >= 1),
    CONSTRAINT uq_trip_stop_photos_stop_position
        UNIQUE (trip_stop_id, position) DEFERRABLE INITIALLY DEFERRED
);

