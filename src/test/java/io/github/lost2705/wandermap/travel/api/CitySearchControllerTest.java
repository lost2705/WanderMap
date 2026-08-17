package io.github.lost2705.wandermap.travel.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.travel.application.CitySearchResult;
import io.github.lost2705.wandermap.travel.application.CitySearchService;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class CitySearchControllerTest {

    @Mock
    private CitySearchService citySearchService;

    @Test
    void exposesProviderIndependentCitySearchResults() {
        CitySearchResult result = new CitySearchResult(
                "Florence", "Italy", "Tuscany", "IT", new BigDecimal("43.7696"), new BigDecimal("11.2558"));
        when(citySearchService.searchCities("Flo")).thenReturn(List.of(result));

        assertThat(new CitySearchController(citySearchService).searchCities("Flo")).containsExactly(result);
        verify(citySearchService).searchCities("Flo");
    }

    @Test
    void translatesGeocoderFailureIntoTheProjectProblemContract() {
        org.springframework.http.ProblemDetail problem = new TravelExceptionHandler()
                .handleGeocodingUnavailable(new io.github.lost2705.wandermap.travel.application.GeocodingUnavailableException(
                        new IllegalStateException("offline")));

        assertThat(problem.getStatus()).isEqualTo(503);
        assertThat(problem.getDetail()).isEqualTo("City search is temporarily unavailable");
        assertThat(problem.getProperties()).containsEntry("code", "GEOCODING_UNAVAILABLE");
    }
}
