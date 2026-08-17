import { describe, expect, it } from 'vitest'
import {
  COUNTRY_ISO_ALPHA2_PROPERTY,
  MARKER_MINIMUM_SPACING,
  countryCodesForMap,
  countryFeatureFilter,
  markerOffsetsForScreenCollisions,
  markerScreenKey,
  markersForMap,
  markersForTrip,
  routeFeatureCollection,
  routesForMap,
  selectedTripCameraTarget,
  tripVisualIdentity,
  toMapCoordinate,
} from './mapData'
import type { Trip, TripMapOverview } from '../../types/travel'

const overview: TripMapOverview = {
  visitedCountryCodes: ['IT', 'FR', 'IT'],
  markers: [
    {
      tripId: 'italy',
      stopId: 'rome',
      position: 1,
      cityName: 'Rome',
      latitude: 41.9028,
      longitude: 12.4964,
      country: { code: 'IT', name: 'Italy' },
    },
    {
      tripId: 'japan',
      stopId: 'tokyo',
      position: 1,
      cityName: 'Tokyo',
      latitude: 35.6762,
      longitude: 139.6503,
      country: { code: 'JP', name: 'Japan' },
    },
  ],
}

describe('map data', () => {
  it('uses all global visited countries when no trip is selected', () => {
    expect(countryCodesForMap(null, null)).toEqual([])
    expect(countryCodesForMap(overview, null)).toEqual(['FR', 'IT'])
  })

  it('uses only the selected single-country trip countries', () => {
    expect(countryCodesForMap(overview, tripWithCountries('japan', 'JP', 'JP'))).toEqual(['JP'])
  })

  it('uses unique countries from every selected multi-country trip stop', () => {
    expect(countryCodesForMap(overview, tripWithCountries('italy', 'IT', 'US', 'RU', 'IT')))
      .toEqual(['IT', 'RU', 'US'])
  })

  it('shows only selected-trip markers', () => {
    const markers = markersForMap(overview, 'italy')
    expect(markers).toHaveLength(1)
    const marker = markers[0]
    expect(marker?.isSelectedTrip).toBe(true)
    expect(marker?.markerLabel).toBe('1')
    expect(marker?.coordinate).toEqual([12.4964, 41.9028])
    expect(markersForMap(overview, 'another-trip')).toEqual([])
  })

  it('shows all markers when no trip is selected', () => {
    const markers = markersForMap(overview, null)
    expect(markers.map((marker) => marker.tripId)).toEqual(['italy', 'japan'])
    expect(markers.every((marker) => !marker.isSelectedTrip)).toBe(true)
  })

  it('does not create routes for zero or one located stop', () => {
    expect(routesForMap(null, tripWithRouteStops('empty'))).toEqual([])
    expect(routesForMap(null, tripWithRouteStops('one', ['rome', 1, 41.9028, 12.4964]))).toEqual([])
  })

  it('connects two located stops using longitude-latitude coordinates', () => {
    const routes = routesForMap(null, tripWithRouteStops(
      'italy',
      ['rome', 1, 41.9028, 12.4964],
      ['florence', 2, 43.7696, 11.2558],
    ))

    expect(routes).toHaveLength(1)
    expect(routes[0]?.coordinates).toEqual([
      [12.4964, 41.9028],
      [11.2558, 43.7696],
    ])
  })

  it('orders multi-stop routes by TripStop.position rather than response order', () => {
    const routes = routesForMap(null, tripWithRouteStops(
      'italy',
      ['venice', 3, 45.4408, 12.3155],
      ['rome', 1, 41.9028, 12.4964],
      ['florence', 2, 43.7696, 11.2558],
    ))

    expect(routes[0]?.coordinates).toEqual([
      [12.4964, 41.9028],
      [11.2558, 43.7696],
      [12.3155, 45.4408],
    ])
  })

  it('skips missing coordinates and connects the remaining located stops in itinerary order', () => {
    const routes = routesForMap(null, tripWithRouteStops(
      'legacy',
      ['rome', 1, 41.9028, 12.4964],
      ['unknown', 2, null, null],
      ['venice', 3, 45.4408, 12.3155],
    ))

    expect(routes[0]?.coordinates).toEqual([
      [12.4964, 41.9028],
      [12.3155, 45.4408],
    ])
  })

  it('isolates the selected route and includes multiple routes in the global overview', () => {
    const globalRoutes = routesForMap(routeOverview(), null)
    expect(globalRoutes.map((route) => route.tripId)).toEqual(['italy', 'japan'])
    expect(globalRoutes.map((route) => route.lineOffset)).toEqual([-1.5, 1.5])

    const selectedRoutes = routesForMap(
      routeOverview(),
      tripWithRouteStops(
        'japan',
        ['tokyo', 1, 35.6762, 139.6503],
        ['kyoto', 2, 35.0116, 135.7681],
      ),
    )
    expect(selectedRoutes).toHaveLength(1)
    expect(selectedRoutes[0]).toMatchObject({ tripId: 'japan', isSelectedTrip: true, lineOffset: 0 })
  })

  it('derives a stable visual identity and carries it into GeoJSON presentation data', () => {
    expect(tripVisualIdentity('italy')).toEqual(tripVisualIdentity('italy'))
    expect(tripVisualIdentity('italy')).not.toEqual(tripVisualIdentity('japan'))

    const routes = routesForMap(routeOverview(), null)
    const geoJson = routeFeatureCollection(routes)
    expect(geoJson.type).toBe('FeatureCollection')
    expect(geoJson.features.map((feature) => feature.properties.color))
      .toEqual(routes.map((route) => route.color))
    expect(geoJson.features[0]?.geometry.coordinates[0]).toEqual([12.4964, 41.9028])
  })

  it('separates routes for two trips that share the same city', () => {
    const sharedOverview = routeOverview(true)
    const routes = routesForMap(sharedOverview, null)
    expect(routes[0]?.coordinates[0]).toEqual(routes[1]?.coordinates[0])
    expect(routes[0]?.lineOffset).not.toBe(routes[1]?.lineOffset)

    const sharedMarkers = markersForMap(sharedOverview, null)
      .filter((marker) => marker.cityName === 'Rome')
    expect(sharedMarkers).toHaveLength(2)
    expect(sharedMarkers.map((marker) => marker.color))
      .toEqual(sharedMarkers.map((marker) => tripVisualIdentity(marker.tripId).color))
  })

  it('separates exact-coordinate marker collisions and keeps every marker addressable', () => {
    const markers = [
      projectedMarker('italy', 'rome-italy', 1, 100, 100),
      projectedMarker('japan', 'rome-japan', 1, 100, 100),
    ]
    const offsets = markerOffsetsForScreenCollisions(markers)

    expect(offsets.size).toBe(2)
    expect(offsets.get(markerScreenKey(markers[0]!))).not.toEqual([0, 0])
    expect(offsets.get(markerScreenKey(markers[1]!))).not.toEqual([0, 0])
    expect(screenDistance(displayedPosition(markers[0]!, offsets), displayedPosition(markers[1]!, offsets)))
      .toBeGreaterThanOrEqual(MARKER_MINIMUM_SPACING)
  })

  it('separates nearby screen-space collisions deterministically', () => {
    const markers = [
      projectedMarker('japan', 'tokyo', 1, 100, 100),
      projectedMarker('japan', 'kyoto', 2, 112, 102),
      projectedMarker('japan', 'osaka', 3, 113, 103),
    ]
    const firstOffsets = markerOffsetsForScreenCollisions(markers)
    const secondOffsets = markerOffsetsForScreenCollisions([...markers].reverse())
    const displayedPositions = markers.map((marker) => displayedPosition(marker, firstOffsets))

    expect([...firstOffsets.entries()]).toEqual([...secondOffsets.entries()])
    expect(new Set(firstOffsets.keys())).toEqual(new Set(markers.map(markerScreenKey)))
    for (let firstIndex = 0; firstIndex < displayedPositions.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < displayedPositions.length; secondIndex += 1) {
        expect(screenDistance(displayedPositions[firstIndex]!, displayedPositions[secondIndex]!))
          .toBeGreaterThanOrEqual(MARKER_MINIMUM_SPACING)
      }
    }
  })

  it('recomputes collision offsets from projected positions without accumulating transition state', () => {
    const nearbyMarkers = [
      projectedMarker('japan', 'tokyo', 1, 100, 100),
      projectedMarker('japan', 'kyoto', 2, 108, 101),
      projectedMarker('japan', 'osaka', 3, 109, 102),
    ]
    const separatedMarkers = nearbyMarkers.map((marker, index) => ({
      ...marker,
      screenCoordinate: [100 + index * 100, 100] as [number, number],
    }))

    const selectedOffsets = markerOffsetsForScreenCollisions(nearbyMarkers)
    const globalOffsets = markerOffsetsForScreenCollisions(separatedMarkers)
    const selectedAgainOffsets = markerOffsetsForScreenCollisions(nearbyMarkers)

    expect([...selectedAgainOffsets.entries()]).toEqual([...selectedOffsets.entries()])
    expect([...globalOffsets.values()]).toEqual([[0, 0], [0, 0], [0, 0]])
  })

  it('keeps base marker offsets neutral and updates route data when stops change', () => {
    const initialTrip = tripWithRouteStops(
      'italy',
      ['rome', 1, 41.9028, 12.4964],
      ['florence', 2, 43.7696, 11.2558],
    )
    const updatedTrip = tripWithRouteStops(
      'italy',
      ['venice', 3, 45.4408, 12.3155],
      ['rome', 1, 41.9028, 12.4964],
      ['florence', 2, 43.7696, 11.2558],
    )

    expect(markersForMap(routeOverview(true), 'italy').every((marker) => marker.pixelOffset[0] === 0
      && marker.pixelOffset[1] === 0)).toBe(true)
    expect(routesForMap(null, initialTrip)[0]?.coordinates).toHaveLength(2)
    expect(routesForMap(null, updatedTrip)[0]?.coordinates).toHaveLength(3)
    expect(routesForMap(null, updatedTrip)[0]?.coordinates[2]).toEqual([12.3155, 45.4408])
  })

  it('keeps route geometry and camera targets unchanged when only journal fields change', () => {
    const trip = tripWithRouteStops(
      'japan',
      ['tokyo', 1, 35.6762, 139.6503],
      ['kyoto', 2, 35.0116, 135.7681],
    )
    const journaledTrip: Trip = {
      ...trip,
      description: 'Cherry blossoms and temples.',
      startDate: '2026-04-01',
      endDate: '2026-04-12',
      stops: trip.stops.map((stop, index) => ({
        ...stop,
        arrivalDate: index === 0 ? '2026-04-02' : '2026-04-06',
        departureDate: index === 0 ? '2026-04-05' : '2026-04-09',
        note: index === 0 ? 'Tokyo journal' : 'Kyoto journal',
      })),
    }

    expect(routesForMap(null, journaledTrip)).toEqual(routesForMap(null, trip))
    expect(selectedTripCameraTarget(journaledTrip)).toEqual(selectedTripCameraTarget(trip))
  })

  it('only creates focus markers for itinerary stops with coordinates', () => {
    const trip: Trip = {
      id: 'italy',
      name: 'Italy',
      startDate: null,
      endDate: null,
      description: null,
      stops: [
        {
          id: 'rome',
          position: 1,
          arrivalDate: null,
          departureDate: null,
          note: null,
          city: { id: 'city-rome', name: 'Rome', latitude: 41.9028, longitude: 12.4964, country: { code: 'IT', name: 'Italy' } },
        },
        {
          id: 'unknown',
          position: 2,
          arrivalDate: null,
          departureDate: null,
          note: null,
          city: { id: 'city-unknown', name: 'Unknown', latitude: null, longitude: null, country: { code: 'IT', name: 'Italy' } },
        },
      ],
    }

    expect(markersForTrip(trip)).toHaveLength(1)
    expect(markersForTrip(trip)[0]?.cityName).toBe('Rome')
  })

  it('always passes coordinates to MapLibre as longitude then latitude', () => {
    expect(toMapCoordinate(41.9028, 12.4964)).toEqual([12.4964, 41.9028])
  })

  it('builds a Natural Earth ISO alpha-2 filter from persisted country codes', () => {
    expect(countryFeatureFilter(['IT', 'TH'])).toEqual([
      'match',
      ['get', COUNTRY_ISO_ALPHA2_PROPERTY],
      ['IT', 'TH'],
      true,
      false,
    ])
    expect(countryFeatureFilter([])).toEqual(['==', ['get', COUNTRY_ISO_ALPHA2_PROPERTY], ''])
  })

  it('derives bounds for a multi-stop selected trip and ignores unresolved stops', () => {
    const trip: Trip = {
      id: 'italy',
      name: 'Italy',
      startDate: null,
      endDate: null,
      description: null,
      stops: [
        {
          id: 'rome',
          position: 1,
          arrivalDate: null,
          departureDate: null,
          note: null,
          city: { id: 'city-rome', name: 'Rome', latitude: 41.9028, longitude: 12.4964, country: { code: 'IT', name: 'Italy' } },
        },
        {
          id: 'florence',
          position: 2,
          arrivalDate: null,
          departureDate: null,
          note: null,
          city: { id: 'city-florence', name: 'Florence', latitude: 43.7696, longitude: 11.2558, country: { code: 'IT', name: 'Italy' } },
        },
        {
          id: 'unknown',
          position: 3,
          arrivalDate: null,
          departureDate: null,
          note: null,
          city: { id: 'city-unknown', name: 'Unknown', latitude: null, longitude: null, country: { code: 'IT', name: 'Italy' } },
        },
      ],
    }

    expect(selectedTripCameraTarget(trip)).toEqual({
      kind: 'bounds',
      tripId: 'italy',
      coordinates: [[12.4964, 41.9028], [11.2558, 43.7696]],
    })
  })

  it('derives a city camera for exactly one located stop and no movement for unresolved trips', () => {
    const oneLocatedStop: Trip = {
      id: 'italy',
      name: 'Italy',
      startDate: null,
      endDate: null,
      description: null,
      stops: [
        {
          id: 'rome',
          position: 1,
          arrivalDate: null,
          departureDate: null,
          note: null,
          city: { id: 'city-rome', name: 'Rome', latitude: 41.9028, longitude: 12.4964, country: { code: 'IT', name: 'Italy' } },
        },
      ],
    }
    const unresolvedTrip: Trip = { ...oneLocatedStop, stops: [{
      id: 'unknown',
      position: 1,
      arrivalDate: null,
      departureDate: null,
      note: null,
      city: { id: 'city-unknown', name: 'Unknown', latitude: null, longitude: null, country: { code: 'IT', name: 'Italy' } },
    }] }

    expect(selectedTripCameraTarget(oneLocatedStop)).toEqual({
      kind: 'point', tripId: 'italy', coordinate: [12.4964, 41.9028], zoom: 6,
    })
    expect(selectedTripCameraTarget(unresolvedTrip)).toEqual({ kind: 'none' })
  })
})

