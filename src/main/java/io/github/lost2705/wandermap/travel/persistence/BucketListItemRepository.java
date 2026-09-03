package io.github.lost2705.wandermap.travel.persistence;

import io.github.lost2705.wandermap.travel.domain.BucketListItem;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface BucketListItemRepository extends JpaRepository<BucketListItem, UUID> {

    @Query("""
            SELECT item
            FROM BucketListItem item
            JOIN FETCH item.city city
            JOIN FETCH city.country
            WHERE item.user.id = :userId
            ORDER BY item.createdAt ASC, item.id ASC
            """)
    List<BucketListItem> findAllWithCityAndCountryForUser(@Param("userId") UUID userId);

    @Query("""
            SELECT item
            FROM BucketListItem item
            JOIN FETCH item.city city
            JOIN FETCH city.country
            WHERE item.city.id = :cityId AND item.user.id = :userId
            """)
    Optional<BucketListItem> findByCityIdWithCityAndCountryForUser(
            @Param("cityId") UUID cityId, @Param("userId") UUID userId);

    Optional<BucketListItem> findByIdAndUser_Id(UUID itemId, UUID userId);
}
