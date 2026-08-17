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

    @Column(name = "description", columnDefinition = "text")
    private String description;

    @OneToMany(mappedBy = "trip", cascade = {CascadeType.PERSIST, CascadeType.MERGE}, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<TripStop> stops = new ArrayList<>();

    protected Trip() {
    }

    public Trip(String name, LocalDate startDate, LocalDate endDate) {
        this(name, startDate, endDate, null);
    }

    public Trip(String name, LocalDate startDate, LocalDate endDate, String description) {
        this.id = UUID.randomUUID();
        updateDetails(name, startDate, endDate, description);
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

    public String getDescription() {
        return description;
    }

    public void rename(String name) {
        this.name = requireName(name);
    }

    public void changeDates(LocalDate startDate, LocalDate endDate) {
        updateDetails(name, startDate, endDate, description);
    }

    public void updateDetails(String name, LocalDate startDate, LocalDate endDate) {
        updateDetails(name, startDate, endDate, description);
    }

    public void updateDetails(String name, LocalDate startDate, LocalDate endDate, String description) {
        String normalizedName = requireName(name);
        validateDateRange(startDate, endDate);
        stops.forEach(stop -> validateStopDates(startDate, endDate, stop.getArrivalDate(), stop.getDepartureDate()));
        this.name = normalizedName;
        this.startDate = startDate;
        this.endDate = endDate;
        this.description = normalizeOptionalText(description);
    }

    /**
     * Returns a read-only snapshot of the itinerary in its current order.
     */
    public List<TripStop> getStops() {
        return List.copyOf(stops);
    }

    public TripStop addStop(City city) {
        return addStop(city, null, null, null);
    }

    public TripStop addStop(City city, LocalDate arrivalDate, LocalDate departureDate, String note) {
        Objects.requireNonNull(city, "city must not be null");
        validateStopDates(startDate, endDate, arrivalDate, departureDate);
        TripStop stop = new TripStop(
                this,
                city,
                stops.size() + 1,
                arrivalDate,
                departureDate,
                note);
        stops.add(stop);
        renumberStops();
        return stop;
    }

    public TripStop updateStopJournal(UUID stopId, LocalDate arrivalDate, LocalDate departureDate, String note) {
        TripStop stop = getStop(stopId);
        validateStopDates(startDate, endDate, arrivalDate, departureDate);
        stop.updateJournal(arrivalDate, departureDate, note);
        return stop;
    }

    public void removeStop(UUID stopId) {
        TripStop stop = getStop(stopId);
        stops.remove(stop);
        renumberStops();
    }

    public void moveStop(UUID stopId, int targetPosition) {
        TripStop stop = getStop(stopId);
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

    public TripStop getStop(UUID stopId) {
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

    private static void validateStopDates(
            LocalDate tripStartDate,
            LocalDate tripEndDate,
            LocalDate arrivalDate,
            LocalDate departureDate) {
        TripStop.validateDateRange(arrivalDate, departureDate);
        if (tripStartDate != null && arrivalDate != null && arrivalDate.isBefore(tripStartDate)) {
            throw new IllegalArgumentException("stop arrival date must not be before trip start date");
        }
        if (tripEndDate != null && departureDate != null && departureDate.isAfter(tripEndDate)) {
            throw new IllegalArgumentException("stop departure date must not be after trip end date");
        }
    }

    private static String normalizeOptionalText(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.strip();
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
