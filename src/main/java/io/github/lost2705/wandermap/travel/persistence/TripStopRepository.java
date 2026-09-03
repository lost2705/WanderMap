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
            WHERE stop.trip.user.id = :userId
              AND (stop.note IS NOT NULL OR photo.id IS NOT NULL)
            """)
    long countStopsWithMemoryContentForUser(@Param("userId") UUID userId);

    @Query("""
            SELECT new io.github.lost2705.wandermap.travel.persistence.TripMemoryCount(
                stop.trip.id, COUNT(DISTINCT stop.id))
            FROM TripStop stop
            LEFT JOIN stop.photos photo
            WHERE stop.trip.user.id = :userId
              AND (stop.note IS NOT NULL OR photo.id IS NOT NULL)
            GROUP BY stop.trip.id
            """)
    List<TripMemoryCount> countMemoryStopsByTripForUser(@Param("userId") UUID userId);

    @Query("SELECT DISTINCT stop.city.id FROM TripStop stop WHERE stop.trip.user.id = :userId")
    List<UUID> findVisitedCityIdsForUser(@Param("userId") UUID userId);

    boolean existsByCity_IdAndTrip_User_Id(UUID cityId, UUID userId);

    @Query("""
            SELECT DISTINCT stop
            FROM TripStop stop
            JOIN FETCH stop.trip
            JOIN FETCH stop.city city
            JOIN FETCH city.country
            LEFT JOIN FETCH stop.photos
            WHERE city.id = :cityId AND stop.trip.user.id = :userId
            """)
    List<TripStop> findAllByCityIdWithTripAndPhotosForUser(
            @Param("cityId") UUID cityId, @Param("userId") UUID userId);
}
