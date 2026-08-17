package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.domain.TripStopPhoto;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopPhotoRepository;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TripStopPhotoService {

    private final TripRepository tripRepository;
    private final TripStopPhotoRepository photoRepository;
    private final PhotoUploadValidator uploadValidator;
    private final PhotoFileLifecycle fileLifecycle;

    public TripStopPhotoService(
            TripRepository tripRepository,
            TripStopPhotoRepository photoRepository,
            PhotoUploadValidator uploadValidator,
            PhotoFileLifecycle fileLifecycle) {
        this.tripRepository = tripRepository;
        this.photoRepository = photoRepository;
        this.uploadValidator = uploadValidator;
        this.fileLifecycle = fileLifecycle;
    }

    @Transactional
    public TripStopPhoto upload(UUID tripId, UUID stopId, PhotoUpload upload) {
        TripStop stop = loadStopForMutation(tripId, stopId);
        PhotoUploadValidator.ValidatedPhoto validated = uploadValidator.validate(upload);
        byte[] content = validated.content();
        String storageKey = fileLifecycle.store(content);
        fileLifecycle.deleteIfTransactionRollsBack(storageKey);
        try {
            TripStopPhoto photo = stop.addPhoto(
                    storageKey,
                    validated.originalFilename(),
                    validated.contentType(),
                    content.length);
            photoRepository.flush();
            return photo;
        } catch (RuntimeException exception) {
            fileLifecycle.deleteNow(storageKey);
            throw exception;
        }
    }

    @Transactional(readOnly = true)
    public PhotoContent getContent(UUID tripId, UUID stopId, UUID photoId) {
        TripStopPhoto photo = loadStop(tripId, stopId).getPhoto(photoId);
        return new PhotoContent(
                photo.getOriginalFilename(),
                photo.getContentType(),
                fileLifecycle.read(photo.getStorageKey()));
    }

    @Transactional
    public void delete(UUID tripId, UUID stopId, UUID photoId) {
        TripStop stop = loadStopForMutation(tripId, stopId);
        TripStopPhoto photo = stop.removePhoto(photoId);
        photoRepository.flush();
        fileLifecycle.deleteAfterCommit(java.util.List.of(photo.getStorageKey()));
    }

    private TripStop loadStop(UUID tripId, UUID stopId) {
        Objects.requireNonNull(tripId, "trip id must not be null");
        Objects.requireNonNull(stopId, "stop id must not be null");
        Trip trip = tripRepository.findByIdWithStops(tripId)
                .orElseThrow(() -> new TripNotFoundException(tripId));
        TripStop stop = trip.getStop(stopId);
        stop.getPhotos().size();
        return stop;
    }

    private TripStop loadStopForMutation(UUID tripId, UUID stopId) {
        Objects.requireNonNull(tripId, "trip id must not be null");
        Objects.requireNonNull(stopId, "stop id must not be null");
        Trip trip = tripRepository.findByIdForUpdate(tripId)
                .orElseThrow(() -> new TripNotFoundException(tripId));
        TripStop stop = trip.getStop(stopId);
        stop.getPhotos().size();
        return stop;
    }
}
