package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.TestUsers;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.domain.BucketListItem;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.persistence.BucketListItemRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopRepository;
import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;

@ExtendWith(MockitoExtension.class)
class BucketListServiceTest {

    private static final Country UNITED_STATES = new Country("US", "United States");
    private static final UserAccount USER = TestUsers.user();

    @Mock
    private BucketListItemRepository bucketListItemRepository;

    @Mock
    private TripStopRepository tripStopRepository;

    @Mock
    private CityResolutionService cityResolutionService;

    private BucketListService service;

    @BeforeEach
    void setUp() {
        service = new BucketListService(
                bucketListItemRepository, tripStopRepository, cityResolutionService, () -> USER);
    }

    @Test
    void listsCanonicalCitiesInRepositoryOrderAndDerivesVisitedStateInOneQuery() {
        City florence = city("Florence", "34.7998", "-87.6773");
        City charleston = city("Charleston", "32.7765", "-79.9311");
        BucketListItem first = new BucketListItem(USER, florence);
        BucketListItem second = new BucketListItem(USER, charleston);
        when(bucketListItemRepository.findAllWithCityAndCountryForUser(USER.getId())).thenReturn(List.of(first, second));
        when(tripStopRepository.findVisitedCityIdsForUser(USER.getId())).thenReturn(List.of(charleston.getId()));

        List<BucketListEntry> result = service.listItems();

        assertThat(result).extracting(entry -> entry.item().getCity()).containsExactly(florence, charleston);
        assertThat(result).extracting(BucketListEntry::visited).containsExactly(false, true);
        verify(tripStopRepository).findVisitedCityIdsForUser(USER.getId());
        verify(tripStopRepository, never()).existsByCity_IdAndTrip_User_Id(any(), eq(USER.getId()));
    }

    @Test
    void addsTheExactResolvedCityAndReturnsItsVisitedState() {
        City florence = city("Florence", "34.7998", "-87.6773");
        when(cityResolutionService.resolve(
                        "US", "Florence", new BigDecimal("34.7998"), new BigDecimal("-87.6773")))
                .thenReturn(florence);
        when(bucketListItemRepository.findByCityIdWithCityAndCountryForUser(florence.getId(), USER.getId()))
                .thenReturn(Optional.empty());
        when(bucketListItemRepository.saveAndFlush(any(BucketListItem.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));
        when(tripStopRepository.existsByCity_IdAndTrip_User_Id(florence.getId(), USER.getId())).thenReturn(true);

        BucketListEntry result = service.add(
                "US", "Florence", new BigDecimal("34.7998"), new BigDecimal("-87.6773"));

        assertThat(result.item().getCity()).isSameAs(florence);
        assertThat(result.visited()).isTrue();
    }

    @Test
    void rejectsAnAlreadySavedCanonicalCityWithoutCreatingAnotherItem() {
        City florence = city("Florence", "34.7998", "-87.6773");
        BucketListItem existing = new BucketListItem(USER, florence);
        when(cityResolutionService.resolve("US", "Florence", null, null)).thenReturn(florence);
        when(bucketListItemRepository.findByCityIdWithCityAndCountryForUser(florence.getId(), USER.getId()))
                .thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> service.add("US", "Florence", null, null))
                .isInstanceOf(DuplicateBucketListCityException.class)
                .hasMessageContaining(florence.getId().toString());
        verify(bucketListItemRepository, never()).saveAndFlush(any());
    }

    @Test
    void translatesTheDatabaseUniquenessRaceToDuplicateSemantics() {
        City florence = city("Florence", "34.7998", "-87.6773");
        when(cityResolutionService.resolve("US", "Florence", null, null)).thenReturn(florence);
        when(bucketListItemRepository.findByCityIdWithCityAndCountryForUser(florence.getId(), USER.getId()))
                .thenReturn(Optional.empty());
        when(bucketListItemRepository.saveAndFlush(any(BucketListItem.class)))
                .thenThrow(new DataIntegrityViolationException("uq_bucket_list_items_city"));

        assertThatThrownBy(() -> service.add("US", "Florence", null, null))
                .isInstanceOf(DuplicateBucketListCityException.class);
    }

    @Test
    void removesOnlyTheBucketListItem() {
        BucketListItem item = new BucketListItem(USER, city("Florence", "34.7998", "-87.6773"));
        when(bucketListItemRepository.findByIdAndUser_Id(item.getId(), USER.getId())).thenReturn(Optional.of(item));

        service.remove(item.getId());

        verify(bucketListItemRepository).delete(item);
        verify(cityResolutionService, never()).resolve(any(), any(), any(), any());
    }

    @Test
    void rejectsRemovingAnUnknownItem() {
        UUID itemId = UUID.randomUUID();
        when(bucketListItemRepository.findByIdAndUser_Id(itemId, USER.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.remove(itemId))
                .isInstanceOf(BucketListItemNotFoundException.class)
                .hasMessageContaining(itemId.toString());
    }

    private static City city(String name, String latitude, String longitude) {
        return new City(
                UNITED_STATES,
                name,
                new CityLocation(new BigDecimal(latitude), new BigDecimal(longitude)));
    }
}
