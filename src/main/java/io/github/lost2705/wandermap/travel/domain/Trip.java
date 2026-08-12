package io.github.lost2705.wandermap.travel.domain;

import jakarta.persistence.Column;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/**
 * The future aggregate root for a personal travel itinerary.
 */
@Entity
@Table(name = "trips")
public class Trip {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "name", nullable = false, length = 200)
    @NotBlank
    @Size(max = 200)
    private String name;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "end_date")
    private LocalDate endDate;

    @OneToMany(mappedBy = "trip", cascade = {CascadeType.PERSIST, CascadeType.MERGE}, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<TripStop> stops = new ArrayList<>();

    protected Trip() {
    }

    public Trip(String name, LocalDate startDate, LocalDate endDate) {
        this.id = UUID.randomUUID();
        updateDetails(name, startDate, endDate);
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public void rename(String name) {
        this.name = requireName(name);
    }

    public void changeDates(LocalDate startDate, LocalDate endDate) {
        validateDateRange(startDate, endDate);
        this.startDate = startDate;
        this.endDate = endDate;
    }

    public void updateDetails(String name, LocalDate startDate, LocalDate endDate) {
        String normalizedName = requireName(name);
        validateDateRange(startDate, endDate);
        this.name = normalizedName;
        this.startDate = startDate;
        this.endDate = endDate;
    }

    /**
     * Returns a read-only snapshot of the itinerary in its current order.
     */
    public List<TripStop> getStops() {
        return List.copyOf(stops);
    }

    public TripStop addStop(City city) {
        TripStop stop = new TripStop(
                this, Objects.requireNonNull(city, "city must not be null"), stops.size() + 1);
        stops.add(stop);
        renumberStops();
        return stop;
    }

    public void removeStop(UUID stopId) {
        TripStop stop = findStop(stopId);
        stops.remove(stop);
        renumberStops();
    }

    public void moveStop(UUID stopId, int targetPosition) {
        TripStop stop = findStop(stopId);
        if (targetPosition < 1 || targetPosition > stops.size()) {
            throw new IllegalArgumentException("target position must be between 1 and " + stops.size());
        }

        int currentIndex = stops.indexOf(stop);
        int targetIndex = targetPosition - 1;
        if (currentIndex == targetIndex) {
            return;
        }

        stops.remove(currentIndex);
        stops.add(targetIndex, stop);
        renumberStops();
    }

    private TripStop findStop(UUID stopId) {
        Objects.requireNonNull(stopId, "stop id must not be null");
        return stops.stream()
                .filter(stop -> stopId.equals(stop.getId()))
                .findFirst()
                .orElseThrow(() -> new TripStopNotFoundException(stopId));
    }

    private void renumberStops() {
        for (int index = 0; index < stops.size(); index++) {
            stops.get(index).changePosition(index + 1);
        }
    }

    private static void validateDateRange(LocalDate startDate, LocalDate endDate) {
        if (startDate != null && endDate != null && startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("start date must not be after end date");
        }
    }

    private static String requireName(String name) {
        if (name == null || name.strip().isEmpty()) {
            throw new IllegalArgumentException("trip name must not be blank");
        }

        String normalizedName = name.strip();
        if (normalizedName.length() > 200) {
            throw new IllegalArgumentException("trip name must not exceed 200 characters");
        }
        return normalizedName;
    }
}
