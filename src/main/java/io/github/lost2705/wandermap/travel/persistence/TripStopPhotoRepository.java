package io.github.lost2705.wandermap.travel.persistence;

import io.github.lost2705.wandermap.travel.domain.TripStopPhoto;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TripStopPhotoRepository extends JpaRepository<TripStopPhoto, UUID> {

    long countByTripStop_Trip_User_Id(UUID userId);
}
