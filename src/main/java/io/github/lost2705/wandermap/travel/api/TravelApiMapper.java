package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.api.dto.CityResponse;
import io.github.lost2705.wandermap.travel.api.dto.CountryResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripStopResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripSummaryResponse;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;

final class TravelApiMapper {

    private TravelApiMapper() {
    }

    static CountryResponse toResponse(Country country) {
        return new CountryResponse(country.getCode(), country.getName());
    }

    static TripResponse toResponse(Trip trip) {
        return new TripResponse(
                trip.getId(),
                trip.getName(),
                trip.getStartDate(),
                trip.getEndDate(),
                trip.getStops().stream().map(TravelApiMapper::toResponse).toList());
    }

    static TripSummaryResponse toSummaryResponse(Trip trip) {
        return new TripSummaryResponse(
                trip.getId(), trip.getName(), trip.getStartDate(), trip.getEndDate(), trip.getStops().size());
    }

    static TripStopResponse toResponse(TripStop stop) {
        return new TripStopResponse(stop.getId(), stop.getPosition(), toResponse(stop.getCity()));
    }

    private static CityResponse toResponse(City city) {
        return new CityResponse(city.getId(), city.getName(), toResponse(city.getCountry()));
    }
}
