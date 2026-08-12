package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TripService {

    private final TripRepository tripRepository;
    private final CountryRepository countryRepository;
    private final CityRepository cityRepository;

    public TripService(
            TripRepository tripRepository, CountryRepository countryRepository, CityRepository cityRepository) {
        this.tripRepository = tripRepository;
        this.countryRepository = countryRepository;
        this.cityRepository = cityRepository;
    }

    @Transactional
    public Trip createTrip(String name, LocalDate startDate, LocalDate endDate) {
        return tripRepository.save(new Trip(name, startDate, endDate));
    }

    @Transactional(readOnly = true)
    public Trip getTrip(UUID tripId) {
        return loadTripWithStops(tripId);
    }

    @Transactional(readOnly = true)
    public List<Trip> listTrips() {
        return tripRepository.findAllWithStopsOrderByNameAscIdAsc();
    }

    @Transactional
    public Trip updateTrip(UUID tripId, String name, LocalDate startDate, LocalDate endDate) {
        Trip trip = loadTripWithStops(tripId);
        trip.updateDetails(name, startDate, endDate);
        return tripRepository.save(trip);
    }

    @Transactional
    public void deleteTrip(UUID tripId) {
        tripRepository.delete(loadTripWithStops(tripId));
    }

    @Transactional
    public TripStop addStop(UUID tripId, String countryCode, String cityName) {
        Trip trip = loadTripWithStops(tripId);
        TripStop stop = trip.addStop(resolveCity(countryCode, cityName));
        tripRepository.save(trip);
        return stop;
    }

    @Transactional
    public Trip moveStop(UUID tripId, UUID stopId, int targetPosition) {
        Trip trip = loadTripWithStops(tripId);
        trip.moveStop(stopId, targetPosition);
        return tripRepository.save(trip);
    }

    @Transactional
    public Trip removeStop(UUID tripId, UUID stopId) {
        Trip trip = loadTripWithStops(tripId);
        trip.removeStop(stopId);
        return tripRepository.save(trip);
    }

    private Trip loadTripWithStops(UUID tripId) {
        Objects.requireNonNull(tripId, "trip id must not be null");
        return tripRepository.findByIdWithStops(tripId).orElseThrow(() -> new TripNotFoundException(tripId));
    }

    private City resolveCity(String countryCode, String cityName) {
        String normalizedCountryCode = normalizeCountryCode(countryCode);
        Country country = countryRepository.findById(normalizedCountryCode)
                .orElseThrow(() -> new CountryNotFoundException(normalizedCountryCode));
        String normalizedName = City.normalizeName(cityName);

        return cityRepository.findByCountry_CodeAndNormalizedName(country.getCode(), normalizedName)
                .orElseGet(() -> cityRepository.save(new City(country, cityName)));
    }

    private static String normalizeCountryCode(String countryCode) {
        if (countryCode == null) {
            throw new IllegalArgumentException("country code must not be null");
        }
        return countryCode.strip().toUpperCase(Locale.ROOT);
    }
}
