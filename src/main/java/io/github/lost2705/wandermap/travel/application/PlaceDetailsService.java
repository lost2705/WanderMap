package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.CityRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlaceDetailsService {

    private static final Comparator<LocalDate> NULLABLE_DATE_ORDER = Comparator.nullsLast(Comparator.naturalOrder());
    private static final Comparator<TripStop> VISIT_ORDER = Comparator
            .comparing(PlaceDetailsService::effectiveVisitDate, NULLABLE_DATE_ORDER)
            .thenComparing(stop -> stop.getTrip().getStartDate(), NULLABLE_DATE_ORDER)
            .thenComparing(stop -> stop.getTrip().getEndDate(), NULLABLE_DATE_ORDER)
            .thenComparing(stop -> stop.getTrip().getName(), String.CASE_INSENSITIVE_ORDER)
            .thenComparing(stop -> stop.getTrip().getId())
            .thenComparingInt(TripStop::getPosition)
            .thenComparing(TripStop::getId);

    private final CityRepository cityRepository;
    private final TripStopRepository tripStopRepository;
    private final CurrentUserProvider currentUserProvider;

    public PlaceDetailsService(
            CityRepository cityRepository,
            TripStopRepository tripStopRepository,
            CurrentUserProvider currentUserProvider) {
        this.cityRepository = cityRepository;
        this.tripStopRepository = tripStopRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public PlaceDetails getPlace(UUID cityId) {
        Objects.requireNonNull(cityId, "city id must not be null");
        var visits = tripStopRepository
                .findAllByCityIdWithTripAndPhotosForUser(cityId, currentUserProvider.getCurrentUser().getId())
                .stream()
                .sorted(VISIT_ORDER)
                .toList();
        if (visits.isEmpty()) {
            throw new CityNotFoundException(cityId);
        }
        var city = cityRepository.findByIdWithCountry(cityId)
                .orElseThrow(() -> new CityNotFoundException(cityId));
        return new PlaceDetails(city, visits);
    }

    private static LocalDate effectiveVisitDate(TripStop stop) {
        return stop.getArrivalDate() != null ? stop.getArrivalDate() : stop.getTrip().getStartDate();
    }
}
