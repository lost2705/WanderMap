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
            ORDER BY item.createdAt ASC, item.id ASC
            """)
    List<BucketListItem> findAllWithCityAndCountry();

    @Query("""
            SELECT item
            FROM BucketListItem item
            JOIN FETCH item.city city
            JOIN FETCH city.country
            WHERE item.city.id = :cityId
            """)
    Optional<BucketListItem> findByCityIdWithCityAndCountry(@Param("cityId") UUID cityId);
}
