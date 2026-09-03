package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.persistence.TripMemoryCount;
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
import java.util.Locale;
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
    private final AchievementEngine achievementEngine;

    public TravelProfileService(
            TripRepository tripRepository,
            TripStopRepository tripStopRepository,
            TripStopPhotoRepository photoRepository,
            CurrentUserProvider currentUserProvider,
            AchievementEngine achievementEngine) {
        this.tripRepository = tripRepository;
        this.tripStopRepository = tripStopRepository;
        this.photoRepository = photoRepository;
        this.currentUserProvider = currentUserProvider;
        this.achievementEngine = achievementEngine;
    }

    @Transactional(readOnly = true)
    public TravelProfile getProfile() {
        UUID userId = currentUserProvider.getCurrentUser().getId();
        List<Trip> trips = tripRepository.findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(userId);
        Map<UUID, CityVisitCount> visitsByCity = new HashMap<>();
        Map<String, CountryVisitCount> visitsByCountry = new HashMap<>();
        Map<String, Set<UUID>> journeysByCountry = new HashMap<>();
        long visitCount = 0;

        for (Trip trip : trips) {
            for (TripStop stop : trip.getStops()) {
                visitCount++;
                City city = stop.getCity();
                Country country = city.getCountry();
                UUID cityId = city.getId();
                String countryCode = country.getCode();
                visitsByCity.compute(cityId, (ignored, count) -> count == null
                        ? new CityVisitCount(city, 1)
                        : count.incremented());
                visitsByCountry.compute(countryCode, (ignored, count) -> count == null
                        ? new CountryVisitCount(country, 1)
                        : count.incremented());
                journeysByCountry.computeIfAbsent(countryCode, ignored -> new HashSet<>()).add(trip.getId());
            }
        }

        long revisitedCityCount = visitsByCity.values().stream().filter(count -> count.visitCount() > 1).count();
        long revisitedCountryCount = journeysByCountry.values().stream()
                .filter(journeyIds -> journeyIds.size() > 1)
                .count();
        Map<UUID, Long> memoriesByTrip = new HashMap<>();
        for (TripMemoryCount memoryCount : tripStopRepository.countMemoryStopsByTripForUser(userId)) {
            memoriesByTrip.put(memoryCount.tripId(), memoryCount.memoryCount());
        }
        long memoryCount = memoriesByTrip.values().stream().mapToLong(Long::longValue).sum();
        long photoCount = photoRepository.countByTripStop_Trip_User_Id(userId);
        TravelProfileMetrics metrics = new TravelProfileMetrics(
                trips.size(),
                visitCount,
                visitsByCity.size(),
                visitsByCountry.size(),
                countDistinctTravelDays(trips),
                memoryCount,
                photoCount,
                revisitedCityCount,
                revisitedCountryCount);

        return new TravelProfile(
                metrics.journeyCount(),
                metrics.visitCount(),
                metrics.uniqueCityCount(),
                metrics.countryCount(),
                metrics.travelDayCount(),
                metrics.memoryCount(),
                metrics.photoCount(),
                metrics.revisitedCityCount(),
                metrics.revisitedCountryCount(),
                highlights(trips, visitsByCity, visitsByCountry, memoriesByTrip),
                achievementEngine.evaluate(metrics));
    }

    private static TravelHighlights highlights(
            List<Trip> trips,
            Map<UUID, CityVisitCount> visitsByCity,
            Map<String, CountryVisitCount> visitsByCountry,
            Map<UUID, Long> memoriesByTrip) {
        TravelHighlights.CityHighlight mostVisitedCity = visitsByCity.values().stream()
                .sorted(Comparator.comparingLong(CityVisitCount::visitCount).reversed()
                        .thenComparing(count -> count.city().getNormalizedName())
                        .thenComparing(count -> count.city().getName())
                        .thenComparing(count -> count.city().getId()))
                .findFirst()
                .map(count -> new TravelHighlights.CityHighlight(
                        count.city().getId(),
                        count.city().getName(),
                        count.city().getCountry().getCode(),
                        count.city().getCountry().getName(),
                        count.visitCount()))
                .orElse(null);
        TravelHighlights.CountryHighlight mostVisitedCountry = visitsByCountry.values().stream()
                .sorted(Comparator.comparingLong(CountryVisitCount::visitCount).reversed()
                        .thenComparing(count -> count.country().getName().toLowerCase(Locale.ROOT))
                        .thenComparing(count -> count.country().getName())
                        .thenComparing(count -> count.country().getCode()))
                .findFirst()
                .map(count -> new TravelHighlights.CountryHighlight(
                        count.country().getCode(), count.country().getName(), count.visitCount()))
                .orElse(null);
        TravelHighlights.JourneyDurationHighlight longestJourney = trips.stream()
                .filter(trip -> validCompleteRange(trip.getStartDate(), trip.getEndDate()))
                .map(trip -> new TravelHighlights.JourneyDurationHighlight(
                        trip.getId(), trip.getName(), inclusiveDays(trip.getStartDate(), trip.getEndDate())))
                .sorted(Comparator.comparingLong(TravelHighlights.JourneyDurationHighlight::dayCount).reversed()
                        .thenComparing(highlight -> highlight.journeyName().toLowerCase(Locale.ROOT))
                        .thenComparing(TravelHighlights.JourneyDurationHighlight::journeyName)
                        .thenComparing(TravelHighlights.JourneyDurationHighlight::journeyId))
                .findFirst()
                .orElse(null);
        TravelHighlights.JourneyDateHighlight mostRecentJourney = trips.stream()
                .filter(trip -> trip.getStartDate() != null)
                .map(trip -> new TravelHighlights.JourneyDateHighlight(
                        trip.getId(), trip.getName(), trip.getStartDate()))
                .sorted(Comparator.comparing(TravelHighlights.JourneyDateHighlight::startDate).reversed()
                        .thenComparing(highlight -> highlight.journeyName().toLowerCase(Locale.ROOT))
                        .thenComparing(TravelHighlights.JourneyDateHighlight::journeyName)
                        .thenComparing(TravelHighlights.JourneyDateHighlight::journeyId))
                .findFirst()
                .orElse(null);
        TravelHighlights.JourneyMemoryHighlight mostMemoryRichJourney = trips.stream()
                .map(trip -> new TravelHighlights.JourneyMemoryHighlight(
                        trip.getId(), trip.getName(), memoriesByTrip.getOrDefault(trip.getId(), 0L)))
                .filter(highlight -> highlight.memoryCount() > 0)
                .sorted(Comparator.comparingLong(TravelHighlights.JourneyMemoryHighlight::memoryCount).reversed()
                        .thenComparing(highlight -> highlight.journeyName().toLowerCase(Locale.ROOT))
                        .thenComparing(TravelHighlights.JourneyMemoryHighlight::journeyName)
                        .thenComparing(TravelHighlights.JourneyMemoryHighlight::journeyId))
                .findFirst()
                .orElse(null);

        return new TravelHighlights(
                mostVisitedCity,
                mostVisitedCountry,
                longestJourney,
                mostRecentJourney,
                mostMemoryRichJourney);
    }

    private static boolean validCompleteRange(LocalDate startDate, LocalDate endDate) {
        return startDate != null && endDate != null && !startDate.isAfter(endDate);
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

    private record CityVisitCount(City city, long visitCount) {
        private CityVisitCount incremented() {
            return new CityVisitCount(city, visitCount + 1);
        }
    }

    private record CountryVisitCount(Country country, long visitCount) {
        private CountryVisitCount incremented() {
            return new CountryVisitCount(country, visitCount + 1);
        }
    }
}
