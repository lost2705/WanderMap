// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trip, TripMapOverview } from '../../types/travel'
import { COUNTRY_HIGHLIGHT_LAYER_ID, COUNTRY_HIGHLIGHT_SOURCE_ID } from './countryHighlightLayers'
import { countryFeatureFilter, tripVisualIdentity } from './mapData'
import { ROUTE_LINE_LAYER_ID, ROUTE_SOURCE_ID } from './routeLayers'

const mapLifecycle = vi.hoisted(() => ({
  construct: vi.fn(),
  remove: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  setFilter: vi.fn(),
  setPaintProperty: vi.fn(),
  sourceSetData: vi.fn(),
  markerAdd: vi.fn(),
  markerRemove: vi.fn(),
  markerCreate: vi.fn(),
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  jumpTo: vi.fn(),
}))

vi.mock('maplibre-gl', () => {
  class MockMap {
    private readonly canvas: HTMLCanvasElement
    private readonly sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
    private readonly layers = new Map<string, unknown>()

    constructor(options: { container: HTMLElement }) {
      mapLifecycle.construct()
      this.canvas = document.createElement('canvas')
      this.canvas.className = 'maplibregl-canvas'
      options.container.append(this.canvas)
    }

    addControl() {}
    isStyleLoaded() { return true }
    off() {}
    on() {}
    once() {}
    cameraForBounds() { return { center: [0, 18], zoom: 1 } }
    setMinZoom() {}
    jumpTo(options: unknown) { mapLifecycle.jumpTo(options) }
    flyTo(options: unknown) { mapLifecycle.flyTo(options) }
    fitBounds(bounds: unknown, options: unknown) { mapLifecycle.fitBounds(bounds, options) }
    project() { return { x: 0, y: 0 } }
    getStyle() {
      return {
        layers: [
          { id: 'base-water', type: 'fill', 'source-layer': 'water' },
          { id: 'base-roads', type: 'line', 'source-layer': 'transportation' },
          { id: 'base-boundaries', type: 'line', 'source-layer': 'boundary' },
          { id: 'base-labels', type: 'symbol', 'source-layer': 'place' },
        ],
      }
    }
    getSource(id: string) { return this.sources.get(id) }
    addSource(id: string, specification: unknown) {
      this.sources.set(id, { setData: vi.fn((data: unknown) => mapLifecycle.sourceSetData(id, data)) })
      mapLifecycle.addSource(id, specification)
    }
    removeSource(id: string) { this.sources.delete(id) }
    getLayer(id: string) { return this.layers.get(id) }
    addLayer(specification: { id: string }, beforeId?: string) {
      this.layers.set(specification.id, specification)
      mapLifecycle.addLayer(specification, beforeId)
    }
    removeLayer(id: string) { this.layers.delete(id) }
    setFilter(id: string, filter: unknown) { mapLifecycle.setFilter(id, filter) }
    setPaintProperty(id: string, property: string, value: unknown) {
      mapLifecycle.setPaintProperty(id, property, value)
    }
    remove() {
      this.canvas.remove()
      mapLifecycle.remove()
    }
  }

  class MockMarker {
    constructor(options: { element: HTMLElement }) { mapLifecycle.markerCreate(options.element) }
    setLngLat() { return this }
    setPopup() { return this }
    addTo() { mapLifecycle.markerAdd(); return this }
    setOffset() { return this }
    remove() { mapLifecycle.markerRemove() }
  }

  return {
    Map: MockMap,
    LngLatBounds: class { extend() { return this } },
    Marker: MockMarker,
    NavigationControl: class {},
    Popup: class { setDOMContent() { return this } },
  }
})

import { MapView } from './MapView'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(countryBoundaries()),
  }))
  vi.stubGlobal('getComputedStyle', vi.fn(() => ({
    getPropertyValue: (property: string) => {
      const midnight = document.documentElement.dataset.theme === 'midnight'
      if (property === '--color-map-route') {
        return midnight ? '#f09a68' : '#bd5426'
      }
      if (property === '--color-map-country-fill') {
        return midnight ? '#e18a62' : '#df8a5f'
      }
      return ''
    },
  })))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

