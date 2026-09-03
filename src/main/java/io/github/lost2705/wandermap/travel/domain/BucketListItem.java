package io.github.lost2705.wandermap.travel.domain;

import io.github.lost2705.wandermap.identity.domain.UserAccount;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** A canonical city the traveller wants to visit, independent of recorded TripStops. */
@Entity
@Table(
        name = "bucket_list_items",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_bucket_list_items_user_city",
                columnNames = {"user_id", "city_id"}))
public class BucketListItem {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false, updatable = false)
    @NotNull
    private UserAccount user;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "city_id", nullable = false, updatable = false)
    @NotNull
    private City city;

    @Column(name = "created_at", nullable = false, updatable = false)
    @NotNull
    private Instant createdAt;

    protected BucketListItem() {
    }

    public BucketListItem(UserAccount user, City city) {
        this.id = UUID.randomUUID();
        this.user = Objects.requireNonNull(user, "user must not be null");
        this.city = Objects.requireNonNull(city, "city must not be null");
        this.createdAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public UserAccount getUser() {
        return user;
    }

    public City getCity() {
        return city;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
