package io.github.lost2705.wandermap.travel.application.boundary;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import tools.jackson.databind.json.JsonMapper;

class CityBoundaryGeometryTest {
    private final JsonMapper mapper = new JsonMapper();

    @Test
    void preservesPolygonHolesAndMultiPolygonIslands() {
        var polygon = parse("{\"type\":\"Polygon\",\"coordinates\":[[[12,41],[13,41],[13,42],[12,41]],[[12.2,41.1],[12.4,41.1],[12.4,41.2],[12.2,41.1]]]}");
        assertThat(polygon.type()).isEqualTo("MultiPolygon");
        assertThat(polygon.coordinates()).hasSize(1);
        assertThat(polygon.coordinates().getFirst()).hasSize(2);
        var multi = new CityBoundaryGeometry("MultiPolygon", List.of(polygon.coordinates().getFirst(), polygon.coordinates().getFirst()));
        assertThat(parse(mapper.writeValueAsString(multi)).coordinates()).hasSize(2);
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "{}", "null", "{\"type\":\"Point\",\"coordinates\":[12,41]}",
        "{\"type\":\"Polygon\",\"coordinates\":[]}",
        "{\"type\":\"Polygon\",\"coordinates\":[[[12,41],[13,41],[13,42],[12,42]]]}",
        "{\"type\":\"Polygon\",\"coordinates\":[[[12,41,0],[13,41],[13,42],[12,41,0]]]}",
        "{\"type\":\"Polygon\",\"coordinates\":[[[181,41],[13,41],[13,42],[181,41]]]}",
        "{\"type\":\"Polygon\",\"coordinates\":[[[12,91],[13,41],[13,42],[12,91]]]}",
        "{\"type\":\"Polygon\",\"coordinates\":[[[\"12\",41],[13,41],[13,42],[\"12\",41]]]}",
        "{\"type\":\"Polygon\",\"coordinates\":[[[179,41],[-179,41],[-179,42],[179,41]]]}",
        "{\"type\":\"Polygon\",\"coordinates\":[[[1,41],[20,41],[20,42],[1,41]]]}"
    })
    void rejectsMalformedUnsupportedUnclosedOutOfRangeAndDatelineGeometry(String json) {
        assertThatThrownBy(() -> parse(json)).isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Invalid city boundary geometry");
    }

    @Test
    void boundsCoordinateCountAndRejectsNonFiniteNumbers() {
        assertThatThrownBy(() -> new CityBoundaryGeometry("MultiPolygon",
                List.of(List.of(Collections.nCopies(25001, List.of(12d, 41d)))))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CityBoundaryGeometry("MultiPolygon",
                List.of(List.of(Collections.nCopies(4, List.of(Double.NaN, 41d)))))).isInstanceOf(IllegalArgumentException.class);
    }

    private CityBoundaryGeometry parse(String json) { return CityBoundaryGeometry.fromJson(mapper.readTree(json)); }
}
