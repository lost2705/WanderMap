// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import type * as maplibregl from 'maplibre-gl'
import { getClientSessionGeneration, resetClientSession } from '../../api/client'
import type { CityBoundaryGeometry, CityBoundaryResult } from '../../api/cityBoundaries'
import { CityBoundaryController } from './cityBoundaryController'
import { CITY_BOUNDARY_FILL_ID, CITY_BOUNDARY_SOURCE_ID } from './cityBoundaryLayers'
import { WORLD_PLACE_AREA_LAYER_IDS } from './worldPlaceLayers'
import type { WorldPlaceFeatureCollection } from './mapData'

vi.mock('maplibre-gl', () => ({ Popup: class {
  setDOMContent() { return this }
  setLngLat() { return this }
  addTo() { return this }
  remove() {}
} }))

const geometry: CityBoundaryGeometry = { type: 'MultiPolygon', coordinates: [[[[12, 41], [13, 41], [13, 42], [12, 41]]]] }
const available: CityBoundaryResult = { status: 'AVAILABLE', geometry, stale: false, retryAfterSeconds: 300 }
const unavailable: CityBoundaryResult = { status: 'UNAVAILABLE', geometry: null, stale: false, retryAfterSeconds: 300 }
const disposals: (() => void)[] = []
afterEach(() => { disposals.splice(0).forEach((dispose) => dispose()); vi.restoreAllMocks() })

