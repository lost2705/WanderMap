// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import type { TripMapOverview } from '../../types/travel'
import { worldPlaceFeatureCollection } from './mapData'
import { ensureTripRouteLayers, ROUTE_CASING_LAYER_ID, ROUTE_LINE_LAYER_ID } from './routeLayers'
import {
  WORLD_PLACE_AREA_CORE_LAYER_ID,
  WORLD_PLACE_AREA_LAYER_IDS,
  WORLD_PLACE_AREA_MIDDLE_LAYER_ID,
  WORLD_PLACE_AREA_OUTER_LAYER_ID,
  WORLD_PLACE_CLUSTER_COUNT_LAYER_ID,
  WORLD_PLACE_CLUSTER_LAYER_ID,
  WORLD_PLACE_CLUSTER_MAX_ZOOM,
  WORLD_PLACE_CLUSTER_RADIUS,
  WORLD_PLACE_SOURCE_ID,
  bindWorldPlaceInteractions,
  ensureWorldPlaceLayers,
  removeWorldPlaceLayers,
  updateWorldPlaceColors,
  updateWorldPlaceData,
  updateWorldPlaceVisibility,
} from './worldPlaceLayers'

const popupLifecycle = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  content: vi.fn(),
  coordinate: vi.fn(),
}))

vi.mock('maplibre-gl', () => ({
  Popup: class {
    setDOMContent(content: HTMLElement) { popupLifecycle.content(content); return this }
    setLngLat(coordinate: [number, number]) { popupLifecycle.coordinate(coordinate); return this }
    addTo() { popupLifecycle.add(); return this }
    remove() { popupLifecycle.remove(); return this }
  },
}))

