package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.api.dto.CityResponse;
import io.github.lost2705.wandermap.travel.api.dto.CountryResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripMapMarkerResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripMapOverviewResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripStopResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripStopPhotoResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripSummaryResponse;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import java.util.Comparator;
import java.util.List;

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
                trip.getDescription(),
                trip.getStops().stream().map(TravelApiMapper::toResponse).toList());
    }

    static TripSummaryResponse toSummaryResponse(Trip trip) {
        return new TripSummaryResponse(
                trip.getId(),
                trip.getName(),
                trip.getStartDate(),
                trip.getEndDate(),
                trip.getDescription(),
                trip.getStops().size());
    }

    static TripMapOverviewResponse toMapOverviewResponse(List<Trip> trips) {
        List<TripStop> stops = trips.stream().flatMap(trip -> trip.getStops().stream()).toList();
        List<String> visitedCountryCodes = stops.stream()
                .map(stop -> stop.getCity().getCountry().getCode())
                .distinct()
                .sorted()
                .toList();
        List<TripMapMarkerResponse> markers = trips.stream()
                .flatMap(trip -> trip.getStops().stream().map(stop -> toMapMarkerResponse(trip, stop)))
                .filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(TripMapMarkerResponse::tripId).thenComparingInt(TripMapMarkerResponse::position))
                .toList();
        return new TripMapOverviewResponse(visitedCountryCodes, markers);
    }

    static TripStopResponse toResponse(TripStop stop) {
        return new TripStopResponse(
                stop.getId(),
                stop.getPosition(),
                stop.getArrivalDate(),
                stop.getDepartureDate(),
                stop.getNote(),
                toResponse(stop.getCity()),
                stop.getPhotos().stream().map(TravelApiMapper::toResponse).toList());
    }

    static TripStopPhotoResponse toResponse(io.github.lost2705.wandermap.travel.domain.TripStopPhoto photo) {
        TripStop stop = photo.getTripStop();
        String contentUrl = "/api/trips/%s/stops/%s/photos/%s/content".formatted(
                stop.getTrip().getId(), stop.getId(), photo.getId());
        return new TripStopPhotoResponse(
                photo.getId(),
                photo.getOriginalFilename(),
                photo.getContentType(),
                photo.getSize(),
                photo.getPosition(),
                contentUrl);
    }

    private static CityResponse toResponse(City city) {
        return new CityResponse(
                city.getId(), city.getName(), city.getLatitude(), city.getLongitude(), toResponse(city.getCountry()));
    }

    private static TripMapMarkerResponse toMapMarkerResponse(Trip trip, TripStop stop) {
        City city = stop.getCity();
        if (!city.hasLocation()) {
            return null;
        }
        return new TripMapMarkerResponse(
                trip.getId(),
                stop.getId(),
                stop.getPosition(),
                city.getName(),
                city.getLatitude(),
                city.getLongitude(),
                toResponse(city.getCountry()));
    }
}
