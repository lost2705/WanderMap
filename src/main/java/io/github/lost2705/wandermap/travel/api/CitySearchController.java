package io.github.lost2705.wandermap.travel.api;

import io.github.lost2705.wandermap.travel.application.CitySearchResult;
import io.github.lost2705.wandermap.travel.application.CitySearchService;
import jakarta.validation.constraints.Size;
import java.util.List;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Validated
@RestController
@RequestMapping("/api/cities")
public class CitySearchController {

    private final CitySearchService citySearchService;

    public CitySearchController(CitySearchService citySearchService) {
        this.citySearchService = citySearchService;
    }

    @GetMapping("/search")
    public List<CitySearchResult> searchCities(@RequestParam @Size(max = 160) String q) {
        return citySearchService.searchCities(q);
    }
}
