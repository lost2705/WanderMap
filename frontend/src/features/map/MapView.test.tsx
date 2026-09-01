// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BucketListItem, Trip, TripMapOverview } from '../../types/travel'
import {
  BUCKET_LIST_RING_LAYER_ID,
  BUCKET_LIST_SOURCE_ID,
} from './bucketListLayers'
import {
  COUNTRY_HIGHLIGHT_LAYER_ID,
  COUNTRY_HIGHLIGHT_SOURCE_ID,
  JOURNEY_COUNTRY_HIGHLIGHT_OPACITY,
  WORLD_COUNTRY_HIGHLIGHT_OPACITY,
} from './countryHighlightLayers'
import { countryFeatureFilter } from './mapData'
import { worldOverviewCamera } from './mapCamera'
import { ROUTE_LINE_LAYER_ID, ROUTE_SOURCE_ID } from './routeLayers'
import {
  WORLD_PLACE_AREA_CORE_LAYER_ID,
  WORLD_PLACE_AREA_LAYER_IDS,
  WORLD_PLACE_SOURCE_ID,
} from './worldPlaceLayers'

const mapLifecycle = vi.hoisted(() => ({
  construct: vi.fn(),
  dragRotateDisable: vi.fn(),
  touchRotationDisable: vi.fn(),
  touchPitchDisable: vi.fn(),
  keyboardRotationDisable: vi.fn(),
  remove: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  setFilter: vi.fn(),
  setPaintProperty: vi.fn(),
  setLayoutProperty: vi.fn(),
  sourceSetData: vi.fn(),
  clusterExpansionZoom: vi.fn().mockResolvedValue(7),
  easeTo: vi.fn(),
  markerAdd: vi.fn(),
  markerRemove: vi.fn(),
  markerCreate: vi.fn(),
  fitBounds: vi.fn(),
  flyTo: vi.fn(),
  jumpTo: vi.fn(),
  setMinZoom: vi.fn(),
  events: new Map<string, Set<(event: unknown) => void>>(),
  listeners: new Map<string, (event: unknown) => void>(),
}))

