package io.github.lost2705.wandermap.travel.application.boundary;

import java.util.ArrayList;
import java.util.List;
import tools.jackson.databind.JsonNode;

/** Bounded WGS84 GeoJSON. Polygon inputs are promoted without flattening rings or islands. */
public record CityBoundaryGeometry(String type, List<List<List<List<Double>>>> coordinates) {

    public static final int MAX_POINTS = 25000;

    public CityBoundaryGeometry {
        if (!"MultiPolygon".equals(type) || coordinates == null || coordinates.isEmpty()) {
            throw invalid();
        }
        int count = 0;
        var polygons = new ArrayList<List<List<List<Double>>>>();
        double west = 180, east = -180, south = 90, north = -90;
        for (var polygon : coordinates) {
            if (polygon == null || polygon.isEmpty()) {
                throw invalid();
            }
            var rings = new ArrayList<List<List<Double>>>();
            for (var ring : polygon) {
                if (ring == null || ring.size() < 4 || ring.getFirst() == null || !ring.getFirst().equals(ring.getLast())) {
                    throw invalid();
                }
                var points = new ArrayList<List<Double>>();
                Double previousLongitude = null;
                for (var point : ring) {
                    if (++count > MAX_POINTS || point == null || point.size() != 2
                            || point.get(0) == null || point.get(1) == null) {
                        throw invalid();
                    }
                    double lon = point.get(0), lat = point.get(1);
                    if (!Double.isFinite(lon) || !Double.isFinite(lat) || Math.abs(lon) > 180
                            || Math.abs(lat) > 90 || (previousLongitude != null && Math.abs(lon - previousLongitude) > 180)) {
                        throw invalid();
                    }
                    previousLongitude = lon;
                    west = Math.min(west, lon);
                    east = Math.max(east, lon);
                    south = Math.min(south, lat);
                    north = Math.max(north, lat);
                    points.add(List.copyOf(point));
                }
                rings.add(List.copyOf(points));
            }
            polygons.add(List.copyOf(rings));
        }
        // Conservative Phase 1 guard: no huge regions or dateline-spanning multipart shapes.
        if (east - west > 5 || north - south > 5) {
            throw invalid();
        }
        coordinates = List.copyOf(polygons);
    }

    public static CityBoundaryGeometry fromJson(JsonNode node) {
        if (node == null || !node.isObject()) {
            throw invalid();
        }
        String type = node.path("type").asText();
        JsonNode coordinates = node.path("coordinates");
        if (!coordinates.isArray() || coordinates.isEmpty() || coordinates.size() > MAX_POINTS) {
            throw invalid();
        }
        var polygons = new ArrayList<List<List<List<Double>>>>();
        int[] count = {0};
        if ("Polygon".equals(type)) {
            polygons.add(readPolygon(coordinates, count));
        } else if ("MultiPolygon".equals(type)) {
            for (var polygon : coordinates) {
                polygons.add(readPolygon(polygon, count));
            }
        } else {
            throw invalid();
        }
        return new CityBoundaryGeometry("MultiPolygon", polygons);
    }

    private static List<List<List<Double>>> readPolygon(JsonNode polygon, int[] count) {
        if (!polygon.isArray() || polygon.isEmpty() || polygon.size() > MAX_POINTS) {
            throw invalid();
        }
        var rings = new ArrayList<List<List<Double>>>();
        for (var ring : polygon) {
            if (!ring.isArray() || ring.size() < 4 || ring.size() > MAX_POINTS) {
                throw invalid();
            }
            var points = new ArrayList<List<Double>>();
            for (var point : ring) {
                if (++count[0] > MAX_POINTS || !point.isArray() || point.size() != 2
                        || !point.get(0).isNumber() || !point.get(1).isNumber()) {
                    throw invalid();
                }
                points.add(List.of(point.get(0).asDouble(), point.get(1).asDouble()));
            }
            rings.add(points);
        }
        return rings;
    }

    private static IllegalArgumentException invalid() {
        return new IllegalArgumentException("Invalid city boundary geometry");
    }
}
