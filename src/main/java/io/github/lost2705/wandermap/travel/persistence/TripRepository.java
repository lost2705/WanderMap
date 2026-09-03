package io.github.lost2705.wandermap.travel.persistence;

import io.github.lost2705.wandermap.travel.domain.Trip;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TripRepository extends JpaRepository<Trip, UUID> {

    @Query("""
            SELECT trip
            FROM Trip trip
            LEFT JOIN FETCH trip.stops stop
            LEFT JOIN FETCH stop.city city
            LEFT JOIN FETCH city.country
            WHERE trip.id = :tripId AND trip.user.id = :userId
            """)
    Optional<Trip> findByIdWithStopsForUser(@Param("tripId") UUID tripId, @Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT trip FROM Trip trip WHERE trip.id = :tripId AND trip.user.id = :userId")
    Optional<Trip> findByIdForUpdateForUser(@Param("tripId") UUID tripId, @Param("userId") UUID userId);

    @Query("""
            SELECT DISTINCT trip
            FROM Trip trip
            LEFT JOIN FETCH trip.stops
            WHERE trip.user.id = :userId
            ORDER BY trip.name ASC, trip.id ASC
            """)
    List<Trip> findAllWithStopsOrderByNameAscIdAscForUser(@Param("userId") UUID userId);

    @Query("""
            SELECT DISTINCT trip
            FROM Trip trip
            LEFT JOIN FETCH trip.stops stop
            LEFT JOIN FETCH stop.city city
            LEFT JOIN FETCH city.country
            WHERE trip.user.id = :userId
            ORDER BY trip.name ASC, trip.id ASC
            """)
    List<Trip> findAllWithStopsAndCitiesOrderByNameAscIdAscForUser(@Param("userId") UUID userId);
}
