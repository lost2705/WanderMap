ALTER TABLE cities
    ADD COLUMN latitude NUMERIC(8, 6),
    ADD COLUMN longitude NUMERIC(9, 6),
    ADD CONSTRAINT ck_cities_latitude_range CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT ck_cities_longitude_range CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