describe('lazy per-session city boundaries', () => {
  it('fetches only unique visible cities above the cluster zoom and leaves unavailable places as glow', async () => {
    const fixture = setup(vi.fn().mockResolvedValueOnce(available).mockResolvedValue(unavailable))
    fixture.viewport.zoom = 2
    fixture.controller.update(places(3), true, vi.fn())
    expect(fixture.fetch).not.toHaveBeenCalled()
    fixture.viewport.zoom = 9
    fixture.viewport.visible = false
    fixture.emit('moveend')
    expect(fixture.fetch).not.toHaveBeenCalled()
    fixture.viewport.visible = true
    fixture.emit('moveend')
    await flush()
    expect(fixture.fetch).toHaveBeenCalledTimes(3)
    expect(fixture.data().features.map((feature: { id: string }) => feature.id)).toEqual(['city-0'])
    expect(fixture.map.setFilter).toHaveBeenCalledWith(WORLD_PLACE_AREA_LAYER_IDS[0],
      ['all', ['!', ['has', 'point_count']], ['!', ['in', ['get', 'cityId'], ['literal', ['city-0']]]]])
    fixture.emit('idle')
    fixture.emit('moveend')
    await flush()
    expect(fixture.fetch).toHaveBeenCalledTimes(3)
    fixture.viewport.zoom = 7
    fixture.emit('moveend')
    expect(fixture.data().features).toHaveLength(0)
    expect(fixture.map.setFilter).toHaveBeenLastCalledWith(WORLD_PLACE_AREA_LAYER_IDS[2], ['!', ['has', 'point_count']])
  })

  it('bounds in-flight requests and a viewport to twelve candidates without eager preload', async () => {
    const complete: ((value: CityBoundaryResult) => void)[] = []
    const fixture = setup(vi.fn().mockImplementation(() => new Promise((resolve) => complete.push(resolve))))
    fixture.controller.update(places(100), true, vi.fn())
    expect(fixture.fetch).toHaveBeenCalledTimes(2)
    for (let i = 0; i < 6; i++) {
      complete.splice(0).forEach((resolve) => resolve(unavailable))
      await flush()
    }
    expect(fixture.fetch).toHaveBeenCalledTimes(12)
    fixture.emit('moveend')
    expect(fixture.fetch).toHaveBeenCalledTimes(12)
  })

  it('cancels requests outside the viewport and ignores their late results without exceeding concurrency', async () => {
    const complete: ((value: CityBoundaryResult) => void)[] = []
    const fixture = setup(vi.fn().mockImplementation(() => new Promise((resolve) => complete.push(resolve))))
    fixture.viewport.west = 12
    fixture.viewport.east = 12.001
    fixture.controller.update(places(4), true, vi.fn())
    const signals = fixture.fetch.mock.calls.map((call) => call[1] as AbortSignal)
    fixture.viewport.west = 12.002
    fixture.viewport.east = 12.003
    fixture.emit('moveend')
    expect(signals.every((signal) => signal.aborted)).toBe(true)
    expect(fixture.fetch).toHaveBeenCalledTimes(2)
    complete.splice(0).forEach((resolve) => resolve(available))
    await flush()
    expect(fixture.fetch).toHaveBeenCalledTimes(4)
    expect(fixture.data().features).toHaveLength(0)
    complete.splice(0).forEach((resolve) => resolve(unavailable))
    await flush()
    fixture.viewport.west = 12
    fixture.viewport.east = 12.001
    fixture.emit('moveend')
    expect(fixture.fetch).toHaveBeenCalledTimes(6) // Aborted cities were not cached.
    fixture.viewport.zoom = 7
    fixture.emit('moveend')
    expect(fixture.fetch.mock.calls.slice(-2).every((call) => (call[1] as AbortSignal).aborted)).toBe(true)
  })

  it('bounds failed-request cache entries as the viewport moves across many cities', async () => {
    const fixture = setup(vi.fn().mockRejectedValue(new Error('database unavailable')))
    fixture.viewport.east = 12
    fixture.controller.update(places(70), true, vi.fn())
    await flush()
    for (let i = 1; i < 70; i++) {
      fixture.viewport.west = fixture.viewport.east = 12 + i * 0.001
      fixture.emit('moveend')
      await flush()
    }
    expect(fixture.fetch).toHaveBeenCalledTimes(70)
    fixture.viewport.west = fixture.viewport.east = 12
    fixture.emit('moveend')
    await flush()
    expect(fixture.fetch).toHaveBeenCalledTimes(71) // Oldest failure was evicted at 64 entries.
  })

  it('only uses the attributed boundary source while real geometry is visible', async () => {
    const fixture = setup(vi.fn().mockResolvedValue(available))
    fixture.controller.update(places(1), true, vi.fn())
    expect(fixture.map.setLayoutProperty).toHaveBeenCalledWith(CITY_BOUNDARY_FILL_ID, 'visibility', 'none')
    await flush()
    expect(fixture.map.setLayoutProperty).toHaveBeenCalledWith(CITY_BOUNDARY_FILL_ID, 'visibility', 'visible')
    fixture.controller.update(places(1), false, vi.fn())
    expect(fixture.map.setLayoutProperty.mock.calls.filter((call) => call[0] === CITY_BOUNDARY_FILL_ID).at(-1)?.[2]).toBe('none')
    fixture.controller.update(places(1), true, vi.fn())
    expect(fixture.map.addSource).toHaveBeenCalledTimes(1)
    fixture.viewport.zoom = 7
    fixture.emit('moveend')
    expect(fixture.map.setLayoutProperty.mock.calls.filter((call) => call[0] === CITY_BOUNDARY_FILL_ID).at(-1)?.[2]).toBe('none')
  })

  it('network and malformed geometry failures do not break the map or refetch on every pan', async () => {
    const fixture = setup(vi.fn().mockRejectedValueOnce(new Error('backend unavailable')).mockResolvedValue({ ...available,
      geometry: { type: 'MultiPolygon', coordinates: [[[[Infinity, 41]]]] } }))
    fixture.controller.update(places(2), true, vi.fn())
    await flush()
    expect(fixture.data().features).toHaveLength(0)
    fixture.emit('moveend')
    await flush()
    expect(fixture.fetch).toHaveBeenCalledTimes(2)
  })

  it('retains a cached polygon when a later refresh fails', async () => {
    let now = 1000000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const fixture = setup(vi.fn().mockResolvedValueOnce(available).mockRejectedValue(new Error('outage')))
    fixture.controller.update(places(1), true, vi.fn())
    await flush()
    now += 301000
    fixture.emit('moveend')
    await flush()
    expect(fixture.fetch).toHaveBeenCalledTimes(2)
    expect(fixture.data().features).toHaveLength(1)
  })

  it('ignores late Alice completion after session change and clears her rendered visited set', async () => {
    let resolve!: (value: CityBoundaryResult) => void
    const fixture = setup(vi.fn().mockResolvedValueOnce(available).mockImplementationOnce(() => new Promise((done) => { resolve = done })))
    fixture.controller.update(places(2), true, vi.fn())
    await flush()
    expect(fixture.data().features).toHaveLength(1)
    const generation = getClientSessionGeneration()
    resetClientSession()
    expect(getClientSessionGeneration()).not.toBe(generation)
    resolve(available)
    fixture.emit('idle')
    await flush()
    expect(fixture.data().features).toHaveLength(0)
    const bob = setup(vi.fn().mockResolvedValue(unavailable))
    bob.controller.update(places(0), true, vi.fn())
    expect(bob.data().features).toHaveLength(0)
  })

  it('keeps only the current visited set and exact click identity without feature private metadata', async () => {
    const select = vi.fn()
    const fixture = setup(vi.fn().mockResolvedValue(available))
    fixture.controller.update(places(2), true, select)
    await flush()
    expect(fixture.data().features[0].properties).toEqual({ cityId: 'city-0' })
    fixture.emit(`click:${CITY_BOUNDARY_FILL_ID}`, { features: [{ properties: { cityId: 'city-1' } }] })
    expect(select).toHaveBeenCalledWith('city-1')
    fixture.controller.update(places(1), true, select)
    expect(fixture.data().features).toHaveLength(1)
    fixture.controller.update(places(1), false, select)
    expect(fixture.data().features).toHaveLength(0)
    fixture.emit(`click:${CITY_BOUNDARY_FILL_ID}`, { features: [{ properties: { cityId: 'city-0' } }] })
    expect(select).toHaveBeenCalledTimes(1)
    fixture.controller.update(places(1), true, select)
    expect(fixture.data().features).toHaveLength(1)
  })

  it('late Alice success or failure cannot modify Bob geometry, filters or attribution on the same map', async () => {
    let resolve!: (value: CityBoundaryResult) => void
    let reject!: (reason: Error) => void
    const fixture = setup(vi.fn().mockImplementationOnce(() => new Promise((done) => { resolve = done }))
      .mockImplementationOnce(() => new Promise((_, fail) => { reject = fail })))
    fixture.controller.update(places(2), true, vi.fn())
    resetClientSession()
    fixture.controller.dispose()
    const bobFetch = vi.fn().mockResolvedValue(available)
    const bob = new CityBoundaryController(fixture.map as unknown as maplibregl.Map, bobFetch)
    disposals.push(() => bob.dispose())
    const bobPlaces = places(3)
    bobPlaces.features = bobPlaces.features.slice(2)
    bob.update(bobPlaces, true, vi.fn())
    await flush()
    const before = JSON.stringify(fixture.data())
    const filters = fixture.map.setFilter.mock.calls.length
    const visibility = fixture.map.setLayoutProperty.mock.calls.length
    const sources = fixture.map.addSource.mock.calls.length
    resolve(available)
    reject(new Error('late Alice database failure'))
    await flush()
    expect(fixture.data().features.map((feature: { id: string }) => feature.id)).toEqual(['city-2'])
    expect(JSON.stringify(fixture.data())).toBe(before)
    expect(fixture.map.setFilter).toHaveBeenCalledTimes(filters)
    expect(fixture.map.setLayoutProperty).toHaveBeenCalledTimes(visibility)
    expect(fixture.map.addSource).toHaveBeenCalledTimes(sources)
    expect(bobFetch).toHaveBeenCalledTimes(1)
  })

  it('cleans requests, sources and handlers and ignores completion after unmount', async () => {
    let resolve!: (value: CityBoundaryResult) => void
    const fixture = setup(vi.fn().mockImplementation(() => new Promise((done) => { resolve = done })))
    fixture.controller.update(places(1), true, vi.fn())
    const signal = fixture.fetch.mock.calls[0]?.[1] as AbortSignal
    fixture.controller.dispose()
    resolve(available)
    await flush()
    expect(signal.aborted).toBe(true)
    expect(fixture.events.size).toBe(0)
    expect(fixture.sources.has(CITY_BOUNDARY_SOURCE_ID)).toBe(false)
  })

  it('bounds rendered geometry and cache pressure never causes a refetch loop', async () => {
    const points = Array.from({ length: 10000 }, () => [12.123456789012345, 41.123456789012345])
    const fixture = setup(vi.fn().mockResolvedValue({ ...available, geometry: { type: 'MultiPolygon', coordinates: [[points]] } }))
    fixture.controller.update(places(12), true, vi.fn())
    for (let i = 0; i < 7; i++) await flush()
    expect(fixture.fetch).toHaveBeenCalledTimes(12)
    expect(JSON.stringify(fixture.data()).length).toBeLessThan(2010000)
    fixture.emit('idle')
    await flush()
    expect(fixture.fetch).toHaveBeenCalledTimes(12)
  })
})

