import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Trip, TripMapOverview } from '../../types/travel'
import { routeFeatureCollection, routesForMap } from './mapData'
import {
  ROUTE_CASING_LAYER_ID,
  ROUTE_LINE_LAYER_ID,
  ROUTE_SOURCE_ID,
  ensureTripRouteLayers,
  removeTripRouteLayers,
  updateTripRouteData,
} from './routeLayers'

const sourceSetData = vi.fn()
const sources = new Map<string, { setData: typeof sourceSetData }>()
const layers = new Map<string, { id: string }>()
const fakeMap = {
  addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
  addSource: vi.fn((id: string) => sources.set(id, { setData: sourceSetData })),
  getLayer: vi.fn((id: string) => layers.get(id)),
  getSource: vi.fn((id: string) => sources.get(id)),
  removeLayer: vi.fn((id: string) => layers.delete(id)),
  removeSource: vi.fn((id: string) => sources.delete(id)),
} as unknown as MapLibreMap

beforeEach(() => {
  sources.clear()
  layers.clear()
  vi.clearAllMocks()
})

describe('trip route layers', () => {
  it('creates one source and one of each route layer without duplicating lifecycle state', () => {
    ensureTripRouteLayers(fakeMap)
    ensureTripRouteLayers(fakeMap)

    expect(fakeMap.addSource).toHaveBeenCalledTimes(1)
    expect(fakeMap.addSource).toHaveBeenCalledWith(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    })
    expect(fakeMap.addLayer).toHaveBeenCalledTimes(2)
    expect(layers.has(ROUTE_CASING_LAYER_ID)).toBe(true)
    expect(layers.has(ROUTE_LINE_LAYER_ID)).toBe(true)

    removeTripRouteLayers(fakeMap)
    removeTripRouteLayers(fakeMap)

    expect(fakeMap.removeLayer).toHaveBeenCalledTimes(2)
    expect(fakeMap.removeSource).toHaveBeenCalledTimes(1)
  })

  it('updates the existing source across global and selected route transitions', () => {
    ensureTripRouteLayers(fakeMap)
    const globalData = routeFeatureCollection(routesForMap(overview, null))
    const selectedData = routeFeatureCollection(routesForMap(overview, japanTrip))

    updateTripRouteData(fakeMap, globalData)
    updateTripRouteData(fakeMap, selectedData)
    updateTripRouteData(fakeMap, globalData)

    expect(sourceSetData).toHaveBeenCalledTimes(3)
    expect(sourceSetData.mock.calls.map(([data]) => data.features.length)).toEqual([2, 1, 2])
    expect(sourceSetData.mock.calls[1]?.[0].features[0]?.geometry.coordinates).toEqual([
      [139.6503, 35.6762],
      [135.7681, 35.0116],
    ])
    expect(fakeMap.addSource).toHaveBeenCalledTimes(1)
    expect(fakeMap.addLayer).toHaveBeenCalledTimes(2)
  })
})

const overview: TripMapOverview = {
  visitedCountryCodes: ['IT', 'JP'],
  markers: [
    marker('italy', 'rome', 1, 41.9028, 12.4964, 'IT'),
    marker('italy', 'florence', 2, 43.7696, 11.2558, 'IT'),
    marker('japan', 'tokyo', 1, 35.6762, 139.6503, 'JP'),
    marker('japan', 'kyoto', 2, 35.0116, 135.7681, 'JP'),
  ],
}

const japanTrip: Trip = {
  id: 'japan',
  name: 'Japan',
  startDate: null,
  endDate: null,
  description: null,
  stops: [
    stop('tokyo', 1, 35.6762, 139.6503),
    stop('kyoto', 2, 35.0116, 135.7681),
  ],
}

function marker(
  tripId: string,
  stopId: string,
  position: number,
  latitude: number,
  longitude: number,
  countryCode: string,
) {
  return {
    tripId,
    stopId,
    position,
    cityName: stopId,
    latitude,
    longitude,
    country: { code: countryCode, name: countryCode },
  }
}

function stop(id: string, position: number, latitude: number, longitude: number) {
  return {
    id,
    position,
    arrivalDate: null,
    departureDate: null,
    note: null,
    city: {
      id: `city-${id}`,
      name: id,
      latitude,
      longitude,
      country: { code: 'JP', name: 'Japan' },
    },
  }
}
