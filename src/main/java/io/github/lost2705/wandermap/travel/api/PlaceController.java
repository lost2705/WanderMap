package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.api.dto.PlaceDetailsResponse;
import io.github.lost2705.wandermap.travel.application.PlaceDetailsService;
import java.util.UUID;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/places")
public class PlaceController {

    private final PlaceDetailsService placeDetailsService;

    public PlaceController(PlaceDetailsService placeDetailsService) {
        this.placeDetailsService = placeDetailsService;
    }

    @GetMapping("/{cityId}")
    public PlaceDetailsResponse getPlace(@PathVariable UUID cityId) {
        return TravelApiMapper.toResponse(placeDetailsService.getPlace(cityId));
    }
}
