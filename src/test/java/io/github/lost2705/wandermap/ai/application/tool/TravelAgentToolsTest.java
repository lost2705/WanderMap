package io.github.lost2705.wandermap.ai.application.tool;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import io.github.lost2705.wandermap.ai.application.ToolArgumentException;
import io.github.lost2705.wandermap.ai.application.TravelAgentTool;
import io.github.lost2705.wandermap.ai.application.WeatherClient;
import io.github.lost2705.wandermap.ai.application.WeatherForecast;
import io.github.lost2705.wandermap.identity.domain.UserAccount;
import io.github.lost2705.wandermap.travel.application.Achievement;
import io.github.lost2705.wandermap.travel.application.AchievementCategory;
import io.github.lost2705.wandermap.travel.application.BucketListEntry;
import io.github.lost2705.wandermap.travel.application.BucketListService;
import io.github.lost2705.wandermap.travel.application.CitySearchResult;
import io.github.lost2705.wandermap.travel.application.CitySearchService;
import io.github.lost2705.wandermap.travel.application.TravelHighlights;
import io.github.lost2705.wandermap.travel.application.TravelProfile;
import io.github.lost2705.wandermap.travel.application.TravelProfileService;
import io.github.lost2705.wandermap.travel.application.TripService;
import io.github.lost2705.wandermap.travel.domain.BucketListItem;
import io.github.lost2705.wandermap.travel.domain.City;
import io.github.lost2705.wandermap.travel.domain.CityLocation;
import io.github.lost2705.wandermap.travel.domain.Country;
import io.github.lost2705.wandermap.travel.domain.Trip;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

class TravelAgentToolsTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void travelProfileToolReturnsCompactCurrentUserDataAndHasNoUserIdArgument() {
        TravelProfileService service = mock(TravelProfileService.class);
        when(service.getProfile()).thenReturn(new TravelProfile(
                2, 4, 3, 2, 12, 2, 5, 1, 1,
                new TravelHighlights(
                        new TravelHighlights.CityHighlight(
                                java.util.UUID.randomUUID(), "Rome", "IT", "Italy", 2),
                        new TravelHighlights.CountryHighlight("IT", "Italy", 3),
                        null,
                        null,
                        null),
                List.of(
                        new Achievement("FIRST", "First Journey", "Started", AchievementCategory.JOURNEYS,
                                true, 1, 1, 100),
                        new Achievement("LOCKED", "Five Journeys", "Keep going", AchievementCategory.JOURNEYS,
                                false, 2, 5, 40))));
        GetTravelProfileTool tool = new GetTravelProfileTool(service, objectMapper);

        GetTravelProfileTool.Result result = (GetTravelProfileTool.Result) tool.execute("{}");