const colors = {
  area: '#d97745',
  areaCore: '#b94f24',
  cluster: '#bd5426',
  clusterBorder: '#fffdf8',
  clusterText: '#fff',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('World place MapLibre layers', () => {
  it('uses one clustered GeoJSON feature per City so repeated visits do not create another area or cluster count', () => {
    const fixture = mapFixture()
    const data = worldPlaceFeatureCollection(overviewWithRepeatedCity())

    ensureWorldPlaceLayers(fixture.map, data, colors, true)

    expect(data.features).toHaveLength(2)
    expect(data.features.find((feature) => feature.properties.cityId === 'city-rome')?.properties.visitCount).toBe(2)
    expect(fixture.addSource).toHaveBeenCalledWith(WORLD_PLACE_SOURCE_ID, {
      type: 'geojson',
      data,
      cluster: true,
      clusterMaxZoom: WORLD_PLACE_CLUSTER_MAX_ZOOM,
      clusterRadius: WORLD_PLACE_CLUSTER_RADIUS,
    })
    expect(fixture.layer(WORLD_PLACE_CLUSTER_LAYER_ID)).toMatchObject({
      filter: ['has', 'point_count'],
    })
    expect(fixture.layer(WORLD_PLACE_CLUSTER_COUNT_LAYER_ID)).toMatchObject({
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
      },
    })
  })

  it('renders a progressive blurred footprint with GPU circle layers and no permanent city label or outline', () => {
    const fixture = mapFixture()
    ensureWorldPlaceLayers(fixture.map, worldPlaceFeatureCollection(overviewWithRepeatedCity()), colors, true)

    for (const layerId of WORLD_PLACE_AREA_LAYER_IDS) {
      expect(fixture.layer(layerId)).toMatchObject({
        type: 'circle',
        source: WORLD_PLACE_SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
      })
      expect(fixture.layer(layerId)?.paint).not.toHaveProperty('circle-stroke-width')
      expect(fixture.layer(layerId)?.paint).not.toHaveProperty('circle-stroke-color')
      const blur = fixture.layer(layerId)?.paint['circle-blur']
      expect(typeof blur === 'number' ? blur : zoomStops(blur)[0]?.[1]).toBeGreaterThan(0)
    }

    const outerLayer = fixture.layer(WORLD_PLACE_AREA_OUTER_LAYER_ID)
    expect(outerLayer).toMatchObject({ minzoom: 2.75 })
    expect(outerLayer?.paint['circle-color']).toBe(colors.area)
    expect(outerLayer?.paint['circle-radius'].slice(0, 3)).toEqual([
      'interpolate', ['exponential', 2], ['zoom'],
    ])
    expect(fixture.layer(WORLD_PLACE_AREA_MIDDLE_LAYER_ID)?.paint).toMatchObject({
      'circle-color': colors.area,
    })
    expect(fixture.layer(WORLD_PLACE_AREA_CORE_LAYER_ID)?.paint).toMatchObject({
      'circle-color': colors.areaCore,
    })
    expect(fixture.addLayer.mock.calls
      .filter(([layer]) => layer.type === 'symbol' && layer.id !== WORLD_PLACE_CLUSTER_COUNT_LAYER_ID))
      .toEqual([])
  })

  it('keeps clusters solid and readable at world zoom and gives isolated places a visible core through expansion', () => {
    const fixture = mapFixture()
    ensureWorldPlaceLayers(fixture.map, worldPlaceFeatureCollection(overviewWithRepeatedCity()), colors, true)

    const cluster = fixture.layer(WORLD_PLACE_CLUSTER_LAYER_ID)
    expect(cluster).not.toHaveProperty('minzoom')
    expect(cluster?.layout.visibility).toBe('visible')
    expect(cluster?.paint).toMatchObject({
      'circle-opacity': 1,
      'circle-color': colors.cluster,
      'circle-stroke-color': colors.clusterBorder,
      'circle-stroke-opacity': 1,
    })
    expect(cluster?.paint['circle-radius'][2]).toBeGreaterThanOrEqual(20)
    expect(cluster?.paint['circle-stroke-width']).toBeGreaterThanOrEqual(3)
    expect(fixture.layer(WORLD_PLACE_CLUSTER_COUNT_LAYER_ID)?.layout['text-size']).toBeGreaterThanOrEqual(14)
    expect(fixture.layer(WORLD_PLACE_CLUSTER_COUNT_LAYER_ID)?.paint['text-color']).toBe(colors.clusterText)

    const core = fixture.layer(WORLD_PLACE_AREA_CORE_LAYER_ID)
    expect(core).not.toHaveProperty('minzoom')
    expect(zoomStops(core?.paint['circle-radius'])[0]?.[1]).toBeGreaterThanOrEqual(7)
    expect(zoomStops(core?.paint['circle-opacity'])[0]?.[1]).toBeGreaterThanOrEqual(0.9)
    expect(zoomStops(core?.paint['circle-blur'])[0]?.[1]).toBeLessThanOrEqual(0.25)
    for (const [, opacity] of zoomStops(core?.paint['circle-opacity'])) {
      expect(opacity).toBeGreaterThanOrEqual(0.4)
    }
    for (const id of WORLD_PLACE_AREA_LAYER_IDS) {
      const layer = fixture.layer(id)
      expect(layer?.layout.visibility).toBe('visible')
      expect(layer).not.toHaveProperty('maxzoom')
      expect(zoomStops(layer?.paint['circle-opacity']).find(([zoom]) => zoom === 7)?.[1]).toBeGreaterThan(0.2)
    }
  })

  it('keeps glow above opaque geography, routes above basemap labels, and interactive cores/counts above routes', () => {
    const fixture = mapFixture()
    ensureWorldPlaceLayers(fixture.map, worldPlaceFeatureCollection(null), colors, true)
    ensureTripRouteLayers(fixture.map)

    const order = fixture.layerOrder
    const above = (upper: string, lower: string) => expect(order.indexOf(upper)).toBeGreaterThan(order.indexOf(lower))
    above(WORLD_PLACE_AREA_OUTER_LAYER_ID, 'opaque-land')
    above(WORLD_PLACE_AREA_MIDDLE_LAYER_ID, WORLD_PLACE_AREA_OUTER_LAYER_ID)
    above(ROUTE_CASING_LAYER_ID, 'base-labels')
    above(ROUTE_LINE_LAYER_ID, ROUTE_CASING_LAYER_ID)
    above(WORLD_PLACE_AREA_CORE_LAYER_ID, ROUTE_LINE_LAYER_ID)
    above(WORLD_PLACE_CLUSTER_LAYER_ID, WORLD_PLACE_AREA_CORE_LAYER_ID)
    above(WORLD_PLACE_CLUSTER_COUNT_LAYER_ID, WORLD_PLACE_CLUSTER_LAYER_ID)
  })

  it('preserves travel-layer order when the basemap has no optional label layers', () => {
    const fixture = mapFixture(7, false)
    ensureWorldPlaceLayers(fixture.map, worldPlaceFeatureCollection(null), colors, true)
    ensureTripRouteLayers(fixture.map)
    expect(fixture.layerOrder).toEqual([
      WORLD_PLACE_AREA_OUTER_LAYER_ID,
      WORLD_PLACE_AREA_MIDDLE_LAYER_ID,
      ROUTE_CASING_LAYER_ID,
      ROUTE_LINE_LAYER_ID,
      WORLD_PLACE_AREA_CORE_LAYER_ID,
      WORLD_PLACE_CLUSTER_LAYER_ID,
      WORLD_PLACE_CLUSTER_COUNT_LAYER_ID,
    ])
  })

  it('updates data, World/Journey visibility, and semantic theme colors without recreating the source or layers', () => {
    const fixture = mapFixture()
    const initialData = worldPlaceFeatureCollection(null)
    const populatedData = worldPlaceFeatureCollection(overviewWithRepeatedCity())
    ensureWorldPlaceLayers(fixture.map, initialData, colors, true)

    updateWorldPlaceData(fixture.map, populatedData)
    updateWorldPlaceVisibility(fixture.map, false)
    updateWorldPlaceVisibility(fixture.map, true)
    updateWorldPlaceColors(fixture.map, {
      ...colors,
      area: '#f09a68',
      areaCore: '#ffc09c',
      cluster: '#f09a68',
    })

    expect(fixture.sourceSetData).toHaveBeenCalledWith(populatedData)
    expect(fixture.addSource).toHaveBeenCalledTimes(1)
    expect(fixture.addLayer).toHaveBeenCalledTimes(5)
    expect(fixture.setLayoutProperty).toHaveBeenCalledWith(WORLD_PLACE_AREA_CORE_LAYER_ID, 'visibility', 'none')
    expect(fixture.setLayoutProperty).toHaveBeenCalledWith(WORLD_PLACE_AREA_CORE_LAYER_ID, 'visibility', 'visible')
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(WORLD_PLACE_AREA_OUTER_LAYER_ID, 'circle-color', '#f09a68')
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(WORLD_PLACE_AREA_MIDDLE_LAYER_ID, 'circle-color', '#f09a68')
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(WORLD_PLACE_AREA_CORE_LAYER_ID, 'circle-color', '#ffc09c')
  })

  it('shows exact hover metadata, opens Place Details for the exact cityId, and preserves native cluster expansion', async () => {
    const fixture = mapFixture(8)
    ensureWorldPlaceLayers(fixture.map, worldPlaceFeatureCollection(overviewWithRepeatedCity()), colors, true)
    const onSelectPlace = vi.fn()
    const unbind = bindWorldPlaceInteractions(fixture.map, onSelectPlace)

    fixture.emit('mouseenter', [...WORLD_PLACE_AREA_LAYER_IDS], {
      features: [cityFeature()],
    })
    fixture.emit('click', [...WORLD_PLACE_AREA_LAYER_IDS], {
      features: [cityFeature()],
    })
    fixture.emit('click', WORLD_PLACE_CLUSTER_LAYER_ID, {
      features: [clusterFeature()],
    })
    await Promise.resolve()

    expect(onSelectPlace).toHaveBeenCalledWith('city-rome')
    expect(popupLifecycle.content.mock.calls[0]?.[0].textContent).toContain('Rome, Italy')
    expect(popupLifecycle.content.mock.calls[0]?.[0].textContent).toContain('2 visits')
    expect(popupLifecycle.add).toHaveBeenCalled()
    expect(fixture.canvas.style.cursor).toBe('pointer')
    expect(fixture.getClusterExpansionZoom).toHaveBeenCalledWith(42)
    expect(fixture.easeTo).toHaveBeenCalledWith({
      center: [12.4964, 41.9028],
      zoom: 8,
      bearing: 0,
      pitch: 0,
    })

    fixture.emit('mouseleave', [...WORLD_PLACE_AREA_LAYER_IDS], {})
    expect(fixture.canvas.style.cursor).toBe('')
    unbind()
    expect(fixture.off).toHaveBeenCalledTimes(6)
  })

  it('keeps a valid empty clustered source and removes every layer before the persistent source', () => {
    const fixture = mapFixture()
    const emptyData = worldPlaceFeatureCollection(null)
    ensureWorldPlaceLayers(fixture.map, emptyData, colors, true)

    expect(emptyData.features).toEqual([])
    removeWorldPlaceLayers(fixture.map)

    expect(fixture.removeLayer).toHaveBeenCalledTimes(5)
    expect(fixture.removeSource).toHaveBeenCalledWith(WORLD_PLACE_SOURCE_ID)
    expect(fixture.removeLayer.mock.invocationCallOrder.at(-1))
      .toBeLessThan(fixture.removeSource.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER)
  })
})

