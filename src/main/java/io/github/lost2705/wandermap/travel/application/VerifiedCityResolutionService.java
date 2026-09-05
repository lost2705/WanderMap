package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import java.math.BigDecimal;
import org.springframework.stereotype.Service;

/** Verifies an untrusted proposal before passing trusted values to normal city persistence. */
@Service
public class VerifiedCityResolutionService {

    private final CityRepository cities;
    private final CitySearchService search;
    private final CityResolutionService resolution;

    public VerifiedCityResolutionService(
            CityRepository cities, CitySearchService search, CityResolutionService resolution) {
        this.cities = cities;
        this.search = search;
        this.resolution = resolution;
    }

    public City resolve(
            String cityName, String countryCode, String countryName, BigDecimal latitude, BigDecimal longitude) {
        String normalizedName = City.normalizeName(cityName);
        CityLocation location = new CityLocation(latitude, longitude);
        var existing = cities.findByIdentity(
                countryCode, normalizedName, location.latitude(), location.longitude());
        if (existing.isPresent() && sameText(countryName, existing.get().getCountry().getName())) {
            return existing.get();
        }

        // All submitted identity fields must match ONE result. Never combine fields across results.
        var match = search.searchCities(cityName).stream()
                .filter(place -> City.normalizeName(place.name()).equals(normalizedName)
                        && place.countryCode().equals(countryCode)
                        && sameText(place.countryName(), countryName)
                        && place.latitude().compareTo(location.latitude()) == 0
                        && place.longitude().compareTo(location.longitude()) == 0)
                .findFirst()
                .orElseThrow(PlaceUnresolvedException::new);
        try {
            return resolution.resolve(match.countryCode(), match.name(), match.latitude(), match.longitude());
        } catch (CountryNotFoundException exception) {
            throw new PlaceUnresolvedException();
        }
    }

    private static boolean sameText(String left, String right) {
        return City.normalizeName(left).equals(City.normalizeName(right));
    }
}
