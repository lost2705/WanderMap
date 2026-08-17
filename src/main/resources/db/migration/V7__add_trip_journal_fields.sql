ALTER TABLE trips
    ADD COLUMN description TEXT;

ALTER TABLE trip_stops
    ADD COLUMN arrival_date DATE,
    ADD COLUMN departure_date DATE,
    ADD COLUMN note TEXT,
    ADD CONSTRAINT ck_trip_stops_date_range CHECK (
        arrival_date IS NULL OR departure_date IS NULL OR arrival_date <= departure_date
    );
