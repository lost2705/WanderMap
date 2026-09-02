package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopPhotoRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TravelProfileService {

    private final TripRepository tripRepository;
    private final TripStopRepository tripStopRepository;
    private final TripStopPhotoRepository photoRepository;
    private final CurrentUserProvider currentUserProvider;

    public TravelProfileService(
            TripRepository tripRepository,
            TripStopRepository tripStopRepository,
            TripStopPhotoRepository photoRepository,
            CurrentUserProvider currentUserProvider) {
        this.tripRepository = tripRepository;
        this.tripStopRepository = tripStopRepository;
        this.photoRepository = photoRepository;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public TravelProfile getProfile() {
        UUID userId = currentUserProvider.getCurrentUser().getId();
        List<Trip> trips = tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(userId);
        Map<UUID, Long> visitsByCity = new HashMap<>();
        Set<String> visitedCountries = new HashSet<>();
        Map<String, Set<UUID>> journeysByCountry = new HashMap<>();
        long visitCount = 0;

        for (Trip trip : trips) {
            for (TripStop stop : trip.getStops()) {
                visitCount++;
                UUID cityId = stop.getCity().getId();
                String countryCode = stop.getCity().getCountry().getCode();
                visitsByCity.merge(cityId, 1L, Long::sum);
                visitedCountries.add(countryCode);
                journeysByCountry.computeIfAbsent(countryCode, ignored -> new HashSet<>()).add(trip.getId());
            }
        }

        long revisitedCityCount = visitsByCity.values().stream().filter(count -> count > 1).count();
        long revisitedCountryCount = journeysByCountry.values().stream()
                .filter(journeyIds -> journeyIds.size() > 1)
                .count();

        return new TravelProfile(
                trips.size(),
                visitCount,
                visitsByCity.size(),
                visitedCountries.size(),
                countDistinctTravelDays(trips),
                tripStopRepository.countStopsWithMemoryContentForUser(userId),
                photoRepository.countByTripStop_Trip_User_Id(userId),
                revisitedCityCount,
                revisitedCountryCount);
    }

    static long countDistinctTravelDays(List<Trip> trips) {
        List<DateRange> ranges = new ArrayList<>();
        for (Trip trip : trips) {
            LocalDate start = trip.getStartDate();
            LocalDate end = trip.getEndDate();
            if (start == null && end == null) {
                continue;
            }
            if (start == null) {
                start = end;
            } else if (end == null) {
                end = start;
            }
            if (start.isAfter(end)) {
                continue;
            }
            ranges.add(new DateRange(start, end));
        }

        ranges.sort(Comparator.comparing(DateRange::start).thenComparing(DateRange::end));
        if (ranges.isEmpty()) {
            return 0;
        }

        long distinctDays = 0;
        LocalDate currentStart = ranges.getFirst().start();
        LocalDate currentEnd = ranges.getFirst().end();
        for (DateRange range : ranges.subList(1, ranges.size())) {
            if (overlapsOrTouches(range.start(), currentEnd)) {
                if (range.end().isAfter(currentEnd)) {
                    currentEnd = range.end();
                }
            } else {
                distinctDays = Math.addExact(distinctDays, inclusiveDays(currentStart, currentEnd));
                currentStart = range.start();
                currentEnd = range.end();
            }
        }
        return Math.addExact(distinctDays, inclusiveDays(currentStart, currentEnd));
    }

    private static boolean overlapsOrTouches(LocalDate nextStart, LocalDate currentEnd) {
        return !nextStart.isAfter(currentEnd)
                || (!LocalDate.MAX.equals(currentEnd) && nextStart.equals(currentEnd.plusDays(1)));
    }

    private static long inclusiveDays(LocalDate start, LocalDate end) {
        return Math.addExact(ChronoUnit.DAYS.between(start, end), 1);
    }

    private record DateRange(LocalDate start, LocalDate end) {
    }
}
