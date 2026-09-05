CREATE TABLE trip_plan_apply_requests (
    user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    trip_id UUID REFERENCES trips (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, request_id)
);

-- A deleted Journey leaves a tombstone: retrying an old key must not recreate it.
CREATE INDEX idx_trip_plan_apply_requests_trip ON trip_plan_apply_requests (trip_id);
