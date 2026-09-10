package io.github.lost2705.wandermap.travel.application.boundary;

import java.util.Locale;
import java.util.Set;

/** Country-aware interpretation of provider-neutral administrative boundary metadata. */
final class MunicipalityBoundaryPolicy {
    static final int REJECT = -1;
    private static final int EXPLICIT_MUNICIPALITY = 300;
    private static final int LOCALITY_AT_MUNICIPAL_LEVEL = 200;
    private static final int PROVIDER_SUBDIVISION_AT_FRENCH_COMMUNE_LEVEL = 100;
    private static final Set<CityBoundaryClient.Kind> LOCALITY_KINDS = Set.of(
            CityBoundaryClient.Kind.CITY, CityBoundaryClient.Kind.TOWN, CityBoundaryClient.Kind.VILLAGE,
            CityBoundaryClient.Kind.MUNICIPALITY);

    int preference(CityBoundaryClient.Query query, CityBoundaryClient.Candidate candidate) {
        return switch (query.countryCode().toUpperCase(Locale.ROOT)) {
            case "NL" -> municipalityLevel(candidate, 8, false);
            case "FR" -> municipalityLevel(candidate, 8, true);
            case "IT", "LI" -> municipalityLevel(candidate, 8, false);
            default -> generic(candidate);
        };
    }

    private static int municipalityLevel(CityBoundaryClient.Candidate candidate, int adminLevel,
            boolean allowProviderSubdivision) {
        if (candidate.adminLevel() != adminLevel) {
            return REJECT;
        }
        if (candidate.kind() == CityBoundaryClient.Kind.MUNICIPALITY) {
            return EXPLICIT_MUNICIPALITY;
        }
        if (LOCALITY_KINDS.contains(candidate.kind())) {
            return LOCALITY_AT_MUNICIPAL_LEVEL;
        }
        // Nominatim labels the Paris admin-8 commune relation as a suburb. The level is the
        // authoritative French commune signal; admin-7/9 districts remain rejected.
        if (allowProviderSubdivision && candidate.kind() == CityBoundaryClient.Kind.SUBDIVISION) {
            return PROVIDER_SUBDIVISION_AT_FRENCH_COMMUNE_LEVEL;
        }
        return REJECT;
    }

    private static int generic(CityBoundaryClient.Candidate candidate) {
        return candidate.searchRank() >= 13 && candidate.searchRank() <= 18
                && candidate.adminLevel() >= 4 && candidate.adminLevel() <= 10
                && LOCALITY_KINDS.contains(candidate.kind()) ? LOCALITY_AT_MUNICIPAL_LEVEL : REJECT;
    }
}
