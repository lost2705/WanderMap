package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TripService {

    private static final Logger LOGGER = LoggerFactory.getLogger(TripService.class);

    private final TripRepository tripRepository;
    private final CountryRepository countryRepository;
    private final CityRepository cityRepository;
    private final CityLocationResolver cityLocationResolver;
    private final PhotoFileLifecycle photoFileLifecycle;

    public TripService(
            TripRepository tripRepository,
            CountryRepository countryRepository,
            CityRepository cityRepository,
            CityLocationResolver cityLocationResolver,
            PhotoFileLifecycle photoFileLifecycle) {
        this.tripRepository = tripRepository;
        this.countryRepository = countryRepository;
        this.cityRepository = cityRepository;
        this.cityLocationResolver = cityLocationResolver;
        this.photoFileLifecycle = photoFileLifecycle;
    }

    @Transactional
    public Trip createTrip(String name, LocalDate startDate, LocalDate endDate) {
        return createTrip(name, startDate, endDate, null);
    }

    @Transactional
    public Trip createTrip(String name, LocalDate startDate, LocalDate endDate, String description) {
        return tripRepository.save(new Trip(name, startDate, endDate, description));
    }

    @Transactional(readOnly = true)
    public Trip getTrip(UUID tripId) {
        return loadTripWithStops(tripId);
    }

    @Transactional(readOnly = true)
    public List<Trip> listTrips() {
        return tripRepository.findAllWithStopsOrderByNameAscIdAsc();
    }

    @Transactional(readOnly = true)
    public List<Trip> listTripsForMapOverview() {
        return tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAsc();
    }

    @Transactional
    public Trip updateTrip(UUID tripId, String name, LocalDate startDate, LocalDate endDate) {
        return updateTrip(tripId, name, startDate, endDate, null);
    }

    @Transactional
    public Trip updateTrip(UUID tripId, String name, LocalDate startDate, LocalDate endDate, String description) {
        Trip trip = loadTripWithStops(tripId);
        trip.updateDetails(name, startDate, endDate, description);
        return tripRepository.save(trip);
    }

    @Transactional
    public void deleteTrip(UUID tripId) {
        Trip trip = loadTripWithStops(tripId);
        List<String> storageKeys = trip.getStops().stream()
                .flatMap(stop -> stop.getPhotos().stream())
                .map(io.github.lost2705.wandermap.travel.domain.TripStopPhoto::getStorageKey)
                .toList();
        tripRepository.delete(trip);
        tripRepository.flush();
        photoFileLifecycle.deleteAfterCommit(storageKeys);
    }

    @Transactional
    public TripStop addStop(UUID tripId, String countryCode, String cityName) {
        return addStop(tripId, countryCode, cityName, null, null);
    }

    @Transactional
    public TripStop addStop(
            UUID tripId,
            String countryCode,
            String cityName,
            BigDecimal latitude,
            BigDecimal longitude) {
        return addStop(tripId, countryCode, cityName, latitude, longitude, null, null, null);
    }

    @Transactional
    public TripStop addStop(
            UUID tripId,
            String countryCode,
            String cityName,
            BigDecimal latitude,
            BigDecimal longitude,
            LocalDate arrivalDate,
            LocalDate departureDate,
            String note) {
        Trip trip = loadTripWithStops(tripId);
        TripStop stop = trip.addStop(
                resolveCity(countryCode, cityName, locationFrom(latitude, longitude)),
                arrivalDate,
                departureDate,
                note);
        tripRepository.save(trip);
        return stop;
    }

    @Transactional
    public TripStop updateStopJournal(
            UUID tripId, UUID stopId, LocalDate arrivalDate, LocalDate departureDate, String note) {
        Trip trip = loadTripWithStops(tripId);
        TripStop stop = trip.updateStopJournal(stopId, arrivalDate, departureDate, note);
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
        List<String> storageKeys = trip.getStop(stopId).getPhotos().stream()
                .map(io.github.lost2705.wandermap.travel.domain.TripStopPhoto::getStorageKey)
                .toList();
        trip.removeStop(stopId);
        Trip savedTrip = tripRepository.saveAndFlush(trip);
        photoFileLifecycle.deleteAfterCommit(storageKeys);
        return savedTrip;
    }

    private Trip loadTripWithStops(UUID tripId) {
        Objects.requireNonNull(tripId, "trip id must not be null");
        Trip trip = tripRepository.findByIdWithStops(tripId)
                .orElseThrow(() -> new TripNotFoundException(tripId));
        trip.getStops().forEach(stop -> stop.getPhotos().size());
        return trip;
    }

    private City resolveCity(String countryCode, String cityName, CityLocation selectedLocation) {
        String normalizedCountryCode = normalizeCountryCode(countryCode);
        Country country = countryRepository.findById(normalizedCountryCode)
                .orElseThrow(() -> new CountryNotFoundException(normalizedCountryCode));
        String normalizedName = City.normalizeName(cityName);
        CityLocation location = selectedLocation != null
                ? selectedLocation
                : resolveLegacyLocation(country, normalizedName, cityName);

        return findByIdentity(country, normalizedName, location)
                .or(() -> findAndEnrichUnlocatedCity(country, normalizedName, location))
                .orElseGet(() -> cityRepository.save(new City(country, cityName, location)));
    }

    private Optional<City> findByIdentity(Country country, String normalizedName, CityLocation location) {
        if (location == null) {
            return cityRepository.findByIdentity(country.getCode(), normalizedName, null, null);
        }
        return cityRepository.findByIdentity(
                country.getCode(), normalizedName, location.latitude(), location.longitude());
    }

    private Optional<City> findAndEnrichUnlocatedCity(
            Country country, String normalizedName, CityLocation location) {
        if (location == null) {
            return Optional.empty();
        }
        return cityRepository.findByIdentity(country.getCode(), normalizedName, null, null)
                .map(city -> {
                    city.applyLocation(location);
                    return city;
                });
    }

    private CityLocation resolveLegacyLocation(Country country, String normalizedName, String cityName) {
        try {
            return cityLocationResolver.resolve(country.getCode(), normalizedName).orElse(null);
        } catch (RuntimeException exception) {
            LOGGER.warn(
                    "Could not resolve a map location for city {} in {}: {}",
                    cityName.strip(),
                    country.getCode(),
                    exception.getMessage());
            return null;
        }
    }

    private static CityLocation locationFrom(BigDecimal latitude, BigDecimal longitude) {
        if (latitude == null && longitude == null) {
            return null;
        }
        if (latitude == null || longitude == null) {
            throw new IllegalArgumentException("latitude and longitude must both be provided");
        }
        return new CityLocation(latitude, longitude);
    }

    private static String normalizeCountryCode(String countryCode) {
        if (countryCode == null) {
            throw new IllegalArgumentException("country code must not be null");
        }
        return countryCode.strip().toUpperCase(Locale.ROOT);
    }
}
