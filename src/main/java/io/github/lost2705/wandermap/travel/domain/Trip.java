package io.github.lost2705.wandermap.travel.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
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

    protected Trip() {
    }

    public Trip(String name, LocalDate startDate, LocalDate endDate) {
        validateDateRange(startDate, endDate);
        this.id = UUID.randomUUID();
        this.name = requireName(name);
        this.startDate = startDate;
        this.endDate = endDate;
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