describe('MapView country highlight lifecycle', () => {
  it('updates overview, selected-trip, deselected, and theme state without recreating the map or geometry', async () => {
    const onSelectPlace = vi.fn()
    const overview = mapOverview()
    const view = render(
      <MapView overview={overview} selectedTrip={null} trips={[]} onSelectPlace={onSelectPlace} />,
    )
    const canvas = view.container.querySelector('.maplibregl-canvas')

    await waitFor(() => {
      expect(countrySourceCalls()).toHaveLength(1)
      expect(countryLayerCalls()).toHaveLength(1)
    })
    expect(countryLayerCalls()[0]?.[0]).toEqual(expect.objectContaining({
      filter: countryFeatureFilter([]),
    }))
    expect(countryLayerCalls()[0]?.[1]).toBe('base-roads')
    expect(view.container.querySelector('.country-overlay')).toBeNull()
    expect(markerElements()[0]?.style.getPropertyValue('--trip-color'))
      .toBe(tripVisualIdentity('italy').color)

    view.rerender(
      <MapView overview={overview} selectedTrip={tripWithCountries('italy', 'IT')} trips={[]} onSelectPlace={onSelectPlace} />,
    )
    await waitFor(() => {
      expect(mapLifecycle.setFilter).toHaveBeenCalledWith(
        COUNTRY_HIGHLIGHT_LAYER_ID,
        countryFeatureFilter(['IT']),
      )
    })
    expect(markerElements().at(-1)?.classList.contains('is-itinerary')).toBe(true)
    expect(markerElements().at(-1)?.style.getPropertyValue('--trip-color')).toBe('')

    view.rerender(
      <MapView
        overview={overview}
        selectedTrip={tripWithCountries('italy', 'JP', 'US', 'JP')}
        trips={[]}
        onSelectPlace={onSelectPlace}
      />,
    )
    await waitFor(() => {
      expect(mapLifecycle.setFilter).toHaveBeenCalledWith(
        COUNTRY_HIGHLIGHT_LAYER_ID,
        countryFeatureFilter(['JP', 'US']),
      )
    })

    document.documentElement.dataset.theme = 'midnight'
    await waitFor(() => {
      expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith(
        COUNTRY_HIGHLIGHT_LAYER_ID,
        'fill-color',
        '#e18a62',
      )
    })

    view.rerender(
      <MapView overview={overview} selectedTrip={null} trips={[]} onSelectPlace={onSelectPlace} />,
    )
    await waitFor(() => {
      expect(mapLifecycle.setFilter).toHaveBeenCalledWith(
        COUNTRY_HIGHLIGHT_LAYER_ID,
        countryFeatureFilter([]),
      )
      expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith(
        ROUTE_LINE_LAYER_ID,
        'line-color',
        ['get', 'identityColor'],
      )
    })

    expect(mapLifecycle.construct).toHaveBeenCalledTimes(1)
    expect(countrySourceCalls()).toHaveLength(1)
    expect(countryLayerCalls()).toHaveLength(1)
    expect(mapLifecycle.markerAdd).toHaveBeenCalledTimes(3)
    expect(view.container.querySelectorAll('.maplibregl-canvas')).toHaveLength(1)
    expect(view.container.querySelector('.maplibregl-canvas')).toBe(canvas)
  })

  it('uses semantic theme colors for selected route and markers without changing map data or lifecycle', async () => {
    const onSelectPlace = vi.fn()
    const overview = selectedRouteOverview()
    const selectedTrip = selectedRouteTrip()
    const view = render(
      <MapView overview={overview} selectedTrip={selectedTrip} trips={[]} onSelectPlace={onSelectPlace} />,
    )

    await waitFor(() => {
      expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith(
        ROUTE_LINE_LAYER_ID,
        'line-color',
        '#bd5426',
      )
      expect(routeSourceDataCalls()).toHaveLength(1)
      expect(markerElements()).toHaveLength(2)
    })

    const initialRouteData = routeSourceDataCalls()[0]?.[1]
    const initialGeometry = JSON.stringify(initialRouteData.features[0].geometry)
    expect(markerElements().every((element) => element.classList.contains('is-itinerary'))).toBe(true)
    expect(markerElements().every((element) => element.style.getPropertyValue('--trip-color') === '')).toBe(true)
    expect(mapLifecycle.fitBounds).toHaveBeenCalledTimes(1)

    document.documentElement.dataset.theme = 'midnight'
    view.rerender(
      <MapView overview={overview} selectedTrip={selectedTrip} trips={[]} onSelectPlace={onSelectPlace} />,
    )

    await waitFor(() => {
      expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith(
        ROUTE_LINE_LAYER_ID,
        'line-color',
        '#f09a68',
      )
      expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith(
        COUNTRY_HIGHLIGHT_LAYER_ID,
        'fill-color',
        '#e18a62',
      )
    })

    expect(mapLifecycle.construct).toHaveBeenCalledTimes(1)
    expect(countrySourceCalls()).toHaveLength(1)
    expect(routeSourceDataCalls()).toHaveLength(1)
    expect(JSON.stringify(routeSourceDataCalls()[0]?.[1].features[0].geometry)).toBe(initialGeometry)
    expect(mapLifecycle.markerCreate).toHaveBeenCalledTimes(2)
    expect(mapLifecycle.markerAdd).toHaveBeenCalledTimes(2)
    expect(mapLifecycle.markerRemove).not.toHaveBeenCalled()
    expect(mapLifecycle.fitBounds).toHaveBeenCalledTimes(1)
  })

  it('keeps MapLibre usable when the external country dataset fails to load', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))

    const view = render(
      <MapView overview={null} selectedTrip={tripWithCountries('italy', 'IT')} trips={[]} onSelectPlace={vi.fn()} />,
    )

    await waitFor(() => expect(warning).toHaveBeenCalled())
    expect(mapLifecycle.construct).toHaveBeenCalledTimes(1)
    expect(view.container.querySelectorAll('.maplibregl-canvas')).toHaveLength(1)
    expect(countrySourceCalls()).toHaveLength(0)
    expect(countryLayerCalls()).toHaveLength(0)
  })
})