        assertThat(result.journeyCount()).isEqualTo(2);
        assertThat(result.highlights().mostVisitedCity()).isEqualTo("Rome, Italy (2 visits)");
        assertThat(result.unlockedAchievements()).extracting(GetTravelProfileTool.UnlockedAchievement::code)
                .containsExactly("FIRST");
        assertThat(tool.definition().inputSchema().toString()).doesNotContainIgnoringCase("userId");
        verify(service).getProfile();
        assertThatThrownBy(() -> tool.execute("{\"userId\":\"someone-else\"}"))
                .isInstanceOf(ToolArgumentException.class);
    }

    @Test
    void journeysToolReturnsOrderedStopsAndCanonicalCoordinates() {
        TripService service = mock(TripService.class);
        UserAccount user = new UserAccount("alice@example.com", "hash", "Alice");
        Country japan = new Country("JP", "Japan");
        Trip trip = new Trip(user, "Japan", LocalDate.parse("2026-04-01"), LocalDate.parse("2026-04-08"));
        trip.addStop(new City(japan, "Tokyo", new CityLocation(decimal("35.6762"), decimal("139.6503"))));
        trip.addStop(new City(japan, "Kyoto", new CityLocation(decimal("35.0116"), decimal("135.7681"))));
        when(service.listTripsWithCities()).thenReturn(List.of(trip));

        GetJourneysTool.Result result = (GetJourneysTool.Result) new GetJourneysTool(service, objectMapper)
                .execute("{}");

        assertThat(result.journeys()).singleElement().satisfies(journey -> {
            assertThat(journey.name()).isEqualTo("Japan");
            assertThat(journey.stops()).extracting(GetJourneysTool.Stop::city)
                    .containsExactly("Tokyo", "Kyoto");
            assertThat(journey.stops().getFirst().longitude()).isEqualByComparingTo("139.650300");
        });
        assertThat(objectMapper.writeValueAsString(result)).doesNotContain(trip.getId().toString());
    }

    @Test
    void bucketListToolReturnsVisitedSemanticsWithoutSecurityData() {
        BucketListService service = mock(BucketListService.class);
        UserAccount user = new UserAccount("alice@example.com", "secret-hash", "Alice");
        City porto = new City(
                new Country("PT", "Portugal"),
                "Porto",
                new CityLocation(decimal("41.1579"), decimal("-8.6291")));
        when(service.listItems()).thenReturn(List.of(new BucketListEntry(new BucketListItem(user, porto), false)));

        GetBucketListTool.Result result = (GetBucketListTool.Result) new GetBucketListTool(service, objectMapper)
                .execute("{}");

        assertThat(result.places()).singleElement().satisfies(place -> {
            assertThat(place.city()).isEqualTo("Porto");
            assertThat(place.countryCode()).isEqualTo("PT");
            assertThat(place.state()).isEqualTo("want_to_visit");
        });
        assertThat(objectMapper.writeValueAsString(result))
                .doesNotContain("alice@example.com", "secret-hash", "userId");
    }

    @Test
    void weatherToolValidatesCoordinatesBeforeCallingTheProvider() {
        WeatherClient weatherClient = mock(WeatherClient.class);
        BigDecimal latitude = decimal("41.1579");
        BigDecimal longitude = decimal("-8.6291");
        WeatherForecast forecast = new WeatherForecast(
                latitude, longitude, LocalDate.parse("2026-09-03"), decimal("15.2"), decimal("23.8"), 10, 1,
                "partly cloudy or overcast");
        when(weatherClient.getShortTermForecast(latitude, longitude)).thenReturn(forecast);
        GetWeatherTool tool = new GetWeatherTool(weatherClient, objectMapper);

        assertThat(tool.execute("{\"latitude\":41.1579,\"longitude\":-8.6291}")).isEqualTo(forecast);
        verify(weatherClient).getShortTermForecast(latitude, longitude);
        assertThatThrownBy(() -> tool.execute("{\"latitude\":91,\"longitude\":0}"))
                .isInstanceOf(ToolArgumentException.class)
                .hasMessageContaining("latitude");
        assertThatThrownBy(() -> tool.execute("{\"latitude\":0,\"longitude\":181}"))
                .isInstanceOf(ToolArgumentException.class)
                .hasMessageContaining("longitude");
        assertThatThrownBy(() -> tool.execute("{\"latitude\":0,\"longitude\":0,\"url\":\"https://evil\"}"))
                .isInstanceOf(ToolArgumentException.class);
        for (String invalid : List.of(
                "[]",
                "null",
                "\"coordinates\"",
                "{\"latitude\":\"41.1\",\"longitude\":-8.6}",
                "{\"latitude\":null,\"longitude\":-8.6}",
                "{\"latitude\":NaN,\"longitude\":-8.6}",
                "{\"latitude\":Infinity,\"longitude\":-8.6}",
                "{\"latitude\":-Infinity,\"longitude\":-8.6}")) {
            assertThatThrownBy(() -> tool.execute(invalid))
                    .as("invalid weather arguments: %s", invalid)
                    .isInstanceOf(ToolArgumentException.class);
        }
        assertThatThrownBy(() -> tool.execute(null)).isInstanceOf(ToolArgumentException.class);
    }

    @Test
    void everyPersonalToolRejectsNonEmptyAndNonObjectArguments() {
        List<TravelAgentTool> tools = List.of(
                new GetTravelProfileTool(mock(TravelProfileService.class), objectMapper),
                new GetJourneysTool(mock(TripService.class), objectMapper),
                new GetBucketListTool(mock(BucketListService.class), objectMapper));

        for (TravelAgentTool tool : tools) {
            for (String invalid : List.of(
                    "{\"userId\":\"someone-else\"}",
                    "{\"unexpected\":true}",
                    "[]",
                    "null",
                    "\"text\"")) {
                assertThatThrownBy(() -> tool.execute(invalid))
                        .as("%s arguments: %s", tool.definition().name(), invalid)
                        .isInstanceOf(ToolArgumentException.class);
            }
            assertThatThrownBy(() -> tool.execute(null))
                    .as("%s null arguments", tool.definition().name())
                    .isInstanceOf(ToolArgumentException.class);
        }
    }

    @Test
    void placeSearchResolvesProviderNeutralCitiesAndAppliesCountryAndLimitFilters() {
        CitySearchService service = mock(CitySearchService.class);
        when(service.searchCities("Florence")).thenReturn(List.of(
                new CitySearchResult(
                        "Florence", "Italy", "Tuscany", "IT", decimal("43.7696"), decimal("11.2558")),
                new CitySearchResult(
                        "Florence", "United States", "Alabama", "US", decimal("34.7998"), decimal("-87.6773")),
                new CitySearchResult(
                        "Florence", "United States", "South Carolina", "US", decimal("34.1954"), decimal("-79.7626"))));
        SearchPlacesTool tool = new SearchPlacesTool(service, objectMapper);

        SearchPlacesTool.Result result = (SearchPlacesTool.Result) tool.execute(
                "{\"query\":\"Florence\",\"countryCode\":\"us\",\"limit\":2}");

        assertThat(result.places())
                .extracting(SearchPlacesTool.Place::region)
                .containsExactly("Alabama", "South Carolina");
        assertThat(result.places()).allSatisfy(place -> assertThat(place.countryCode()).isEqualTo("US"));
        verify(service).searchCities("Florence");
        assertThat(tool.definition().description()).contains("does not rank");
        assertThat(tool.definition().inputSchema().toString()).doesNotContainIgnoringCase("userId", "url");
    }

    @Test
    void placeSearchHandlesNoMatchesProviderFailureAndInvalidArguments() {
        CitySearchService service = mock(CitySearchService.class);
        when(service.searchCities("Unknown place")).thenReturn(List.of());
        when(service.searchCities("Failure")).thenThrow(new IllegalStateException("provider failed"));
        SearchPlacesTool tool = new SearchPlacesTool(service, objectMapper);

        assertThat(((SearchPlacesTool.Result) tool.execute(
                "{\"query\":\"Unknown place\",\"countryCode\":null,\"limit\":5}"))
                .places()).isEmpty();
        assertThatThrownBy(() -> tool.execute(
                "{\"query\":\"Failure\",\"countryCode\":null,\"limit\":5}"))
                .isInstanceOf(IllegalStateException.class);
        for (String invalid : List.of(
                "{\"query\":\"x\",\"countryCode\":null,\"limit\":5}",
                "{\"query\":\"Rome\",\"countryCode\":\"ITA\",\"limit\":5}",
                "{\"query\":\"Rome\",\"countryCode\":null,\"limit\":9}",
                "{\"query\":\"Rome\",\"countryCode\":null,\"limit\":5,\"url\":\"https://evil\"}")) {
            assertThatThrownBy(() -> tool.execute(invalid)).isInstanceOf(ToolArgumentException.class);
        }
    }

    private static BigDecimal decimal(String value) {
        return new BigDecimal(value);
    }
}
