package io.github.lost2705.wandermap.travel.application;

public class GeocodingUnavailableException extends RuntimeException {

    public GeocodingUnavailableException(Throwable cause) {
        super("City search is temporarily unavailable", cause);
    }
}
