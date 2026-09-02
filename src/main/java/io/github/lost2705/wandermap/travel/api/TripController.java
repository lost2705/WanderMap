package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.api.dto.AddTripStopRequest;
import io.github.lost2705.wandermap.travel.api.dto.CreateTripRequest;
import io.github.lost2705.wandermap.travel.api.dto.MoveTripStopRequest;
import io.github.lost2705.wandermap.travel.api.dto.TripResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripMapOverviewResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripStopResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripStopPhotoResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripSummaryResponse;
import io.github.lost2705.wandermap.travel.api.dto.UpdateTripRequest;
import io.github.lost2705.wandermap.travel.api.dto.UpdateTripStopJournalRequest;
import io.github.lost2705.wandermap.travel.application.PhotoContent;
import io.github.lost2705.wandermap.travel.application.PhotoStorageException;
import io.github.lost2705.wandermap.travel.application.PhotoUpload;
import io.github.lost2705.wandermap.travel.application.TripService;
import io.github.lost2705.wandermap.travel.application.TripStopPhotoService;
import jakarta.validation.Valid;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
@RequestMapping("/api/trips")
public class TripController {

    private final TripService tripService;
    private final TripStopPhotoService photoService;

    public TripController(TripService tripService, TripStopPhotoService photoService) {
        this.tripService = tripService;
        this.photoService = photoService;
    }

    @PostMapping
    public ResponseEntity<TripResponse> createTrip(@Valid @RequestBody CreateTripRequest request) {
        TripResponse response = TravelApiMapper.toResponse(
                tripService.createTrip(request.name(), request.startDate(), request.endDate(), request.description()));
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{tripId}")
                .buildAndExpand(response.id())
                .toUri();
        return ResponseEntity.created(location).body(response);
    }

    @GetMapping
    public List<TripSummaryResponse> listTrips() {
        return tripService.listTrips().stream().map(TravelApiMapper::toSummaryResponse).toList();
    }

    @GetMapping("/map-overview")
    public TripMapOverviewResponse mapOverview() {
        return TravelApiMapper.toMapOverviewResponse(tripService.getMapOverview());
    }

    @GetMapping("/{tripId}")
    public TripResponse getTrip(@PathVariable UUID tripId) {
        return TravelApiMapper.toResponse(tripService.getTrip(tripId));
    }

    @PatchMapping("/{tripId}")
    public TripResponse updateTrip(@PathVariable UUID tripId, @Valid @RequestBody UpdateTripRequest request) {
        return TravelApiMapper.toResponse(
                tripService.updateTrip(
                        tripId, request.name(), request.startDate(), request.endDate(), request.description()));
    }

    @DeleteMapping("/{tripId}")
    public ResponseEntity<Void> deleteTrip(@PathVariable UUID tripId) {
        tripService.deleteTrip(tripId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{tripId}/stops")
    public ResponseEntity<TripStopResponse> addStop(@PathVariable UUID tripId, @Valid @RequestBody AddTripStopRequest request) {
        TripStopResponse response = TravelApiMapper.toResponse(
                tripService.addStop(
                        tripId,
                        request.countryCode(),
                        request.cityName(),
                        request.latitude(),
                        request.longitude(),
                        request.arrivalDate(),
                        request.departureDate(),
                        request.note()));
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{stopId}")
                .buildAndExpand(response.id())
                .toUri();
        return ResponseEntity.created(location).body(response);
    }

    @PatchMapping("/{tripId}/stops/{stopId}")
    public ResponseEntity<Void> moveStop(
            @PathVariable UUID tripId, @PathVariable UUID stopId, @Valid @RequestBody MoveTripStopRequest request) {
        tripService.moveStop(tripId, stopId, request.position());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/{tripId}/stops/{stopId}/journal")
    public TripStopResponse updateStopJournal(
            @PathVariable UUID tripId,
            @PathVariable UUID stopId,
            @Valid @RequestBody UpdateTripStopJournalRequest request) {
        return TravelApiMapper.toResponse(tripService.updateStopJournal(
                tripId, stopId, request.arrivalDate(), request.departureDate(), request.note()));
    }

    @DeleteMapping("/{tripId}/stops/{stopId}")
    public ResponseEntity<Void> removeStop(@PathVariable UUID tripId, @PathVariable UUID stopId) {
        tripService.removeStop(tripId, stopId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping(path = "/{tripId}/stops/{stopId}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TripStopPhotoResponse> uploadPhoto(
            @PathVariable UUID tripId,
            @PathVariable UUID stopId,
            @RequestPart("file") MultipartFile file) {
        TripStopPhotoResponse response = TravelApiMapper.toResponse(photoService.upload(
                tripId,
                stopId,
                new PhotoUpload(file.getOriginalFilename(), file.getContentType(), readBytes(file))));
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{photoId}")
                .buildAndExpand(response.id())
                .toUri();
        return ResponseEntity.created(location).body(response);
    }

    @GetMapping("/{tripId}/stops/{stopId}/photos/{photoId}/content")
    public ResponseEntity<byte[]> getPhotoContent(
            @PathVariable UUID tripId,
            @PathVariable UUID stopId,
            @PathVariable UUID photoId) {
        PhotoContent photo = photoService.getContent(tripId, stopId, photoId);
        byte[] content = photo.bytes();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                .contentLength(content.length)
                .cacheControl(CacheControl.noStore())
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline()
                        .filename(photo.originalFilename(), StandardCharsets.UTF_8)
                        .build()
                        .toString())
                .header("X-Content-Type-Options", "nosniff")
                .body(content);
    }

    @DeleteMapping("/{tripId}/stops/{stopId}/photos/{photoId}")
    public ResponseEntity<Void> deletePhoto(
            @PathVariable UUID tripId,
            @PathVariable UUID stopId,
            @PathVariable UUID photoId) {
        photoService.delete(tripId, stopId, photoId);
        return ResponseEntity.noContent().build();
    }

    private static byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException exception) {
            throw new PhotoStorageException("Could not read uploaded photo", exception);
        }
    }
}
