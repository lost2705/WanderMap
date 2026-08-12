ALTER TABLE trip_stops
    DROP CONSTRAINT uq_trip_stops_trip_position;

ALTER TABLE trip_stops
    ADD CONSTRAINT uq_trip_stops_trip_position
    UNIQUE (trip_id, position) DEFERRABLE INITIALLY DEFERRED;
