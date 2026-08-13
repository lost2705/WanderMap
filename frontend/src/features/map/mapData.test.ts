import { describe, expect, it } from 'vitest'
import {
  COUNTRY_ISO_ALPHA2_PROPERTY,
  countryCodesFromOverview,
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
  ],
}

describe('map data', () => {
  it('normalizes no, one, multiple, and duplicate visited country codes', () => {
    expect(countryCodesFromOverview(null)).toEqual([])
    expect(countryCodesFromOverview({ ...overview, visitedCountryCodes: ['IT'] })).toEqual(['IT'])
    expect(countryCodesFromOverview({ ...overview, visitedCountryCodes: ['TH', 'IT'] })).toEqual(['IT', 'TH'])
    expect(countryCodesFromOverview(overview)).toEqual(['FR', 'IT'])
  })

  it('marks markers that belong to the selected trip', () => {
    const marker = markersForMap(overview, 'italy')[0]
    expect(marker?.isSelectedTrip).toBe(true)
    expect(marker?.markerLabel).toBe('1')
    expect(marker?.coordinate).toEqual([12.4964, 41.9028])
    expect(markersForMap(overview, 'another-trip')[0]?.isSelectedTrip).toBe(false)
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
