package io.github.lost2705.wandermap.travel.domain;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class TravelDomainTest {

    @Test
    void normalizesCityNamesByTrimmingCollapsingWhitespaceAndLowercasing() {
        assertThat(City.normalizeName("  New\t York   City  ")).isEqualTo("new york city");
    }

    @Test
    void rejectsInvalidTripDateRangeBeforePersistence() {
        assertThatIllegalArgumentException().isThrownBy(() ->
                new Trip("Invalid dates", LocalDate.of(2026, 6, 2), LocalDate.of(2026, 6, 1)))
                .withMessage("start date must not be after end date");
    }
}
