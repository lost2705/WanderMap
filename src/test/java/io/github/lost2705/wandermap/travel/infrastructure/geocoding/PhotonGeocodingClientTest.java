package io.github.lost2705.wandermap.travel.infrastructure.geocoding;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import io.github.lost2705.wandermap.travel.application.CitySearchResult;
import io.github.lost2705.wandermap.travel.application.GeocodingUnavailableException;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class PhotonGeocodingClientTest {

    private MockRestServiceServer server;
    private PhotonGeocodingClient client;

    @BeforeEach
    void setUp() {
        RestClient.Builder builder = RestClient.builder().baseUrl("https://photon.test");
        server = MockRestServiceServer.bindTo(builder).build();
        client = new PhotonGeocodingClient(builder.build());
    }

    @Test
    void mapsValidProviderFeaturesAndIgnoresIncompleteOrInvalidOnes() {
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://photon.test/api")))
                .andExpect(queryParam("q", "Flo"))
                .andExpect(queryParam("limit", "8"))
                .andExpect(queryParam("lang", "en"))
                .andExpect(queryParam("layer", "city", "locality"))
                .andRespond(withSuccess(
                        """
                        {
                          "features": [
                            {
                              "properties": {"name":"Florence","country":"Italy","state":"Tuscany","countrycode":"it","ignored":"value"},
                              "geometry": {"type":"Point","coordinates":[11.2558,43.7696]}
                            },
                            {
                              "properties": {"name":"Florence","country":"Italy","state":"Tuscany","countrycode":"IT"},
                              "geometry": {"type":"Point","coordinates":[11.255800,43.769600]}
                            },
                            {
                              "properties": {"name":"Missing country code","country":"Italy"},
                              "geometry": {"type":"Point","coordinates":[11.0,43.0]}
                            },
                            {
                              "properties": {"name":"Outside world","country":"Italy","countrycode":"IT"},
                              "geometry": {"type":"Point","coordinates":[11.0,143.0]}
                            },
                            {
                              "properties": {"name":"Not a point","country":"Italy","countrycode":"IT"},
                              "geometry": {"type":"Polygon","coordinates":[11.0,43.0]}
                            }
                          ]
                        }
                        """,
                        MediaType.APPLICATION_JSON));

        List<CitySearchResult> results = client.searchCities("Flo");

        assertThat(results).containsExactly(new CitySearchResult(
                "Florence",
                "Italy",
                "Tuscany",
                "IT",
                new java.math.BigDecimal("43.7696"),
                new java.math.BigDecimal("11.2558")));
        server.verify();
    }

    @Test
    void translatesProviderFailures() {
        server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://photon.test/api")))
                .andRespond(withServerError());

        assertThatThrownBy(() -> client.searchCities("Florence"))
                .isInstanceOf(GeocodingUnavailableException.class)
                .hasMessage("City search is temporarily unavailable");
        server.verify();
    }
}
