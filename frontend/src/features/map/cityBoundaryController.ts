import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import { getCityBoundary } from '../../api/cityBoundaries'
import type { CityBoundaryGeometry, CityBoundaryResult } from '../../api/cityBoundaries'
import { getClientSessionGeneration } from '../../api/client'
import type { WorldPlaceFeature, WorldPlaceFeatureCollection } from './mapData'
import { mapThemeColors } from './mapTheme'
import {
  CITY_BOUNDARY_FILL_ID, CITY_BOUNDARY_MIN_ZOOM, CITY_BOUNDARY_SOURCE_ID,
  ensureCityBoundaryLayers, removeCityBoundaryLayers, updateCityBoundaryData,
} from './cityBoundaryLayers'
import type { CityBoundaryData } from './cityBoundaryLayers'

type FetchBoundary = typeof getCityBoundary
interface CachedBoundary { result: CityBoundaryResult; retryAt: number; bytes: number; points: number }
const MAX_VISIBLE = 12
const MAX_CACHE_BYTES = 4000000

/** Per-map/session, demand-driven controller. No React move state, timers, preload or global geometry cache. */
export class CityBoundaryController {
  private places = new Map<string, WorldPlaceFeature>()
  private world = false
  private disposed = false
  private cache = new Map<string, CachedBoundary>()
  private pending = new Map<string, AbortController>()
  private renderedKey = ''
  private readonly session = getClientSessionGeneration()
  private readonly popup = new Popup({ closeButton: false, closeOnClick: false, offset: 12 })
  private onSelect: (id: string) => void = () => undefined

  constructor(private readonly map: maplibregl.Map, private readonly fetchBoundary: FetchBoundary = getCityBoundary) {
    map.on('moveend', this.refresh)
    map.on('idle', this.refresh)
    map.on('mouseenter', CITY_BOUNDARY_FILL_ID, this.hover)
    map.on('mouseleave', CITY_BOUNDARY_FILL_ID, this.leave)
    map.on('click', CITY_BOUNDARY_FILL_ID, this.select)
  }

  update(data: WorldPlaceFeatureCollection, world: boolean, onSelect: (id: string) => void): void {
    this.places = new Map(data.features.map((place) => [place.properties.cityId, place]))
    this.world = world
    this.onSelect = onSelect
    for (const id of this.cache.keys()) if (!this.places.has(id)) this.cache.delete(id)
    for (const [id, request] of this.pending) if (!world || !this.places.has(id)) request.abort()
    this.leave()
    // Reapply after style.load even when feature IDs/geometry are unchanged.
    this.renderedKey = ''
    this.refresh()
  }

  private active(): boolean { return !this.disposed && this.session === getClientSessionGeneration() }

  private visible(): WorldPlaceFeature[] {
    if (!this.world || this.map.getZoom() < CITY_BOUNDARY_MIN_ZOOM) return []
    const bounds = this.map.getBounds()
    const center = this.map.getCenter()
    return [...this.places.values()].filter((place) => bounds.contains(place.geometry.coordinates))
      .sort((a, b) => distance(a, center) - distance(b, center) || a.properties.cityId.localeCompare(b.properties.cityId))
      .slice(0, MAX_VISIBLE)
  }

  private refresh = (): void => {
    if (!this.active()) {
      if (!this.disposed) {
        this.pending.forEach((request) => request.abort())
        this.cache.clear()
        this.leave()
        if (this.map.isStyleLoaded()) this.render([])
      }
      return
    }
    if (!this.map.isStyleLoaded()) return
    ensureCityBoundaryLayers(this.map, mapThemeColors().cityBoundaries)
    const visible = this.visible()
    const visibleIds = new Set(visible.map((place) => place.properties.cityId))
    // Keep aborted requests in the in-flight budget until they settle; no hidden queue on rapid pan.
    for (const [id, request] of this.pending) if (!visibleIds.has(id)) request.abort()
    this.render(visible)
    for (const place of visible) {
      const id = place.properties.cityId
      if (this.pending.size >= 2) break
      if (this.pending.has(id) || (this.cache.get(id)?.retryAt ?? 0) > Date.now()) continue
      const controller = new AbortController()
      this.pending.set(id, controller)
      void this.fetchBoundary(id, controller.signal).then((result) => {
        if (!this.active() || controller.signal.aborted || !this.places.has(id)) return
        const geometry = result.status === 'AVAILABLE' ? validGeometry(result.geometry) : null
        if (result.status === 'AVAILABLE' && !geometry) throw new Error('Invalid boundary response')
        if (!['AVAILABLE', 'UNAVAILABLE', 'TEMPORARILY_UNAVAILABLE'].includes(result.status)) throw new Error('Invalid boundary status')
        const previous = this.cache.get(id)
        const retained = result.status === 'TEMPORARILY_UNAVAILABLE' && previous?.result.geometry ? previous : null
        this.cache.delete(id)
        this.cache.set(id, {
          result: retained ? retained.result : { ...result, geometry: geometry?.geometry ?? null },
          bytes: retained?.bytes ?? geometry?.bytes ?? 0, points: retained?.points ?? geometry?.points ?? 0,
          retryAt: Date.now() + Math.min(86400, Math.max(30, Number.isFinite(result.retryAfterSeconds) ? result.retryAfterSeconds : 300)) * 1000,
        })
        this.trimCache()
      }).catch(() => {
        if (!this.active() || controller.signal.aborted || !this.places.has(id)) return
        const previous = this.cache.get(id)
        this.cache.set(id, { result: previous?.result ?? {
          status: 'TEMPORARILY_UNAVAILABLE', geometry: null, stale: false, retryAfterSeconds: 300,
        }, bytes: previous?.bytes ?? 0, points: previous?.points ?? 0, retryAt: Date.now() + 300000 })
        this.trimCache()
      }).finally(() => {
        this.pending.delete(id)
        if (this.active()) this.refresh()
      })
    }
  }

