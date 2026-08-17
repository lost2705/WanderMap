package io.github.lost2705.wandermap.travel.persistence;

import io.github.lost2705.wandermap.travel.domain.City;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface CityRepository extends JpaRepository<City, UUID> {

    @Query("""
            SELECT city
            FROM City city
            WHERE city.country.code = :countryCode
              AND city.normalizedName = :normalizedName
              AND ((:latitude IS NULL AND city.latitude IS NULL) OR city.latitude = :latitude)
              AND ((:longitude IS NULL AND city.longitude IS NULL) OR city.longitude = :longitude)
            """)
    Optional<City> findByIdentity(
            @Param("countryCode") String countryCode,
            @Param("normalizedName") String normalizedName,
            @Param("latitude") BigDecimal latitude,
            @Param("longitude") BigDecimal longitude);
}