function mapFixture(expansionZoom = 7, withBasemapLabels = true) {
  const canvas = document.createElement('canvas')
  const baseLayers = withBasemapLabels ? [
    { id: 'early-labels', type: 'symbol', 'source-layer': 'transportation_name' },
    { id: 'opaque-land', type: 'fill', 'source-layer': 'landcover' },
    { id: 'base-labels', type: 'symbol', 'source-layer': 'place' },
  ] : []
  const layers = new Map<string, Record<string, any>>(baseLayers.map((layer) => [layer.id, layer]))
  const layerOrder = baseLayers.map((layer) => layer.id)
  const listeners = new Map<string, (event: maplibregl.MapLayerMouseEvent) => void>()
  const sourceSetData = vi.fn()
  const getClusterExpansionZoom = vi.fn().mockResolvedValue(expansionZoom)
  const source = { setData: sourceSetData, getClusterExpansionZoom }
  let hasSource = false
  const addSource = vi.fn(() => { hasSource = true })
  const addLayer = vi.fn((layer: { id: string; type?: string }, beforeId?: string) => {
    layers.set(layer.id, layer)
    const index = beforeId ? layerOrder.indexOf(beforeId) : layerOrder.length
    layerOrder.splice(index, 0, layer.id)
  })
  const removeLayer = vi.fn((id: string) => { layers.delete(id) })
  const removeSource = vi.fn(() => { hasSource = false })
  const setLayoutProperty = vi.fn()
  const setPaintProperty = vi.fn()
  const easeTo = vi.fn()
  const off = vi.fn((type: string, layerIds: string | string[]) => {
    listeners.delete(listenerKey(type, layerIds))
  })
  const map = {
    getStyle: () => ({ layers: layerOrder.map((id) => layers.get(id)) }),
    getSource: () => hasSource ? source : undefined,
    getLayer: (id: string) => layers.get(id),
    addSource,
    addLayer,
    removeLayer,
    removeSource,
    setLayoutProperty,
    setPaintProperty,
    getCanvas: () => canvas,
    easeTo,
    on: (type: string, layerIds: string | string[], listener: (event: maplibregl.MapLayerMouseEvent) => void) => {
      listeners.set(listenerKey(type, layerIds), listener)
    },
    off,
  } as unknown as maplibregl.Map

  return {
    map,
    canvas,
    addSource,
    addLayer,
    removeLayer,
    removeSource,
    setLayoutProperty,
    setPaintProperty,
    sourceSetData,
    getClusterExpansionZoom,
    easeTo,
    off,
    layer: (id: string) => layers.get(id),
    layerOrder,
    emit: (type: string, layerIds: string | string[], event: Partial<maplibregl.MapLayerMouseEvent>) => {
      listeners.get(listenerKey(type, layerIds))?.(event as maplibregl.MapLayerMouseEvent)
    },
  }
}

