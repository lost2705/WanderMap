package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TripService {

    private final TripRepository tripRepository;
    private final TripStopRepository tripStopRepository;
    private final CityResolutionService cityResolutionService;
    private final PhotoFileLifecycle photoFileLifecycle;
    private final CurrentUserProvider currentUserProvider;

    public TripService(
            TripRepository tripRepository,
            TripStopRepository tripStopRepository,
            CityResolutionService cityResolutionService,
            PhotoFileLifecycle photoFileLifecycle,
            CurrentUserProvider currentUserProvider) {
        this.tripRepository = tripRepository;
        this.tripStopRepository = tripStopRepository;
        this.cityResolutionService = cityResolutionService;
        this.photoFileLifecycle = photoFileLifecycle;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional
    public Trip createTrip(String name, LocalDate startDate, LocalDate endDate) {
        return createTrip(name, startDate, endDate, null);
    }

    @Transactional
    public Trip createTrip(String name, LocalDate startDate, LocalDate endDate, String description) {
        return tripRepository.save(new Trip(currentUser(), name, startDate, endDate, description));
    }

    @Transactional(readOnly = true)
    public Trip getTrip(UUID tripId) {
        return loadTripWithStops(tripId);
    }

    @Transactional(readOnly = true)
    public List<Trip> listTrips() {
        return tripRepository.findAllWithStopsOrderByNameAscIdAscForUser(currentUser().getId());
    }

    @Transactional(readOnly = true)
    public TripMapOverview getMapOverview() {
        UUID userId = currentUser().getId();
        return new TripMapOverview(
                tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(userId),
                tripStopRepository.countStopsWithMemoryContentForUser(userId));
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
                cityResolutionService.resolve(countryCode, cityName, latitude, longitude),
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
        Trip trip = tripRepository.findByIdWithStopsForUser(tripId, currentUser().getId())
                .orElseThrow(() -> new TripNotFoundException(tripId));
        trip.getStops().forEach(stop -> stop.getPhotos().size());
        return trip;
    }

    private UserAccount currentUser() {
        return currentUserProvider.getCurrentUser();
    }

}
