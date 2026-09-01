package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.api.dto.TravelProfileResponse;
import io.github.lost2705.wandermap.travel.application.TravelProfile;
import io.github.lost2705.wandermap.travel.application.TravelProfileService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/travel-profile")
public class TravelProfileController {

    private final TravelProfileService travelProfileService;

    public TravelProfileController(TravelProfileService travelProfileService) {
        this.travelProfileService = travelProfileService;
    }

    @GetMapping
    public TravelProfileResponse getProfile() {
        TravelProfile profile = travelProfileService.getProfile();
        return new TravelProfileResponse(
                profile.journeyCount(),
                profile.visitCount(),
                profile.uniqueCityCount(),
                profile.countryCount(),
                profile.travelDayCount(),
                profile.memoryCount(),
                profile.photoCount(),
                profile.revisitedCityCount(),
                profile.revisitedCountryCount());
    }
}