function places(count: number): WorldPlaceFeatureCollection {
  return { type: 'FeatureCollection', features: Array.from({ length: count }, (_, index) => ({
    type: 'Feature', properties: { cityId: `city-${index}`, cityName: `City ${index}`, countryCode: 'IT', countryName: 'Italy', visitCount: 1 },
    geometry: { type: 'Point', coordinates: [12 + index * 0.001, 41] },
  })) }
}

function setup(fetch = vi.fn().mockResolvedValue(unavailable)) {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>()
  const layers = new Map<string, unknown>(WORLD_PLACE_AREA_LAYER_IDS.map((id) => [id, { id }]))
  const events = new Map<string, (...args: any[]) => void>()
  const viewport = { zoom: 9, visible: true, west: -180, east: 180 }
  const canvas = document.createElement('canvas')
  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: vi.fn((id: string) => sources.set(id, { setData: vi.fn() })),
    removeSource: (id: string) => sources.delete(id),
    getLayer: (id: string) => layers.get(id),
    addLayer: (layer: { id: string }) => layers.set(layer.id, layer),
    removeLayer: (id: string) => layers.delete(id),
    getStyle: () => ({ layers: [{ id: 'labels', type: 'symbol' }] }),
    isStyleLoaded: () => true, getZoom: () => viewport.zoom,
    getCenter: () => ({ lng: 12, lat: 41 }),
    getBounds: () => ({ contains: ([lng]: number[]) => viewport.visible && lng >= viewport.west && lng <= viewport.east }),
    setFilter: vi.fn(), setLayoutProperty: vi.fn(), getCanvas: () => canvas,
    on: (type: string, layerOrListener: string | ((...args: any[]) => void), listener?: (...args: any[]) => void) => {
      events.set(typeof layerOrListener === 'string' ? `${type}:${layerOrListener}` : type,
        typeof layerOrListener === 'string' ? listener! : layerOrListener)
    },
    off: (type: string, layerOrListener: unknown) => events.delete(typeof layerOrListener === 'string' ? `${type}:${layerOrListener}` : type),
  }
  const controller = new CityBoundaryController(map as unknown as maplibregl.Map, fetch)
  disposals.push(() => controller.dispose())
  return { map, sources, events, viewport, controller, fetch,
    emit: (event: string, data: unknown = {}) => events.get(event)?.(data),
    data: () => sources.get(CITY_BOUNDARY_SOURCE_ID)?.setData.mock.calls.at(-1)?.[0],
  }
}

async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve() }
