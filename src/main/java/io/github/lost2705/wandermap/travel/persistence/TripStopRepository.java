package io.github.lost2705.wandermap.travel.persistence;

import io.github.lost2705.wandermap.travel.domain.TripStop;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TripStopRepository extends JpaRepository<TripStop, UUID> {

    @Query("""
            SELECT COUNT(DISTINCT stop.id)
            FROM TripStop stop
            LEFT JOIN stop.photos photo
            WHERE stop.note IS NOT NULL OR photo.id IS NOT NULL
            """)
    long countStopsWithMemoryContent();

    @Query("""
            SELECT DISTINCT stop
            FROM TripStop stop
            JOIN FETCH stop.trip
            JOIN FETCH stop.city city
            JOIN FETCH city.country
            LEFT JOIN FETCH stop.photos
            WHERE city.id = :cityId
            """)
    List<TripStop> findAllByCityIdWithTripAndPhotos(@Param("cityId") UUID cityId);
}
