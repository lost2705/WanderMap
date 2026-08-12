package io.github.lost2705.wandermap.travel.application;

import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.persistence.CountryRepository;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CountryService {

    private final CountryRepository countryRepository;

    public CountryService(CountryRepository countryRepository) {
        this.countryRepository = countryRepository;
    }

    @Transactional(readOnly = true)
    public List<Country> listCountries() {
        return countryRepository.findAllByOrderByNameAscCodeAsc();
    }
}
