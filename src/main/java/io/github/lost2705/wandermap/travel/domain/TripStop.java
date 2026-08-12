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
import jakarta.validation.constraints.NotNull;
import java.util.Objects;
import java.util.UUID;

/**
 * A city in a trip itinerary. Position is 1-based and its management belongs to a later use case.
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

    protected TripStop() {
    }

    public TripStop(Trip trip, City city, int position) {
        if (position < 1) {
            throw new IllegalArgumentException("trip stop position must be at least 1");
        }

        this.id = UUID.randomUUID();
        this.trip = Objects.requireNonNull(trip, "trip must not be null");
        this.city = Objects.requireNonNull(city, "city must not be null");
        this.position = position;
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
}
