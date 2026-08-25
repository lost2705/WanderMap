// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trip, TripMapOverview } from '../../types/travel'
import { COUNTRY_HIGHLIGHT_LAYER_ID, COUNTRY_HIGHLIGHT_SOURCE_ID } from './countryHighlightLayers'
import { countryFeatureFilter } from './mapData'

const mapLifecycle = vi.hoisted(() => ({
  construct: vi.fn(),
  remove: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  setFilter: vi.fn(),
  setPaintProperty: vi.fn(),
  markerAdd: vi.fn(),
  markerRemove: vi.fn(),
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
    jumpTo() {}
    flyTo() {}
    fitBounds() {}
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
      this.sources.set(id, { setData: vi.fn() })
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
    getPropertyValue: () => document.documentElement.dataset.theme === 'midnight'
      ? '#e18a62'
      : '#df8a5f',
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

    view.rerender(
      <MapView overview={overview} selectedTrip={tripWithCountries('italy', 'IT')} trips={[]} onSelectPlace={onSelectPlace} />,
    )
    await waitFor(() => {
      expect(mapLifecycle.setFilter).toHaveBeenCalledWith(
        COUNTRY_HIGHLIGHT_LAYER_ID,
        countryFeatureFilter(['IT']),
      )
    })

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
    })

    expect(mapLifecycle.construct).toHaveBeenCalledTimes(1)
    expect(countrySourceCalls()).toHaveLength(1)
    expect(countryLayerCalls()).toHaveLength(1)
    expect(mapLifecycle.markerAdd).toHaveBeenCalledTimes(3)
    expect(view.container.querySelectorAll('.maplibregl-canvas')).toHaveLength(1)
    expect(view.container.querySelector('.maplibregl-canvas')).toBe(canvas)
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
