package io.github.lost2705.wandermap.travel.application.boundary;

public record CityBoundaryResult(Status status, CityBoundaryGeometry geometry, boolean stale, long retryAfterSeconds) {
    public enum Status { AVAILABLE, UNAVAILABLE, TEMPORARILY_UNAVAILABLE }
}
