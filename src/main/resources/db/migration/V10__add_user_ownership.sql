CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_users_email UNIQUE (email),
    CONSTRAINT ck_users_email_normalized CHECK (email = LOWER(BTRIM(email))),
    CONSTRAINT ck_users_email_not_blank CHECK (BTRIM(email) <> ''),
    CONSTRAINT ck_users_password_hash_not_blank CHECK (BTRIM(password_hash) <> ''),
    CONSTRAINT ck_users_display_name_not_blank CHECK (BTRIM(display_name) <> '')
);

-- Existing single-user data is retained under a deterministic, login-disabled owner.
INSERT INTO users (id, email, password_hash, display_name, created_at)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'legacy@wandermap.local',
    '$2a$12$w9JmI1su0eImiGRIeVg4FeZ1lxRhVJ6uP2J5E7x8pR9qS0tU1vW2x',
    'Legacy Wanderer',
    CURRENT_TIMESTAMP
);

ALTER TABLE trips ADD COLUMN user_id UUID;
UPDATE trips SET user_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE trips ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE trips
    ADD CONSTRAINT fk_trips_user FOREIGN KEY (user_id) REFERENCES users (id);
CREATE INDEX idx_trips_user_name_id ON trips (user_id, name, id);

ALTER TABLE bucket_list_items DROP CONSTRAINT uq_bucket_list_items_city;
ALTER TABLE bucket_list_items ADD COLUMN user_id UUID;
UPDATE bucket_list_items SET user_id = '00000000-0000-0000-0000-000000000001';
ALTER TABLE bucket_list_items ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE bucket_list_items
    ADD CONSTRAINT fk_bucket_list_items_user FOREIGN KEY (user_id) REFERENCES users (id);
ALTER TABLE bucket_list_items
    ADD CONSTRAINT uq_bucket_list_items_user_city UNIQUE (user_id, city_id);
DROP INDEX idx_bucket_list_items_created_at_id;
CREATE INDEX idx_bucket_list_items_user_created_at_id
    ON bucket_list_items (user_id, created_at, id);
