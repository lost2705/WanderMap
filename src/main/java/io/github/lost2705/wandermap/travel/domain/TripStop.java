package io.github.lost2705.wandermap.travel.domain;

import jakarta.persistence.Column;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * A city in a trip itinerary. {@link Trip} exclusively controls its position.
 */
@Entity
@Table(
        name = "trip_stops",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_trip_stops_trip_position",
                columnNames = {"trip_id", "position"}))
public class TripStop {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "trip_id", nullable = false, updatable = false)
    @NotNull
    private Trip trip;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "city_id", nullable = false, updatable = false)
    @NotNull
    private City city;

    @Column(name = "position", nullable = false)
    @Min(1)
    private int position;

    @Column(name = "arrival_date")
    private LocalDate arrivalDate;

    @Column(name = "departure_date")
    private LocalDate departureDate;

    @Column(name = "note", columnDefinition = "text")
    private String note;

    @OneToMany(mappedBy = "tripStop", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC, id ASC")
    private List<TripStopPhoto> photos = new ArrayList<>();

    protected TripStop() {
    }

    TripStop(Trip trip, City city, int position) {
        this(trip, city, position, null, null, null);
    }

    TripStop(
            Trip trip,
            City city,
            int position,
            LocalDate arrivalDate,
            LocalDate departureDate,
            String note) {
        if (position < 1) {
            throw new IllegalArgumentException("trip stop position must be at least 1");
        }

        this.id = UUID.randomUUID();
        this.trip = Objects.requireNonNull(trip, "trip must not be null");
        this.city = Objects.requireNonNull(city, "city must not be null");
        this.position = position;
        updateJournal(arrivalDate, departureDate, note);
    }

    public UUID getId() {
        return id;
    }

    public Trip getTrip() {
        return trip;
    }

    public City getCity() {
        return city;
    }

    public int getPosition() {
        return position;
    }

    public LocalDate getArrivalDate() {
        return arrivalDate;
    }

    public LocalDate getDepartureDate() {
        return departureDate;
    }

    public String getNote() {
        return note;
    }

    public List<TripStopPhoto> getPhotos() {
        return List.copyOf(photos);
    }

    public TripStopPhoto addPhoto(
            String storageKey,
            String originalFilename,
            String contentType,
            long size) {
        TripStopPhoto photo = new TripStopPhoto(
                this,
                storageKey,
                originalFilename,
                contentType,
                size,
                photos.size() + 1);
        photos.add(photo);
        return photo;
    }

    public TripStopPhoto getPhoto(UUID photoId) {
        Objects.requireNonNull(photoId, "photo id must not be null");
        return photos.stream()
                .filter(photo -> photoId.equals(photo.getId()))
                .findFirst()
                .orElseThrow(() -> new TripStopPhotoNotFoundException(photoId));
    }

    public TripStopPhoto removePhoto(UUID photoId) {
        TripStopPhoto photo = getPhoto(photoId);
        photos.remove(photo);
        renumberPhotos();
        return photo;
    }

    void updateJournal(LocalDate arrivalDate, LocalDate departureDate, String note) {
        validateDateRange(arrivalDate, departureDate);
        this.arrivalDate = arrivalDate;
        this.departureDate = departureDate;
        this.note = normalizeOptionalText(note);
    }

    static void validateDateRange(LocalDate arrivalDate, LocalDate departureDate) {
        if (arrivalDate != null && departureDate != null && arrivalDate.isAfter(departureDate)) {
            throw new IllegalArgumentException("stop arrival date must not be after departure date");
        }
    }

    void changePosition(int position) {
        if (position < 1) {
            throw new IllegalArgumentException("trip stop position must be at least 1");
        }
        this.position = position;
    }

    private void renumberPhotos() {
        for (int index = 0; index < photos.size(); index++) {
            photos.get(index).changePosition(index + 1);
        }
    }

    private static String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.strip();
    }
}