vi.mock('maplibre-gl', () => {
  const baseStyleLayers = [
    { id: 'base-background', type: 'background' },
    { id: 'base-relief', type: 'raster', source: 'ne2_shaded' },
    { id: 'base-water', type: 'fill', 'source-layer': 'water' },
    { id: 'base-roads', type: 'line', 'source-layer': 'transportation' },
    { id: 'base-boundaries', type: 'line', 'source-layer': 'boundary' },
    {
      id: 'base-country-labels',
      type: 'symbol',
      'source-layer': 'place',
      filter: ['==', 'class', 'country'],
    },
    {
      id: 'base-city-labels',
      type: 'symbol',
      'source-layer': 'place',
      filter: ['==', 'class', 'city'],
    },
    { id: 'base-pois', type: 'symbol', 'source-layer': 'poi' },
  ]

  class MockMap {
    private readonly canvas: HTMLCanvasElement
    private readonly sources = new Map<string, {
      setData: ReturnType<typeof vi.fn>
      getClusterExpansionZoom: ReturnType<typeof vi.fn>
    }>()
    private readonly layers = new Map<string, unknown>()

    readonly dragRotate = { disable: mapLifecycle.dragRotateDisable }
    readonly touchZoomRotate = { disableRotation: mapLifecycle.touchRotationDisable }
    readonly touchPitch = { disable: mapLifecycle.touchPitchDisable }
    readonly keyboard = { disableRotation: mapLifecycle.keyboardRotationDisable }

    constructor(options: { container: HTMLElement }) {
      mapLifecycle.construct(options)
      this.canvas = document.createElement('canvas')
      this.canvas.className = 'maplibregl-canvas'
      options.container.append(this.canvas)
    }

    addControl() {}
    isStyleLoaded() { return true }
    off(type: string, layerOrListener: string | string[] | ((event: unknown) => void)) {
      if (typeof layerOrListener === 'function') {
        mapLifecycle.events.get(type)?.delete(layerOrListener)
      }
      if (typeof layerOrListener !== 'function') {
        mapLifecycle.listeners.delete(`${type}:${Array.isArray(layerOrListener) ? layerOrListener.join(',') : layerOrListener}`)
      }
    }
    on(type: string, layerOrListener: string | string[] | ((event: unknown) => void), listener?: (event: unknown) => void) {
      if (typeof layerOrListener === 'function') {
        const listeners = mapLifecycle.events.get(type) ?? new Set()
        listeners.add(layerOrListener)
        mapLifecycle.events.set(type, listeners)
      }
      if (typeof layerOrListener !== 'function' && listener) {
        mapLifecycle.listeners.set(
          `${type}:${Array.isArray(layerOrListener) ? layerOrListener.join(',') : layerOrListener}`,
          listener,
        )
      }
    }
    once() {}
    getContainer() { return { clientWidth: 1072, clientHeight: 900 } }
    setMinZoom(zoom: number) { mapLifecycle.setMinZoom(zoom) }
    jumpTo(options: unknown) { mapLifecycle.jumpTo(options) }
    flyTo(options: unknown) { mapLifecycle.flyTo(options) }
    fitBounds(bounds: unknown, options: unknown) { mapLifecycle.fitBounds(bounds, options) }
    easeTo(options: unknown) { mapLifecycle.easeTo(options) }
    project() { return { x: 0, y: 0 } }
    getCanvas() { return this.canvas }
    getStyle() {
      return {
        layers: [...baseStyleLayers, ...this.layers.values()],
      }
    }
    getSource(id: string) { return this.sources.get(id) }
    addSource(id: string, specification: unknown) {
      this.sources.set(id, {
        setData: vi.fn((data: unknown) => mapLifecycle.sourceSetData(id, data)),
        getClusterExpansionZoom: mapLifecycle.clusterExpansionZoom,
      })
      mapLifecycle.addSource(id, specification)
    }
    removeSource(id: string) { this.sources.delete(id) }
    getLayer(id: string) { return this.layers.get(id) ?? baseStyleLayers.find((layer) => layer.id === id) }
    addLayer(specification: { id: string }, beforeId?: string) {
      this.layers.set(specification.id, specification)
      mapLifecycle.addLayer(specification, beforeId)
    }
    removeLayer(id: string) { this.layers.delete(id) }
    setFilter(id: string, filter: unknown) { mapLifecycle.setFilter(id, filter) }
    setPaintProperty(id: string, property: string, value: unknown) {
      mapLifecycle.setPaintProperty(id, property, value)
    }
    setLayoutProperty(id: string, property: string, value: unknown) {
      mapLifecycle.setLayoutProperty(id, property, value)
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
    LngLat: class { constructor(public lng: number, public lat: number) {} },
    LngLatBounds: class { extend() { return this } },
    Marker: MockMarker,
    NavigationControl: class {},
    Popup: class {
      setDOMContent() { return this }
      setLngLat() { return this }
      addTo() { return this }
      remove() { return this }
    },
  }
})

import { MapView } from './MapView'

beforeEach(() => {
  mapLifecycle.listeners.clear()
  mapLifecycle.events.clear()
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
      if (property === '--color-map-marker') {
        return midnight ? '#f09a68' : '#bd5426'
      }
      if (property === '--color-map-visited-area') {
        return midnight ? '#f09a68' : '#d97745'
      }
      if (property === '--color-map-visited-area-core') {
        return midnight ? '#ffc09c' : '#b94f24'
      }
      if (property === '--color-map-bucket-ring') {
        return midnight ? '#f0c67d' : '#557765'
      }
      if (property === '--color-map-bucket-halo') {
        return midnight ? '#9a7447' : '#d8c39a'
      }
      if (property === '--color-map-bucket-fill') {
        return midnight ? '#20333e' : '#fffdf8'
      }
      if (property === '--color-map-marker-border' || property === '--color-surface-raised') {
        return midnight ? '#f3ede2' : '#fffdf8'
      }
      if (property === '--color-map-cluster-text') {
        return midnight ? '#101a24' : '#fff'
      }
      if (property === '--color-text-primary') {
        return midnight ? '#f3ede2' : '#18303b'
      }
      const basemapTokens: Record<string, [string, string]> = {
        '--color-map-basemap-land': ['#eee9dd', '#1b2932'],
        '--color-map-basemap-water': ['#c7d9db', '#162b36'],
        '--color-map-basemap-terrain': ['#dde2d5', '#233630'],
        '--color-map-basemap-label': ['#304955', '#d6dedd'],
        '--color-map-basemap-label-muted': ['#65767b', '#96a7a9'],
        '--color-map-basemap-label-halo': ['#f6f1e7', '#17232d'],
        '--color-map-basemap-boundary': ['#899597', '#5c6b72'],
        '--color-map-basemap-road': ['#c8b8a5', '#46535a'],
        '--opacity-map-basemap-relief': ['0.28', '0.08'],
      }
      if (property in basemapTokens) {
        return basemapTokens[property]?.[midnight ? 1 : 0] ?? ''
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
  it('resets to the atlas only on World entry or an explicit reset, not theme/routes/data/resize', async () => {
    const props = { overview: selectedRouteOverview(), trips: [], onSelectPlace: vi.fn() }
    const view = render(<MapView {...props} selectedTrip={null} />)
    await waitFor(() => expect(mapLifecycle.jumpTo).toHaveBeenCalledTimes(1))
    expect(mapLifecycle.jumpTo).toHaveBeenLastCalledWith(worldOverviewCamera(1072, 900))
    expect(mapLifecycle.setMinZoom).toHaveBeenLastCalledWith(worldOverviewCamera(1072, 900)?.zoom)
    expect(screen.queryByRole('heading', { name: 'See where your stories take you.' })).toBeNull()
    expect(screen.queryByText('A visual travel journal')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show routes' }))
    document.documentElement.dataset.theme = 'midnight'
    await waitFor(() => expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith('base-water', 'fill-color', '#162b36'))
    view.rerender(<MapView {...props} overview={{ ...props.overview }} selectedTrip={null} />)
    mapLifecycle.events.get('resize')?.forEach((listener) => listener({}))
    expect(mapLifecycle.jumpTo).toHaveBeenCalledTimes(1)

    view.rerender(<MapView {...props} selectedTrip={selectedRouteTrip()} />)
    expect(screen.getByText('Journey map')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Japan' })).toBeTruthy()
    expect(mapLifecycle.setMinZoom).toHaveBeenLastCalledWith(worldOverviewCamera(1072, 900)?.zoom)
    expect(mapLifecycle.fitBounds).toHaveBeenLastCalledWith(expect.anything(), {
      padding: 90, maxZoom: 6, duration: 700, bearing: 0, pitch: 0,
    })
    view.rerender(<MapView {...props} selectedTrip={null} />)
    expect(mapLifecycle.jumpTo).toHaveBeenCalledTimes(2)
    expect(mapLifecycle.jumpTo).toHaveBeenLastCalledWith(worldOverviewCamera(1072, 900))
    view.rerender(<MapView {...props} selectedTrip={null} worldResetKey={1} />)
    expect(mapLifecycle.jumpTo).toHaveBeenCalledTimes(3)
    expect(mapLifecycle.construct).toHaveBeenCalledTimes(1)
    expect(worldPlaceSourceCalls()).toHaveLength(1)
    expect(view.container.querySelectorAll('.maplibregl-canvas')).toHaveLength(1)
    view.unmount()
    expect(mapLifecycle.events.get('resize')?.size).toBe(0)
  })

  it('configures one north-up 2D map while preserving pan, wheel zoom, keyboard navigation, and pinch zoom', async () => {
    const view = render(
      <MapView overview={mapOverview()} selectedTrip={null} trips={[]} onSelectPlace={vi.fn()} />,
    )

    await waitFor(() => expect(worldPlaceSourceCalls()).toHaveLength(1))
    const options = mapLifecycle.construct.mock.calls[0]?.[0]
    expect(options).toMatchObject({
      bearing: 0,
      pitch: 0,
      minPitch: 0,
      maxPitch: 0,
      dragPan: true,
      dragRotate: false,
      scrollZoom: true,
      keyboard: true,
      touchZoomRotate: true,
      touchPitch: false,
      pitchWithRotate: false,
      renderWorldCopies: false,
    })
    expect(options.transformCameraUpdate({ center: { lng: 135, lat: 35 }, zoom: 6 })).toEqual({ bearing: 0, pitch: 0 })
    expect(mapLifecycle.dragRotateDisable).toHaveBeenCalledOnce()
    expect(mapLifecycle.touchRotationDisable).toHaveBeenCalledOnce()
    expect(mapLifecycle.touchPitchDisable).toHaveBeenCalledOnce()
    expect(mapLifecycle.keyboardRotationDisable).toHaveBeenCalledOnce()
    expect(mapLifecycle.jumpTo).toHaveBeenCalledWith(expect.objectContaining({ bearing: 0, pitch: 0 }))
    expect(view.container.querySelectorAll('.maplibregl-canvas')).toHaveLength(1)
  })

  it('constrains the actual camera-update path after manual Journey zoom-out without resetting on resize', async () => {
    render(<MapView overview={selectedRouteOverview()} selectedTrip={selectedRouteTrip()} trips={[]} onSelectPlace={vi.fn()} />)
    await waitFor(() => expect(mapLifecycle.fitBounds).toHaveBeenCalledTimes(1))
    const updateCamera = mapLifecycle.construct.mock.calls[0]?.[0].transformCameraUpdate
    mapLifecycle.events.get('resize')?.forEach((listener) => listener({}))
    const overview = worldOverviewCamera(1072, 900)!
    const result = updateCamera({ center: { lng: -6, lat: -32.0945 }, zoom: overview.zoom })
    expect(result.center.lng).toBeCloseTo(6)
    expect(result.center.lat).toBeCloseTo(18)
    expect(result).toMatchObject({ zoom: overview.zoom, bearing: 0, pitch: 0 })
    expect(updateCamera({ center: { lng: 135.634799, lat: 34.852819 }, zoom: 6 }))
      .toEqual({ bearing: 0, pitch: 0 })
    expect(mapLifecycle.setMinZoom).toHaveBeenLastCalledWith(overview.zoom)
    expect(mapLifecycle.jumpTo).not.toHaveBeenCalled()
    expect(mapLifecycle.fitBounds).toHaveBeenCalledTimes(1)
    expect(mapLifecycle.construct).toHaveBeenCalledTimes(1)
  })

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
      filter: countryFeatureFilter(['IT']),
    }))
    expect(countryLayerCalls()[0]?.[1]).toBe('base-roads')
    expect(view.container.querySelector('.country-overlay')).toBeNull()
    expect(markerElements()).toHaveLength(0)
    expect(worldPlaceSourceCalls()).toHaveLength(1)
    expect(worldPlaceSourceCalls()[0]?.[1]).toMatchObject({ cluster: true })
    expect(worldPlaceSourceDataCalls().at(-1)?.[1].features).toHaveLength(1)
    expect(countryLayerCalls()[0]?.[0]).toMatchObject({
      paint: { 'fill-opacity': WORLD_COUNTRY_HIGHLIGHT_OPACITY },
    })

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
    expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith(
      COUNTRY_HIGHLIGHT_LAYER_ID,
      'fill-opacity',
      JOURNEY_COUNTRY_HIGHLIGHT_OPACITY,
    )
    expect(mapLifecycle.setLayoutProperty).toHaveBeenCalledWith(
      WORLD_PLACE_AREA_CORE_LAYER_ID,
      'visibility',
      'none',
    )

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
      expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith(
        WORLD_PLACE_AREA_CORE_LAYER_ID,
        'circle-color',
        '#ffc09c',
      )
      expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith(
        'base-background',
        'background-color',
        '#1b2932',
      )
    })

    view.rerender(
      <MapView overview={overview} selectedTrip={null} trips={[]} onSelectPlace={onSelectPlace} />,
    )
    await waitFor(() => {
      expect(mapLifecycle.setFilter).toHaveBeenCalledWith(
        COUNTRY_HIGHLIGHT_LAYER_ID,
        countryFeatureFilter(['IT']),
      )
      expect(mapLifecycle.setPaintProperty).toHaveBeenCalledWith(
        ROUTE_LINE_LAYER_ID,
        'line-color',
        ['get', 'identityColor'],
      )
    })

    expect(mapLifecycle.construct).toHaveBeenCalledTimes(1)
    expect(countrySourceCalls()).toHaveLength(1)
    expect(worldPlaceSourceCalls()).toHaveLength(1)
    expect(countryLayerCalls()).toHaveLength(1)
    expect(worldPlaceSourceCalls()).toHaveLength(1)
    expect(mapLifecycle.markerAdd).toHaveBeenCalledTimes(1)
    expect(mapLifecycle.setLayoutProperty).toHaveBeenCalledWith(
      WORLD_PLACE_AREA_CORE_LAYER_ID,
      'visibility',
      'visible',
    )
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
    expect(mapLifecycle.fitBounds).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bearing: 0, pitch: 0 }),
    )

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

  it('preserves flat orientation for a single-stop Journey camera flight', async () => {
    render(
      <MapView
        overview={selectedRouteOverview()}
        selectedTrip={singleStopTrip()}
        trips={[]}
        onSelectPlace={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(mapLifecycle.flyTo).toHaveBeenCalledWith(expect.objectContaining({
        center: [139.6503, 35.6762],
        bearing: 0,
        pitch: 0,
      }))
    })
  })

  it('keeps World routes off by default and toggles them without affecting selected-Journey routes', async () => {
    const overview = selectedRouteOverview()
    const selectedTrip = selectedRouteTrip()
    const view = render(
      <MapView overview={overview} selectedTrip={null} trips={[]} onSelectPlace={vi.fn()} />,
    )

    const toggle = await screen.findByRole('button', { name: 'Show routes' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.tabIndex).toBe(0)
    toggle.focus()
    expect(document.activeElement).toBe(toggle)
    await waitFor(() => expect(routeSourceDataCalls().at(-1)?.[1].features).toHaveLength(0))

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('status').textContent).toBe('Routes shown. Zoom in to trace nearby stops.')
    await waitFor(() => {
      expect(routeSourceDataCalls().at(-1)?.[1].features[0]?.properties).toMatchObject({
        tripId: 'japan',
        isSelectedTrip: false,
      })
    })

    view.rerender(
      <MapView overview={overview} selectedTrip={selectedTrip} trips={[]} onSelectPlace={vi.fn()} />,
    )
    expect(screen.queryByRole('button', { name: 'Show routes' })).toBeNull()
    await waitFor(() => {
      expect(routeSourceDataCalls().at(-1)?.[1].features[0]?.properties).toMatchObject({
        tripId: 'japan',
        isSelectedTrip: true,
      })
    })

    view.rerender(
      <MapView overview={overview} selectedTrip={null} trips={[]} onSelectPlace={vi.fn()} />,
    )
    const restoredToggle = screen.getByRole('button', { name: 'Show routes' })
    expect(restoredToggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(restoredToggle)
    expect(restoredToggle.getAttribute('aria-pressed')).toBe('false')
    await waitFor(() => expect(routeSourceDataCalls().at(-1)?.[1].features).toHaveLength(0))

    view.rerender(
      <MapView overview={overview} selectedTrip={selectedTrip} trips={[]} onSelectPlace={vi.fn()} />,
    )
    await waitFor(() => expect(routeSourceDataCalls().at(-1)?.[1].features[0]?.properties.isSelectedTrip).toBe(true))
    expect(markerElements().slice(-2).map((element) => element.textContent)).toEqual(['1', '2'])

    view.rerender(
      <MapView overview={overview} selectedTrip={null} trips={[]} onSelectPlace={vi.fn()} />,
    )
    await waitFor(() => expect(routeSourceDataCalls().at(-1)?.[1].features).toHaveLength(0))
    expect(screen.getByRole('button', { name: 'Show routes' }).getAttribute('aria-pressed')).toBe('false')

    expect(mapLifecycle.construct).toHaveBeenCalledTimes(1)
    expect(worldPlaceSourceCalls()).toHaveLength(1)
    expect(view.container.querySelectorAll('.maplibregl-canvas')).toHaveLength(1)
  })

  it('opens the existing Place Details callback from an individual World city', async () => {
    const onSelectPlace = vi.fn()
    render(<MapView overview={mapOverview()} selectedTrip={null} trips={[]} onSelectPlace={onSelectPlace} />)
    await waitFor(() => expect(worldPlaceSourceCalls()).toHaveLength(1))

    emitMapLayerEvent('click', [...WORLD_PLACE_AREA_LAYER_IDS], {
      features: [{
        type: 'Feature',
        properties: { cityId: 'city-rome', cityName: 'Rome', countryName: 'Italy' },
        geometry: { type: 'Point', coordinates: [12.4964, 41.9028] },
      }],
    })

    expect(onSelectPlace).toHaveBeenCalledWith('city-rome')
  })

  it('keeps bucket places in a separate native source across data, Journey, theme, and click transitions', async () => {
    const onSelectPlace = vi.fn()
    const initialItems = [bucketItem(false)]
    const view = render(
      <MapView
        bucketListItems={initialItems}
        overview={mapOverview()}
        selectedTrip={null}
        trips={[]}
        onSelectPlace={onSelectPlace}
      />,
    )

    await waitFor(() => expect(bucketListSourceCalls()).toHaveLength(1))
    expect(bucketListSourceCalls()[0]?.[1]).not.toHaveProperty('cluster')
    expect(bucketListSourceDataCalls().at(-1)?.[1].features[0]).toMatchObject({
      properties: { itemId: 'bucket-kyoto', cityId: 'city-kyoto', visited: false },
      geometry: { coordinates: [135.7681, 35.0116] },
    })

    view.rerender(
      <MapView
        bucketListItems={[bucketItem(true)]}
        overview={mapOverview()}
        selectedTrip={null}
        trips={[]}
        onSelectPlace={onSelectPlace}
      />,
    )
    await waitFor(() => expect(bucketListSourceDataCalls().at(-1)?.[1].features[0]?.properties.visited).toBe(true))
    expect(bucketListSourceCalls()).toHaveLength(1)

    view.rerender(
      <MapView
        bucketListItems={[bucketItem(true)]}
        overview={mapOverview()}
        selectedTrip={tripWithCountries('italy', 'IT')}
        trips={[]}
        onSelectPlace={onSelectPlace}
      />,
    )
    expect(mapLifecycle.setLayoutProperty).toHaveBeenCalledWith(BUCKET_LIST_RING_LAYER_ID, 'visibility', 'none')

    document.documentElement.dataset.theme = 'midnight'
    await waitFor(() => expect(mapLifecycle.setPaintProperty)
      .toHaveBeenCalledWith(BUCKET_LIST_RING_LAYER_ID, 'circle-stroke-color', '#f0c67d'))

    view.rerender(
      <MapView
        bucketListItems={[bucketItem(true)]}
        overview={mapOverview()}
        selectedTrip={null}
        trips={[]}
        onSelectPlace={onSelectPlace}
      />,
    )
    expect(mapLifecycle.setLayoutProperty).toHaveBeenCalledWith(BUCKET_LIST_RING_LAYER_ID, 'visibility', 'visible')
    emitMapLayerEvent('click', BUCKET_LIST_RING_LAYER_ID, {
      features: [{
        type: 'Feature',
        properties: { cityId: 'city-kyoto', cityName: 'Kyoto', countryName: 'Japan', visited: true },
        geometry: { type: 'Point', coordinates: [135.7681, 35.0116] },
      }],
    })
    expect(onSelectPlace).toHaveBeenCalledWith('city-kyoto')
    expect(mapLifecycle.construct).toHaveBeenCalledTimes(1)
    expect(worldPlaceSourceCalls()).toHaveLength(1)
    expect(bucketListSourceCalls()).toHaveLength(1)
    expect(view.container.querySelectorAll('.maplibregl-canvas')).toHaveLength(1)
  })

  it('keeps an empty clustered source and omits irrelevant controls when there are no visited cities', async () => {
    const view = render(<MapView overview={null} selectedTrip={null} trips={[]} onSelectPlace={vi.fn()} />)

    await waitFor(() => expect(worldPlaceSourceDataCalls().at(-1)?.[1].features).toEqual([]))
    expect(screen.queryByRole('button', { name: 'Show routes' })).toBeNull()
    expect(view.container.querySelector('.map-hint')).toBeNull()
    expect(markerElements()).toHaveLength(0)
    expect(view.container.querySelectorAll('.maplibregl-canvas')).toHaveLength(1)
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

  it('removes the single MapLibre instance and its canvas on unmount', async () => {
    const view = render(
      <MapView overview={mapOverview()} selectedTrip={null} trips={[]} onSelectPlace={vi.fn()} />,
    )

    await waitFor(() => expect(worldPlaceSourceCalls()).toHaveLength(1))
    expect(view.container.querySelectorAll('.maplibregl-canvas')).toHaveLength(1)

    view.unmount()

    expect(mapLifecycle.remove).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('.maplibregl-canvas')).toBeNull()
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

function worldPlaceSourceCalls() {
  return mapLifecycle.addSource.mock.calls
    .filter(([id]) => id === WORLD_PLACE_SOURCE_ID)
}

function bucketListSourceCalls() {
  return mapLifecycle.addSource.mock.calls
    .filter(([id]) => id === BUCKET_LIST_SOURCE_ID)
}

function bucketListSourceDataCalls() {
  return mapLifecycle.sourceSetData.mock.calls
    .filter(([id]) => id === BUCKET_LIST_SOURCE_ID)
}

function worldPlaceSourceDataCalls() {
  return mapLifecycle.sourceSetData.mock.calls
    .filter(([id]) => id === WORLD_PLACE_SOURCE_ID)
}

function routeSourceDataCalls() {
  return mapLifecycle.sourceSetData.mock.calls
    .filter(([id]) => id === ROUTE_SOURCE_ID)
}

function markerElements(): HTMLElement[] {
  return mapLifecycle.markerCreate.mock.calls.map(([element]) => element)
}

function emitMapLayerEvent(type: string, layerIds: string | string[], event: unknown): void {
  const key = `${type}:${Array.isArray(layerIds) ? layerIds.join(',') : layerIds}`
  mapLifecycle.listeners.get(key)?.(event)
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

function bucketItem(visited: boolean): BucketListItem {
  return {
    id: 'bucket-kyoto',
    city: {
      id: 'city-kyoto',
      name: 'Kyoto',
      latitude: 35.0116,
      longitude: 135.7681,
      country: { code: 'JP', name: 'Japan' },
    },
    createdAt: '2026-09-01T12:00:00Z',
    visited,
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

function singleStopTrip(): Trip {
  return {
    id: 'japan',
    name: 'Japan',
    startDate: null,
    endDate: null,
    description: null,
    stops: [locatedStop('tokyo', 1, 35.6762, 139.6503)],
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
