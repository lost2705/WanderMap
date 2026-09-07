package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryResult;
import io.github.lost2705.wandermap.travel.application.boundary.CityBoundaryService;
import java.util.UUID;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CityBoundaryController {
    private final CityBoundaryService service;

    public CityBoundaryController(CityBoundaryService service) {
        this.service = service;
    }

    @GetMapping("/api/places/{cityId}/boundary")
    public ResponseEntity<CityBoundaryResult> getBoundary(@PathVariable UUID cityId) {
        // Geometry is public, but this response is gated by the current user's visited set.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.getBoundary(cityId));
    }
}
