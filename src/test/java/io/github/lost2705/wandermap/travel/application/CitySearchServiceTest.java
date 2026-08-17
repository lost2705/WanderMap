package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CitySearchServiceTest {

    @Mock
    private GeocodingClient geocodingClient;

    @Test
    void normalizesAUsableQueryBeforeSearching() {
        CitySearchResult florence = new CitySearchResult(
                "Florence", "Italy", "Tuscany", "IT", new BigDecimal("43.7696"), new BigDecimal("11.2558"));
        when(geocodingClient.searchCities("Flo rence")).thenReturn(List.of(florence));

        List<CitySearchResult> results = new CitySearchService(geocodingClient).searchCities("  Flo\t rence  ");

        assertThat(results).containsExactly(florence);
        verify(geocodingClient).searchCities("Flo rence");
    }

    @Test
    void doesNotCallTheProviderForBlankOrOneCharacterQueries() {
        CitySearchService service = new CitySearchService(geocodingClient);

        assertThat(service.searchCities(null)).isEmpty();
        assertThat(service.searchCities("   ")).isEmpty();
        assertThat(service.searchCities(" F ")).isEmpty();

        verify(geocodingClient, never()).searchCities(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void rejectsAnExcessivelyLongQueryBeforeCallingTheProvider() {
        CitySearchService service = new CitySearchService(geocodingClient);

        assertThatIllegalArgumentException()
                .isThrownBy(() -> service.searchCities("a".repeat(161)))
                .withMessage("city search query must not exceed 160 characters");
        verify(geocodingClient, never()).searchCities(org.mockito.ArgumentMatchers.anyString());
    }
}