function zoomStops(expression: unknown[]): [number, number][] {
  const stops: [number, number][] = []
  for (let index = 3; index < expression.length; index += 2) {
    stops.push([Number(expression[index]), Number(expression[index + 1])])
  }
  return stops
}

function listenerKey(type: string, layerIds: string | string[]): string {
  return `${type}:${Array.isArray(layerIds) ? layerIds.join(',') : layerIds}`
}

function overviewWithRepeatedCity(): TripMapOverview {
  return {
    visitedCountryCodes: ['IT', 'JP'],
    memoryCount: 0,
    markers: [
      marker('italy', 'rome-2025', 'city-rome', 'Rome', 1, 41.9028, 12.4964, 'IT', 'Italy'),
      marker('europe', 'rome-2026', 'city-rome', 'Rome', 2, 41.9028, 12.4964, 'IT', 'Italy'),
      marker('japan', 'tokyo', 'city-tokyo', 'Tokyo', 1, 35.6762, 139.6503, 'JP', 'Japan'),
    ],
  }
}

function marker(
  tripId: string,
  stopId: string,
  cityId: string,
  cityName: string,
  position: number,
  latitude: number,
  longitude: number,
  countryCode: string,
  countryName: string,
) {
  return {
    tripId,
    stopId,
    cityId,
    cityName,
    position,
    latitude,
    longitude,
    country: { code: countryCode, name: countryName },
  }
}

function cityFeature(): maplibregl.MapGeoJSONFeature {
  return {
    type: 'Feature',
    properties: {
      cityId: 'city-rome',
      cityName: 'Rome',
      countryName: 'Italy',
      visitCount: 2,
    },
    geometry: { type: 'Point', coordinates: [12.4964, 41.9028] },
  } as unknown as maplibregl.MapGeoJSONFeature
}

function clusterFeature(): maplibregl.MapGeoJSONFeature {
  return {
    type: 'Feature',
    properties: { cluster_id: 42, point_count: 12 },
    geometry: { type: 'Point', coordinates: [12.4964, 41.9028] },
  } as unknown as maplibregl.MapGeoJSONFeature
}
