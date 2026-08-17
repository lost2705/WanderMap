import { describe, expect, it } from 'vitest'
import {
  COUNTRY_ISO_ALPHA2_PROPERTY,
  countryCodesForMap,
  countryFeatureFilter,
  markersForMap,
  markersForTrip,
  selectedTripCameraTarget,
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

  it('only creates focus markers for itinerary stops with coordinates', () => {
    const trip: Trip = {
      id: 'italy',
      name: 'Italy',
      startDate: null,
      endDate: null,
      stops: [
        {
          id: 'rome',
          position: 1,
          city: { id: 'city-rome', name: 'Rome', latitude: 41.9028, longitude: 12.4964, country: { code: 'IT', name: 'Italy' } },
        },
        {
          id: 'unknown',
          position: 2,
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
      stops: [
        {
          id: 'rome',
          position: 1,
          city: { id: 'city-rome', name: 'Rome', latitude: 41.9028, longitude: 12.4964, country: { code: 'IT', name: 'Italy' } },
        },
        {
          id: 'florence',
          position: 2,
          city: { id: 'city-florence', name: 'Florence', latitude: 43.7696, longitude: 11.2558, country: { code: 'IT', name: 'Italy' } },
        },
        {
          id: 'unknown',
          position: 3,
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
      stops: [
        {
          id: 'rome',
          position: 1,
          city: { id: 'city-rome', name: 'Rome', latitude: 41.9028, longitude: 12.4964, country: { code: 'IT', name: 'Italy' } },
        },
      ],
    }
    const unresolvedTrip: Trip = { ...oneLocatedStop, stops: [{
      id: 'unknown',
      position: 1,
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
    stops: countryCodes.map((countryCode, index) => ({
      id: `${id}-stop-${index}`,
      position: index + 1,
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
