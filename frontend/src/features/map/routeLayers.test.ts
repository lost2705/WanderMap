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
  updateTripRouteColor,
  updateTripRouteData,
} from './routeLayers'

const sourceSetData = vi.fn()
const sources = new Map<string, { setData: typeof sourceSetData }>()
const layers = new Map<string, { id: string; paint?: Record<string, unknown> }>()
const fakeMap = {
  getStyle: () => ({ layers: [{ id: 'base-labels', type: 'symbol', 'source-layer': 'place' }] }),
  addLayer: vi.fn((layer: { id: string; paint?: Record<string, unknown> }) => layers.set(layer.id, layer)),
  addSource: vi.fn((id: string) => sources.set(id, { setData: sourceSetData })),
  getLayer: vi.fn((id: string) => layers.get(id)),
  getSource: vi.fn((id: string) => sources.get(id)),
  removeLayer: vi.fn((id: string) => layers.delete(id)),
  removeSource: vi.fn((id: string) => sources.delete(id)),
  setPaintProperty: vi.fn(),
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
    expect(fakeMap.addLayer).toHaveBeenNthCalledWith(1, expect.any(Object), undefined)
    expect(fakeMap.addLayer).toHaveBeenNthCalledWith(2, expect.any(Object), undefined)
    expect(layers.has(ROUTE_CASING_LAYER_ID)).toBe(true)
    expect(layers.has(ROUTE_LINE_LAYER_ID)).toBe(true)
    expect(layers.get(ROUTE_LINE_LAYER_ID)?.paint?.['line-color']).toEqual(['get', 'identityColor'])

    removeTripRouteLayers(fakeMap)
    removeTripRouteLayers(fakeMap)

    expect(fakeMap.removeLayer).toHaveBeenCalledTimes(2)
    expect(fakeMap.removeSource).toHaveBeenCalledTimes(1)
  })

  it('updates selected-route presentation color without recreating its source or layers', () => {
    updateTripRouteColor(fakeMap, '#bd5426')
    expect(fakeMap.setPaintProperty).not.toHaveBeenCalled()

    ensureTripRouteLayers(fakeMap)
    updateTripRouteColor(fakeMap, '#f09a68')

    expect(fakeMap.setPaintProperty).toHaveBeenCalledWith(ROUTE_LINE_LAYER_ID, 'line-color', '#f09a68')
    expect(fakeMap.addSource).toHaveBeenCalledTimes(1)
    expect(fakeMap.addLayer).toHaveBeenCalledTimes(2)

    updateTripRouteColor(fakeMap, null)
    expect(fakeMap.setPaintProperty).toHaveBeenLastCalledWith(
      ROUTE_LINE_LAYER_ID,
      'line-color',
      ['get', 'identityColor'],
    )
  })

  it('updates the persistent source across World toggle and selected-Journey transitions', () => {
    ensureTripRouteLayers(fakeMap)
    const hiddenGlobalData = routeFeatureCollection(routesForMap(overview, null, false))
    const visibleGlobalData = routeFeatureCollection(routesForMap(overview, null, true))
    const italyData = routeFeatureCollection(routesForMap(overview, italyTrip))

    updateTripRouteData(fakeMap, hiddenGlobalData)
    updateTripRouteData(fakeMap, visibleGlobalData)
    updateTripRouteData(fakeMap, italyData)
    updateTripRouteData(fakeMap, hiddenGlobalData)

    expect(sourceSetData).toHaveBeenCalledTimes(4)
    expect(sourceSetData.mock.calls.map(([data]) => data.features.length)).toEqual([0, 2, 1, 0])
    expect(sourceSetData.mock.calls[1]?.[0].features.map((feature: { properties: { tripId: string } }) => (
      feature.properties.tripId
    ))).toEqual(['italy', 'japan'])
    expect(sourceSetData.mock.calls[2]?.[0].features[0]?.geometry.coordinates).toEqual([
      [12.4964, 41.9028],
      [11.2558, 43.7696],
    ])
    expect(fakeMap.addSource).toHaveBeenCalledTimes(1)
    expect(fakeMap.addLayer).toHaveBeenCalledTimes(2)
  })
})

const overview: TripMapOverview = {
  visitedCountryCodes: ['IT', 'JP'],
  memoryCount: 0,
  markers: [
    marker('italy', 'rome', 1, 41.9028, 12.4964, 'IT'),
    marker('italy', 'florence', 2, 43.7696, 11.2558, 'IT'),
    marker('japan', 'tokyo', 1, 35.6762, 139.6503, 'JP'),
    marker('japan', 'kyoto', 2, 35.0116, 135.7681, 'JP'),
  ],
}

const italyTrip: Trip = {
  id: 'italy',
  name: 'Italy',
  startDate: null,
  endDate: null,
  description: null,
  stops: [
    stop('rome', 1, 41.9028, 12.4964, 'IT'),
    stop('florence', 2, 43.7696, 11.2558, 'IT'),
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
    cityId: `city-${stopId}`,
    position,
    cityName: stopId,
    latitude,
    longitude,
    country: { code: countryCode, name: countryCode },
  }
}

function stop(id: string, position: number, latitude: number, longitude: number, countryCode: string) {
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
      country: { code: countryCode, name: countryCode },
    },
  }
}
