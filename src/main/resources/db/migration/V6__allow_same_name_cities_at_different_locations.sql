ALTER TABLE cities
    DROP CONSTRAINT uq_cities_country_normalized_name,
    ADD CONSTRAINT ck_cities_location_complete CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude IS NOT NULL AND longitude IS NOT NULL)
    );

CREATE UNIQUE INDEX uq_cities_country_name_coordinates
    ON cities (country_code, normalized_name, latitude, longitude)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE UNIQUE INDEX uq_cities_country_name_unlocated
    ON cities (country_code, normalized_name)
    WHERE latitude IS NULL AND longitude IS NULL;