function countrySourceCalls() {
  return mapLifecycle.addSource.mock.calls
    .filter(([id]) => id === COUNTRY_HIGHLIGHT_SOURCE_ID)
}

function countryLayerCalls() {
  return mapLifecycle.addLayer.mock.calls
    .filter(([specification]) => specification.id === COUNTRY_HIGHLIGHT_LAYER_ID)
}

function routeSourceDataCalls() {
  return mapLifecycle.sourceSetData.mock.calls
    .filter(([id]) => id === ROUTE_SOURCE_ID)
}

function markerElements(): HTMLElement[] {
  return mapLifecycle.markerCreate.mock.calls.map(([element]) => element)
}

function countryBoundaries() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { ISO_A2_EH: 'IT' },
      geometry: {
        type: 'Polygon',
        coordinates: [[[12, 42], [13, 42], [12, 43], [12, 42]]],
      },
    }],
  }
}

function tripWithCountries(id: string, ...countryCodes: string[]): Trip {
  return {
    id,
    name: id,
    startDate: null,
    endDate: null,
    description: null,
    stops: countryCodes.map((countryCode, index) => ({
      id: `${id}-${index}`,
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

function mapOverview(): TripMapOverview {
  return {
    visitedCountryCodes: ['IT'],
    memoryCount: 0,
    markers: [{
      tripId: 'italy',
      stopId: 'rome',
      cityId: 'city-rome',
      position: 1,
      cityName: 'Rome',
      latitude: 41.9028,
      longitude: 12.4964,
      country: { code: 'IT', name: 'Italy' },
    }],
  }
}

function selectedRouteTrip(): Trip {
  return {
    id: 'japan',
    name: 'Japan',
    startDate: null,
    endDate: null,
    description: null,
    stops: [
      locatedStop('tokyo', 1, 35.6762, 139.6503),
      locatedStop('kyoto', 2, 35.0116, 135.7681),
    ],
  }
}

function selectedRouteOverview(): TripMapOverview {
  return {
    visitedCountryCodes: ['JP'],
    memoryCount: 0,
    markers: [
      locatedMarker('tokyo', 1, 35.6762, 139.6503),
      locatedMarker('kyoto', 2, 35.0116, 135.7681),
    ],
  }
}

function locatedStop(id: string, position: number, latitude: number, longitude: number) {
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

function locatedMarker(id: string, position: number, latitude: number, longitude: number) {
  return {
    tripId: 'japan',
    stopId: id,
    cityId: `city-${id}`,
    position,
    cityName: id,
    latitude,
    longitude,
    country: { code: 'JP', name: 'Japan' },
  }
}
