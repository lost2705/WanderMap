package io.github.lost2705.wandermap.travel.persistence;

import io.github.lost2705.wandermap.travel.domain.Country;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CountryRepository extends JpaRepository<Country, String> {
}
