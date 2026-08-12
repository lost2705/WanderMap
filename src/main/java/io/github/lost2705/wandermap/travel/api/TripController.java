package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.api.dto.AddTripStopRequest;
import io.github.lost2705.wandermap.travel.api.dto.CreateTripRequest;
import io.github.lost2705.wandermap.travel.api.dto.MoveTripStopRequest;
import io.github.lost2705.wandermap.travel.api.dto.TripResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripMapOverviewResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripStopResponse;
import io.github.lost2705.wandermap.travel.api.dto.TripSummaryResponse;
import io.github.lost2705.wandermap.travel.api.dto.UpdateTripRequest;
import io.github.lost2705.wandermap.travel.application.TripService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
@RequestMapping("/api/trips")
public class TripController {

    private final TripService tripService;

    public TripController(TripService tripService) {
        this.tripService = tripService;
    }

    @PostMapping
    public ResponseEntity<TripResponse> createTrip(@Valid @RequestBody CreateTripRequest request) {
        TripResponse response = TravelApiMapper.toResponse(
                tripService.createTrip(request.name(), request.startDate(), request.endDate()));
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
        return TravelApiMapper.toMapOverviewResponse(tripService.listTripsForMapOverview());
    }

    @GetMapping("/{tripId}")
    public TripResponse getTrip(@PathVariable UUID tripId) {
        return TravelApiMapper.toResponse(tripService.getTrip(tripId));
    }

    @PatchMapping("/{tripId}")
    public TripResponse updateTrip(@PathVariable UUID tripId, @Valid @RequestBody UpdateTripRequest request) {
        return TravelApiMapper.toResponse(
                tripService.updateTrip(tripId, request.name(), request.startDate(), request.endDate()));
    }

    @DeleteMapping("/{tripId}")
    public ResponseEntity<Void> deleteTrip(@PathVariable UUID tripId) {
        tripService.deleteTrip(tripId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{tripId}/stops")
    public ResponseEntity<TripStopResponse> addStop(@PathVariable UUID tripId, @Valid @RequestBody AddTripStopRequest request) {
        TripStopResponse response = TravelApiMapper.toResponse(
                tripService.addStop(tripId, request.countryCode(), request.cityName()));
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

    @DeleteMapping("/{tripId}/stops/{stopId}")
    public ResponseEntity<Void> removeStop(@PathVariable UUID tripId, @PathVariable UUID stopId) {
        tripService.removeStop(tripId, stopId);
        return ResponseEntity.noContent().build();
    }
}
