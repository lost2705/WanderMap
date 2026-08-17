package io.github.lost2705.wandermap.travel.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Metadata for one photo attached to a particular itinerary stop. */
@Entity
@Table(
        name = "trip_stop_photos",
        uniqueConstraints = {
            @UniqueConstraint(
                    name = "uq_trip_stop_photos_storage_key",
                    columnNames = "storage_key"),
            @UniqueConstraint(
                    name = "uq_trip_stop_photos_stop_position",
                    columnNames = {"trip_stop_id", "position"})
        })
public class TripStopPhoto {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_stop_id", nullable = false, updatable = false)
    @NotNull
    private TripStop tripStop;

    @Column(name = "storage_key", nullable = false, updatable = false, length = 500)
    @NotBlank
    @Size(max = 500)
    private String storageKey;

    @Column(name = "original_filename", nullable = false, updatable = false, length = 255)
    @NotBlank
    @Size(max = 255)
    private String originalFilename;

    @Column(name = "content_type", nullable = false, updatable = false, length = 50)
    @NotBlank
    @Size(max = 50)
    private String contentType;

    @Column(name = "size_bytes", nullable = false, updatable = false)
    @Min(1)
    private long size;

    @Column(name = "position", nullable = false)
    @Min(1)
    private int position;

    @Column(name = "created_at", nullable = false, updatable = false)
    @NotNull
    private Instant createdAt;

    protected TripStopPhoto() {
    }

    TripStopPhoto(
            TripStop tripStop,
            String storageKey,
            String originalFilename,
            String contentType,
            long size,
            int position) {
        if (size < 1) {
            throw new IllegalArgumentException("photo size must be at least 1 byte");
        }
        if (position < 1) {
            throw new IllegalArgumentException("photo position must be at least 1");
        }
        this.id = UUID.randomUUID();
        this.tripStop = Objects.requireNonNull(tripStop, "trip stop must not be null");
        this.storageKey = requireText(storageKey, "storage key", 500);
        this.originalFilename = requireText(originalFilename, "original filename", 255);
        this.contentType = requireText(contentType, "content type", 50);
        this.size = size;
        this.position = position;
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public TripStop getTripStop() {
        return tripStop;
    }

    public String getStorageKey() {
        return storageKey;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public String getContentType() {
        return contentType;
    }

    public long getSize() {
        return size;
    }

    public int getPosition() {
        return position;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    void changePosition(int position) {
        if (position < 1) {
            throw new IllegalArgumentException("photo position must be at least 1");
        }
        this.position = position;
    }

    private static String requireText(String value, String label, int maximumLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " must not be blank");
        }
        String normalized = value.strip();
        if (normalized.length() > maximumLength) {
            throw new IllegalArgumentException(label + " must not exceed " + maximumLength + " characters");
        }
        return normalized;
    }
}

