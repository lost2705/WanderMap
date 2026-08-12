package io.github.lost2705.wandermap.travel.infrastructure.geocoding;

import io.github.lost2705.wandermap.travel.application.CityLocationResolver;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

/**
 * A deterministic starter catalog for common demo cities.
 *
 * <p>This is intentionally not a network geocoder. Unknown cities remain valid and simply have
 * no map marker until a future, explicitly configured provider is added behind
 * {@link CityLocationResolver}.
 */
@Component
public class KnownCityLocationResolver implements CityLocationResolver {

    private static final Map<CityKey, CityLocation> LOCATIONS = Map.ofEntries(
            entry("IT", "rome", "41.9028", "12.4964"),
            entry("IT", "florence", "43.7696", "11.2558"),
            entry("IT", "bologna", "44.4949", "11.3426"),
            entry("IT", "venice", "45.4408", "12.3155"),
            entry("IT", "milan", "45.4642", "9.1900"),
            entry("IT", "naples", "40.8518", "14.2681"),
            entry("FR", "paris", "48.8566", "2.3522"),
            entry("FR", "lyon", "45.7640", "4.8357"),
            entry("ES", "madrid", "40.4168", "-3.7038"),
            entry("ES", "barcelona", "41.3874", "2.1686"),
            entry("PT", "lisbon", "38.7223", "-9.1393"),
            entry("GB", "london", "51.5072", "-0.1276"),
            entry("DE", "berlin", "52.5200", "13.4050"),
            entry("NL", "amsterdam", "52.3676", "4.9041"),
            entry("AT", "vienna", "48.2082", "16.3738"),
            entry("CZ", "prague", "50.0755", "14.4378"),
            entry("US", "new york", "40.7128", "-74.0060"),
            entry("US", "san francisco", "37.7749", "-122.4194"),
            entry("CA", "toronto", "43.6532", "-79.3832"),
            entry("JP", "tokyo", "35.6762", "139.6503"),
            entry("AU", "sydney", "-33.8688", "151.2093"));

    @Override
    public Optional<CityLocation> resolve(String countryCode, String normalizedCityName) {
        return Optional.ofNullable(LOCATIONS.get(new CityKey(countryCode, normalizedCityName)));
    }

    private static Map.Entry<CityKey, CityLocation> entry(
            String countryCode, String normalizedCityName, String latitude, String longitude) {
        return Map.entry(
                new CityKey(countryCode, normalizedCityName),
                new CityLocation(new BigDecimal(latitude), new BigDecimal(longitude)));
    }

    private record CityKey(String countryCode, String normalizedCityName) {
    }
}
