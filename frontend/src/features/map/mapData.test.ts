import { describe, expect, it } from 'vitest'
import { countryCodesFromOverview, markersForMap, markersForTrip } from './mapData'
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
  it('derives unique visited country codes from persisted country codes', () => {
    expect(countryCodesFromOverview(overview)).toEqual(['FR', 'IT'])
  })

  it('marks markers that belong to the selected trip', () => {
    expect(markersForMap(overview, 'italy')[0]?.isSelectedTrip).toBe(true)
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
})
