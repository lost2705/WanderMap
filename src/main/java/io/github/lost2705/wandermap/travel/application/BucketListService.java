package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.identity.application.CurrentUserProvider;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.domain.BucketListItem;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.persistence.BucketListItemRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class BucketListService {

    private final BucketListItemRepository bucketListItemRepository;
    private final TripStopRepository tripStopRepository;
    private final CityResolutionService cityResolutionService;
    private final CurrentUserProvider currentUserProvider;

    public BucketListService(
            BucketListItemRepository bucketListItemRepository,
            TripStopRepository tripStopRepository,
            CityResolutionService cityResolutionService,
            CurrentUserProvider currentUserProvider) {
        this.bucketListItemRepository = bucketListItemRepository;
        this.tripStopRepository = tripStopRepository;
        this.cityResolutionService = cityResolutionService;
        this.currentUserProvider = currentUserProvider;
    }

    @Transactional(readOnly = true)
    public List<BucketListEntry> listItems() {
        UUID userId = currentUser().getId();
        Set<UUID> visitedCityIds = new HashSet<>(tripStopRepository.findVisitedCityIdsForUser(userId));
        return bucketListItemRepository.findAllWithCityAndCountryForUser(userId).stream()
                .map(item -> new BucketListEntry(item, visitedCityIds.contains(item.getCity().getId())))
                .toList();
    }

    @Transactional
    public BucketListEntry add(String countryCode, String cityName, BigDecimal latitude, BigDecimal longitude) {
        City city = cityResolutionService.resolve(countryCode, cityName, latitude, longitude);
        UserAccount user = currentUser();
        bucketListItemRepository.findByCityIdWithCityAndCountryForUser(city.getId(), user.getId())
                .ifPresent(existing -> {
                    throw new DuplicateBucketListCityException(city.getId());
                });

        BucketListItem saved;
        try {
            saved = bucketListItemRepository.saveAndFlush(new BucketListItem(user, city));
        } catch (DataIntegrityViolationException exception) {
            throw new DuplicateBucketListCityException(city.getId());
        }
        return new BucketListEntry(
                saved, tripStopRepository.existsByCity_IdAndTrip_User_Id(city.getId(), user.getId()));
    }

    @Transactional
    public void remove(UUID itemId) {
        BucketListItem item = bucketListItemRepository.findByIdAndUser_Id(itemId, currentUser().getId())
                .orElseThrow(() -> new BucketListItemNotFoundException(itemId));
        bucketListItemRepository.delete(item);
    }

    private UserAccount currentUser() {
        return currentUserProvider.getCurrentUser();
    }
}