function tripWithCountries(id: string, ...countryCodes: string[]): Trip {
  return {
    id,
    name: id,
    startDate: null,
    endDate: null,
    description: null,
    stops: countryCodes.map((countryCode, index) => ({
      id: `${id}-stop-${index}`,
      position: index + 1,
      arrivalDate: null,
      departureDate: null,
      note: null,
      city: {
        id: `${id}-city-${index}`,
        name: `City ${index}`,
        latitude: null,
        longitude: null,
        country: { code: countryCode, name: countryCode },
      },
    })),
  }
}

type RouteStopFixture = [
  id: string,
  position: number,
  latitude: number | null,
  longitude: number | null,
]

function tripWithRouteStops(id: string, ...stops: RouteStopFixture[]): Trip {
  return {
    id,
    name: id,
    startDate: null,
    endDate: null,
    description: null,
    stops: stops.map(([stopId, position, latitude, longitude]) => ({
      id: stopId,
      position,
      arrivalDate: null,
      departureDate: null,
      note: null,
      city: {
        id: `city-${stopId}`,
        name: stopId,
        latitude,
        longitude,
        country: { code: 'IT', name: 'Italy' },
      },
    })),
  }
}

function routeOverview(sharedCity = false): TripMapOverview {
  return {
    visitedCountryCodes: ['IT', 'JP'],
    markers: [
      routeMarker('italy', 'florence', 2, 'Florence', 43.7696, 11.2558, 'IT', 'Italy'),
      routeMarker('italy', 'rome-italy', 1, 'Rome', 41.9028, 12.4964, 'IT', 'Italy'),
      routeMarker(
        'japan',
        sharedCity ? 'rome-japan' : 'tokyo',
        1,
        sharedCity ? 'Rome' : 'Tokyo',
        sharedCity ? 41.9028 : 35.6762,
        sharedCity ? 12.4964 : 139.6503,
        sharedCity ? 'IT' : 'JP',
        sharedCity ? 'Italy' : 'Japan',
      ),
      routeMarker('japan', 'kyoto', 2, 'Kyoto', 35.0116, 135.7681, 'JP', 'Japan'),
    ],
  }
}

function routeMarker(
  tripId: string,
  stopId: string,
  position: number,
  cityName: string,
  latitude: number,
  longitude: number,
  countryCode: string,
  countryName: string,
) {
  return {
    tripId,
    stopId,
    position,
    cityName,
    latitude,
    longitude,
    country: { code: countryCode, name: countryName },
  }
}

function projectedMarker(
  tripId: string,
  stopId: string,
  position: number,
  x: number,
  y: number,
) {
  return {
    tripId,
    stopId,
    position,
    screenCoordinate: [x, y] as [number, number],
  }
}

function displayedPosition(
  marker: ReturnType<typeof projectedMarker>,
  offsets: ReturnType<typeof markerOffsetsForScreenCollisions>,
): [number, number] {
  const offset = offsets.get(markerScreenKey(marker)) ?? [0, 0]
  return [
    marker.screenCoordinate[0] + offset[0],
    marker.screenCoordinate[1] + offset[1],
  ]
}

function screenDistance(first: [number, number], second: [number, number]): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1])
}
