package io.github.lost2705.wandermap.travel.application;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.TestUsers;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import io.github.lost2705.wandermap.travel.domain.TripStop;
import io.github.lost2705.wandermap.travel.domain.TripStopNotFoundException;
import io.github.lost2705.wandermap.travel.domain.TripStopPhoto;
import io.github.lost2705.wandermap.travel.persistence.TripRepository;
import io.github.lost2705.wandermap.travel.persistence.TripStopPhotoRepository;
import java.util.Optional;
import java.util.UUID;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TripStopPhotoServiceTest {

    private static final UserAccount USER = TestUsers.user();

    @Mock
    private TripRepository tripRepository;

    @Mock
    private TripStopPhotoRepository photoRepository;

    @Mock
    private PhotoFileLifecycle fileLifecycle;

    private TripStopPhotoService service;

    @BeforeEach
    void setUp() {
        service = new TripStopPhotoService(
                tripRepository,
                photoRepository,
                new PhotoUploadValidator(1024),
                fileLifecycle,
                () -> USER);
    }

    @Test
    void persistsMetadataWithAGeneratedStorageKeyAndAppendsPositions() {
        Trip trip = tripWithStop("Rome");
        TripStop stop = trip.getStops().getFirst();
        when(tripRepository.findByIdForUpdateForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(fileLifecycle.store(any())).thenReturn("ab/generated-one", "cd/generated-two");

        TripStopPhoto first = service.upload(trip.getId(), stop.getId(), jpeg("first.jpg"));
        TripStopPhoto second = service.upload(trip.getId(), stop.getId(), jpeg("second.jpg"));

        assertThat(stop.getPhotos()).containsExactly(first, second);
        assertThat(stop.getPhotos()).extracting(TripStopPhoto::getPosition).containsExactly(1, 2);
        assertThat(first.getStorageKey()).isEqualTo("ab/generated-one");
        assertThat(first.getOriginalFilename()).isEqualTo("first.jpg");
        assertThat(first.getContentType()).isEqualTo("image/jpeg");
        assertThat(first.getSize()).isGreaterThan(3);
        assertThat(first.getCreatedAt()).isNotNull();
        verify(photoRepository, org.mockito.Mockito.times(2)).flush();
        verify(fileLifecycle).deleteIfTransactionRollsBack("ab/generated-one");
    }

    @Test
    void readsOnlyAPhotoOwnedByTheRequestedTripAndStop() {
        Trip trip = tripWithStop("Rome");
        TripStop stop = trip.getStops().getFirst();
        TripStopPhoto photo = stop.addPhoto("ab/key", "rome.jpg", "image/jpeg", 3);
        when(tripRepository.findByIdWithStopsForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(fileLifecycle.read("ab/key")).thenReturn(new byte[] {9, 8, 7});

        PhotoContent content = service.getContent(trip.getId(), stop.getId(), photo.getId());

        assertThat(content.originalFilename()).isEqualTo("rome.jpg");
        assertThat(content.contentType()).isEqualTo("image/jpeg");
        assertThat(content.bytes()).containsExactly(9, 8, 7);
    }

    @Test
    void rejectsAStopThatBelongsToAnotherTripBeforeStoring() {
        Trip requestedTrip = tripWithStop("Rome");
        Trip otherTrip = tripWithStop("Florence");
        UUID otherStopId = otherTrip.getStops().getFirst().getId();
        when(tripRepository.findByIdForUpdateForUser(requestedTrip.getId(), USER.getId())).thenReturn(Optional.of(requestedTrip));

        assertThatThrownBy(() -> service.upload(requestedTrip.getId(), otherStopId, jpeg("wrong.jpg")))
                .isInstanceOf(TripStopNotFoundException.class);
        verify(fileLifecycle, never()).store(any());
    }

    @Test
    void removesMetadataCompactsPositionsAndSchedulesFileDeletionAfterCommit() {
        Trip trip = tripWithStop("Rome");
        TripStop stop = trip.getStops().getFirst();
        TripStopPhoto first = stop.addPhoto("ab/first", "first.jpg", "image/jpeg", 3);
        TripStopPhoto second = stop.addPhoto("cd/second", "second.jpg", "image/jpeg", 3);
        when(tripRepository.findByIdForUpdateForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));

        service.delete(trip.getId(), stop.getId(), first.getId());

        assertThat(stop.getPhotos()).containsExactly(second);
        assertThat(second.getPosition()).isEqualTo(1);
        verify(photoRepository).flush();
        verify(fileLifecycle).deleteAfterCommit(java.util.List.of("ab/first"));
    }

    @Test
    void removesStoredDataWhenMetadataPersistenceFails() {
        Trip trip = tripWithStop("Rome");
        TripStop stop = trip.getStops().getFirst();
        when(tripRepository.findByIdForUpdateForUser(trip.getId(), USER.getId())).thenReturn(Optional.of(trip));
        when(fileLifecycle.store(any())).thenReturn("ab/generated");
        org.mockito.Mockito.doThrow(new IllegalStateException("database unavailable"))
                .when(photoRepository)
                .flush();

        assertThatThrownBy(() -> service.upload(trip.getId(), stop.getId(), jpeg("rome.jpg")))
                .isInstanceOf(IllegalStateException.class);

        verify(fileLifecycle).deleteNow("ab/generated");
    }

    private static PhotoUpload jpeg(String filename) {
        return new PhotoUpload(filename, "image/jpeg", imageBytes("jpg"));
    }

    private static byte[] imageBytes(String format) {
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            ImageIO.write(new BufferedImage(1, 1, BufferedImage.TYPE_INT_RGB), format, output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new AssertionError(exception);
        }
    }

    private static Trip tripWithStop(String cityName) {
        Trip trip = new Trip(USER, "Trip to " + cityName, null, null);
        trip.addStop(new City(new Country("IT", "Italy"), cityName));
        return trip;
    }
}
