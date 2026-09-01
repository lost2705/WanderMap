package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Resolves provider-neutral city input to WanderMap's canonical persisted city identity. */
@Service
public class CityResolutionService {

    private static final Logger LOGGER = LoggerFactory.getLogger(CityResolutionService.class);

    private final CountryRepository countryRepository;
    private final CityRepository cityRepository;
    private final CityLocationResolver cityLocationResolver;

    public CityResolutionService(
            CountryRepository countryRepository,
            CityRepository cityRepository,
            CityLocationResolver cityLocationResolver) {
        this.countryRepository = countryRepository;
        this.cityRepository = cityRepository;
        this.cityLocationResolver = cityLocationResolver;
    }

    public City resolve(String countryCode, String cityName, BigDecimal latitude, BigDecimal longitude) {
        String normalizedCountryCode = normalizeCountryCode(countryCode);
        Country country = countryRepository.findById(normalizedCountryCode)
                .orElseThrow(() -> new CountryNotFoundException(normalizedCountryCode));
        String normalizedName = City.normalizeName(cityName);
        CityLocation selectedLocation = locationFrom(latitude, longitude);
        CityLocation location = selectedLocation != null
                ? selectedLocation
                : resolveLegacyLocation(country, normalizedName, cityName);

        return findByIdentity(country, normalizedName, location)
                .or(() -> findAndEnrichUnlocatedCity(country, normalizedName, location))
                .orElseGet(() -> cityRepository.save(new City(country, cityName, location)));
    }

    private Optional<City> findByIdentity(Country country, String normalizedName, CityLocation location) {
        if (location == null) {
            return cityRepository.findByIdentity(country.getCode(), normalizedName, null, null);
        }
        return cityRepository.findByIdentity(
                country.getCode(), normalizedName, location.latitude(), location.longitude());
    }

    private Optional<City> findAndEnrichUnlocatedCity(
            Country country, String normalizedName, CityLocation location) {
        if (location == null) {
            return Optional.empty();
        }
        return cityRepository.findByIdentity(country.getCode(), normalizedName, null, null)
                .map(city -> {
                    city.applyLocation(location);
                    return city;
                });
    }

    private CityLocation resolveLegacyLocation(Country country, String normalizedName, String cityName) {
        try {
            return cityLocationResolver.resolve(country.getCode(), normalizedName).orElse(null);
        } catch (RuntimeException exception) {
            LOGGER.warn(
                    "Could not resolve a map location for city {} in {}: {}",
                    cityName.strip(),
                    country.getCode(),
                    exception.getMessage());
            return null;
        }
    }

    private static CityLocation locationFrom(BigDecimal latitude, BigDecimal longitude) {
        if (latitude == null && longitude == null) {
            return null;
        }
        if (latitude == null || longitude == null) {
            throw new IllegalArgumentException("latitude and longitude must both be provided");
        }
        return new CityLocation(latitude, longitude);
    }

    private static String normalizeCountryCode(String countryCode) {
        if (countryCode == null) {
            throw new IllegalArgumentException("country code must not be null");
        }
        return countryCode.strip().toUpperCase(Locale.ROOT);
    }
}
