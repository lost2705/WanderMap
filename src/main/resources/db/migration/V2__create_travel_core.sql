CREATE TABLE countries (
    code VARCHAR(2) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    CONSTRAINT ck_countries_code_uppercase_alpha2 CHECK (code ~ '^[A-Z]{2}$')
);

CREATE TABLE cities (
    id UUID PRIMARY KEY,
    country_code VARCHAR(2) NOT NULL,
    name VARCHAR(160) NOT NULL,
    normalized_name VARCHAR(160) NOT NULL,
    CONSTRAINT fk_cities_country
        FOREIGN KEY (country_code) REFERENCES countries (code),
    CONSTRAINT uq_cities_country_normalized_name
        UNIQUE (country_code, normalized_name)
);

CREATE TABLE trips (
    id UUID PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    start_date DATE,
    end_date DATE,
    CONSTRAINT ck_trips_name_not_blank CHECK (BTRIM(name) <> ''),
    CONSTRAINT ck_trips_date_range CHECK (
        start_date IS NULL OR end_date IS NULL OR start_date <= end_date
    )
);

CREATE TABLE trip_stops (
    id UUID PRIMARY KEY,
    trip_id UUID NOT NULL,
    city_id UUID NOT NULL,
    position INTEGER NOT NULL,
    CONSTRAINT fk_trip_stops_trip
        FOREIGN KEY (trip_id) REFERENCES trips (id) ON DELETE CASCADE,
    CONSTRAINT fk_trip_stops_city
        FOREIGN KEY (city_id) REFERENCES cities (id),
    CONSTRAINT ck_trip_stops_position_positive CHECK (position >= 1),
    CONSTRAINT uq_trip_stops_trip_position UNIQUE (trip_id, position)
);
