package io.github.lost2705.wandermap.travel.application.boundary;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

/** Geographic metadata only: never receives a user, Journey, arbitrary URL or frontend geometry. */
public interface CityBoundaryClient {

    List<Candidate> findCandidates(Query query);

    record Query(String name, String countryCode, BigDecimal latitude, BigDecimal longitude) {}

    /** Provider-neutral locality classification used by country municipality policies. */
    enum Kind { CITY, TOWN, VILLAGE, MUNICIPALITY, SUBDIVISION, OTHER }

    record Candidate(String provider, String boundaryId, Set<String> names, String countryCode,
                     Kind kind, int searchRank, int adminLevel, CityBoundaryGeometry geometry) {}
}
