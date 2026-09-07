package io.github.lost2705.wandermap.travel.application.boundary;

/** Deliberately excludes upstream URLs, response bodies and exception causes. */
public class CityBoundaryLookupException extends RuntimeException {
    public CityBoundaryLookupException() {
        super("City boundary provider is temporarily unavailable");
    }
}
