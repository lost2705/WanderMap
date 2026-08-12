package io.github.lost2705.wandermap.travel.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;

/**
 * Immutable-in-practice reference data for a country supported by WanderMap.
 */
@Entity
@Table(name = "countries")
public class Country {

    @Id
    @Column(name = "code", nullable = false, updatable = false, length = 2)
    @Pattern(regexp = "[A-Z]{2}")
    private String code;

    @Column(name = "name", nullable = false, length = 100)
    @NotBlank
    @Size(max = 100)
    private String name;

    protected Country() {
    }

    public Country(String code, String name) {
        this.code = normalizeCode(code);
        this.name = requireName(name);
    }

    public String getCode() {
        return code;
    }

    public String getName() {
        return name;
    }

    private static String normalizeCode(String code) {
        if (code == null) {
            throw new IllegalArgumentException("country code must not be null");
        }

        String normalizedCode = code.strip().toUpperCase(Locale.ROOT);
        if (!normalizedCode.matches("[A-Z]{2}")) {
            throw new IllegalArgumentException("country code must contain two uppercase letters");
        }
        return normalizedCode;
    }

    private static String requireName(String name) {
        if (name == null || name.strip().isEmpty()) {
            throw new IllegalArgumentException("country name must not be blank");
        }

        String normalizedName = name.strip();
        if (normalizedName.length() > 100) {
            throw new IllegalArgumentException("country name must not exceed 100 characters");
        }
        return normalizedName;
    }
}
