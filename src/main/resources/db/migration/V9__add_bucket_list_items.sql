CREATE TABLE bucket_list_items (
    id UUID PRIMARY KEY,
    city_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_bucket_list_items_city
        FOREIGN KEY (city_id) REFERENCES cities (id),
    CONSTRAINT uq_bucket_list_items_city UNIQUE (city_id)
);

CREATE INDEX idx_bucket_list_items_created_at_id
    ON bucket_list_items (created_at, id);