  private render(places: WorldPlaceFeature[]): void {
    let bytes = 0, points = 0
    const data: CityBoundaryData = { type: 'FeatureCollection', features: [] }
    for (const place of places) {
      const id = place.properties.cityId
      const cached = this.cache.get(id)
      if (!cached?.result.geometry || bytes + cached.bytes > 2000000 || points + cached.points > 50000) continue
      bytes += cached.bytes
      points += cached.points
      data.features.push({ type: 'Feature', id, properties: { cityId: id }, geometry: cached.result.geometry })
    }
    // Geometry serialization is bounded and happens only on idle/data/fetch completion, never each frame.
    const key = JSON.stringify(data)
    if (key !== this.renderedKey) {
      updateCityBoundaryData(this.map, data)
      this.renderedKey = key
    }
  }

  private trimCache(): void {
    let bytes = [...this.cache.values()].reduce((total, value) => total + value.bytes, 0)
    for (const [id, entry] of this.cache) {
      if (this.cache.size <= 64 && bytes <= MAX_CACHE_BYTES) break
      if (this.cache.size > 64) this.cache.delete(id)
      else this.cache.set(id, { ...entry, bytes: 0, points: 0, result: {
        ...entry.result, geometry: null, status: 'TEMPORARILY_UNAVAILABLE',
      } })
      bytes -= entry.bytes
    }
  }

  private hover = (event: maplibregl.MapLayerMouseEvent): void => {
    const id = event.features?.[0]?.properties.cityId
    const place = typeof id === 'string' && this.active() && this.world ? this.places.get(id) : null
    if (!place) return
    const content = document.createElement('div')
    const title = document.createElement('strong')
    title.textContent = `${place.properties.cityName}, ${place.properties.countryName}`
    const visits = document.createElement('span')
    visits.textContent = `${place.properties.visitCount} ${place.properties.visitCount === 1 ? 'visit' : 'visits'}`
    content.append(title, visits)
    this.map.getCanvas().style.cursor = 'pointer'
    this.popup.setDOMContent(content).setLngLat(event.lngLat).addTo(this.map)
  }

  private leave = (): void => { this.popup.remove(); this.map.getCanvas().style.cursor = '' }
  private select = (event: maplibregl.MapLayerMouseEvent): void => {
    const id = event.features?.[0]?.properties.cityId
    if (this.active() && this.world && typeof id === 'string' && this.places.has(id)) this.onSelect(id)
  }

  dispose(): void {
    this.disposed = true
    this.pending.forEach((request) => request.abort())
    this.pending.clear()
    this.cache.clear()
    this.places.clear()
    this.map.off('moveend', this.refresh)
    this.map.off('idle', this.refresh)
    this.map.off('mouseenter', CITY_BOUNDARY_FILL_ID, this.hover)
    this.map.off('mouseleave', CITY_BOUNDARY_FILL_ID, this.leave)
    this.map.off('click', CITY_BOUNDARY_FILL_ID, this.select)
    this.leave()
    if (this.map.getSource(CITY_BOUNDARY_SOURCE_ID)) removeCityBoundaryLayers(this.map)
  }
}

function distance(place: WorldPlaceFeature, center: { lng: number; lat: number }): number {
  return (place.geometry.coordinates[0] - center.lng) ** 2 + (place.geometry.coordinates[1] - center.lat) ** 2
}

function validGeometry(value: unknown): { geometry: CityBoundaryGeometry; bytes: number; points: number } | null {
  if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'MultiPolygon'
    || !('coordinates' in value) || !Array.isArray(value.coordinates) || !value.coordinates.length) return null
  let points = 0
  for (const polygon of value.coordinates) {
    if (!Array.isArray(polygon) || !polygon.length) return null
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) return null
      for (const point of ring) {
        if (++points > 10000 || !Array.isArray(point) || point.length !== 2
          || !point.every((number) => typeof number === 'number' && Number.isFinite(number))
          || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) return null
      }
      if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) return null
    }
  }
  const bytes = JSON.stringify(value).length
  return bytes <= 500000 ? { geometry: value as CityBoundaryGeometry, bytes, points } : null
}
