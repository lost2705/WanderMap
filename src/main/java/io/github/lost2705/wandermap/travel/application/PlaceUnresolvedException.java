package io.github.lost2705.wandermap.travel.application;

public class PlaceUnresolvedException extends RuntimeException {

    public PlaceUnresolvedException() {
        super("The submitted place could not be verified against canonical place data");
    }
}
