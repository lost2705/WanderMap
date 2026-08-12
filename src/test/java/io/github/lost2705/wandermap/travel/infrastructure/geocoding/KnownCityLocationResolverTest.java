package io.github.lost2705.wandermap.travel.infrastructure.geocoding;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class KnownCityLocationResolverTest {

    private final KnownCityLocationResolver resolver = new KnownCityLocationResolver();

    @Test
    void resolvesKnownCitiesWithoutMakingANetworkRequest() {
        assertThat(resolver.resolve("IT", "rome"))
                .isPresent()
                .get()
                .extracting(location -> location.latitude().toPlainString(), location -> location.longitude().toPlainString())
                .containsExactly("41.9028", "12.4964");
    }

    @Test
    void leavesUnknownCitiesWithoutCoordinates() {
        assertThat(resolver.resolve("IT", "unknown place")).isEmpty();
    }
}
