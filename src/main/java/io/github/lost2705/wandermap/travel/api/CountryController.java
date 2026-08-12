package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.api.dto.CountryResponse;
import io.github.lost2705.wandermap.travel.application.CountryService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/countries")
public class CountryController {

    private final CountryService countryService;

    public CountryController(CountryService countryService) {
        this.countryService = countryService;
    }

    @GetMapping
    public List<CountryResponse> listCountries() {
        return countryService.listCountries().stream().map(TravelApiMapper::toResponse).toList();
    }
}
