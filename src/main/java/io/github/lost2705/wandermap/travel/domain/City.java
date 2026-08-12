package io.github.lost2705.wandermap.travel.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;

/**
 * A locally known city.
 *
 * <p>City matching is intentionally limited to whitespace normalization and lower-casing with
 * {@link Locale#ROOT}. It does not yet handle transliteration, aliases, or external city IDs.
 */
@Entity
@Table(
        name = "cities",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_cities_country_normalized_name",
                columnNames = {"country_code", "normalized_name"}))
public class City {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "country_code", nullable = false, updatable = false)
    @NotNull
    private Country country;

    @Column(name = "name", nullable = false, length = 160)
    @NotBlank
    @Size(max = 160)
    private String name;

    @Column(name = "normalized_name", nullable = false, updatable = false, length = 160)
    @NotBlank
    @Size(max = 160)
    private String normalizedName;

    @Column(name = "latitude", precision = 8, scale = 6)
    private BigDecimal latitude;

    @Column(name = "longitude", precision = 9, scale = 6)
    private BigDecimal longitude;

    protected City() {
    }

    public City(Country country, String name) {
        this(country, name, null);
    }

    public City(Country country, String name, CityLocation location) {
        this.id = UUID.randomUUID();
        this.country = Objects.requireNonNull(country, "country must not be null");
        this.name = requireDisplayName(name);
        this.normalizedName = normalizeName(name);
        applyLocation(location);
    }

    public UUID getId() {
        return id;
    }

    public Country getCountry() {
        return country;
    }

    public String getName() {
        return name;
    }

    public String getNormalizedName() {
        return normalizedName;
    }

    public BigDecimal getLatitude() {
        return latitude;
    }

    public BigDecimal getLongitude() {
        return longitude;
    }

    public boolean hasLocation() {
        return latitude != null && longitude != null;
    }

    public void applyLocation(CityLocation location) {
        if (location == null) {
            return;
        }
        this.latitude = location.latitude();
        this.longitude = location.longitude();
    }

    public static String normalizeName(String name) {
        if (name == null) {
            throw new IllegalArgumentException("city name must not be null");
        }

        String normalizedName = name.strip().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        if (normalizedName.isEmpty()) {
            throw new IllegalArgumentException("city name must not be blank");
        }
        if (normalizedName.length() > 160) {
            throw new IllegalArgumentException("city name must not exceed 160 characters");
        }
        return normalizedName;
    }

    private static String requireDisplayName(String name) {
        if (name == null || name.strip().isEmpty()) {
            throw new IllegalArgumentException("city name must not be blank");
        }

        String displayName = name.strip();
        if (displayName.length() > 160) {
            throw new IllegalArgumentException("city name must not exceed 160 characters");
        }
        return displayName;
    }
}
