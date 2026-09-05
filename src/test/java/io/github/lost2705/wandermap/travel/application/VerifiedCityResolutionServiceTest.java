package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class VerifiedCityResolutionServiceTest {

    @Mock private CityRepository cities;
    @Mock private CitySearchService search;
    @Mock private CityResolutionService persistence;
    private VerifiedCityResolutionService service;

    @BeforeEach
    void setUp() {
        service = new VerifiedCityResolutionService(cities, search, persistence);
    }

    @Test
    void reusesExactCanonicalCityWithWhitespaceCaseAndPersistedCoordinateRounding() {
        City rome = city("Rome", "IT", "Italy", "41.9028", "12.4964");
        when(cities.findByIdentity("IT", "rome", decimal("41.902800"), decimal("12.496400")))
                .thenReturn(Optional.of(rome));
        assertThat(service.resolve("  rOmE ", "IT", " ITALY ", decimal("41.9028001"), decimal("12.4964001")))
                .isSameAs(rome);
        verifyNoInteractions(search, persistence);
    }

    @Test
    void persistsOnlyVerifiedProviderValuesForANewUnicodePlace() {
        CitySearchResult result = result("São Paulo", "BR", "Brazil", "-23.55052", "-46.633308");
        City city = city(result.name(), "BR", "Brazil", "-23.55052", "-46.633308");
        when(search.searchCities("  SÃO   PAULO ")).thenReturn(List.of(result));
        when(persistence.resolve("BR", "São Paulo", result.latitude(), result.longitude())).thenReturn(city);
        assertThat(service.resolve("  SÃO   PAULO ", "BR", "BRAZIL", result.latitude(), result.longitude()))
                .isSameAs(city);
        verify(persistence).resolve("BR", "São Paulo", result.latitude(), result.longitude());
    }

    @ParameterizedTest
    @CsvSource({
            "Paris,IT,Italy,41.9028,12.4964",
            "Rome,FR,France,41.9028,12.4964",
            "Rome,IT,France,41.9028,12.4964",
            "Rome,IT,Italy,41.9029,12.4964",
            "Rome,IT,Italy,48.8566,2.3522",
            "Rome,ZZ,Nowhere,41.9028,12.4964"
    })
    void rejectsHybridNamesCountriesAndCoordinates(String name, String code, String country, String lat, String lon) {
        when(search.searchCities(any())).thenReturn(List.of(
                result("Rome", "IT", "Italy", "41.9028", "12.4964"),
                result("Paris", "FR", "France", "48.8566", "2.3522")));
        assertThatThrownBy(() -> service.resolve(name, code, country, decimal(lat), decimal(lon)))
                .isInstanceOf(PlaceUnresolvedException.class);
        verifyNoInteractions(persistence);
    }

    @Test
    void rejectsUnresolvedPlacesWithoutWriting() {
        when(search.searchCities(any())).thenReturn(List.of());
        assertThatThrownBy(() -> service.resolve("Unknown", "IT", "Italy", decimal("1"), decimal("2")))
                .isInstanceOf(PlaceUnresolvedException.class);
        verifyNoInteractions(persistence);
    }

    @Test
    void preservesSameNameCitiesInDifferentCountriesAndDifferentUsLocations() {
        var italian = result("Florence", "IT", "Italy", "43.7696", "11.2558");
        var alabama = result("Florence", "US", "United States", "34.7998", "-87.6773");
        var carolina = result("Florence", "US", "United States", "34.1954", "-79.7626");
        when(search.searchCities("Florence")).thenReturn(List.of(italian, alabama, carolina));
        when(persistence.resolve(any(), any(), any(), any())).thenAnswer(call ->
                city(call.getArgument(1), call.getArgument(0), "Country",
                        call.getArgument(2).toString(), call.getArgument(3).toString()));
        var resolved = List.of(italian, alabama, carolina).stream().map(place -> service.resolve(
                place.name(), place.countryCode(), place.countryName(), place.latitude(), place.longitude())).toList();
        assertThat(resolved).extracting(City::getLatitude)
                .containsExactly(italian.latitude(), alabama.latitude(), carolina.latitude());
        assertThat(resolved).extracting(City::getId).doesNotHaveDuplicates();
    }

    private static BigDecimal decimal(String value) { return new BigDecimal(value); }

    private static City city(String name, String code, String country, String lat, String lon) {
        return new City(new Country(code, country), name, new CityLocation(decimal(lat), decimal(lon)));
    }

    private static CitySearchResult result(String name, String code, String country, String lat, String lon) {
        return new CitySearchResult(name, country, null, code, decimal(lat), decimal(lon));
    }
}
