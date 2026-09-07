import type * as maplibregl from 'maplibre-gl'
import type { CityBoundaryGeometry } from '../../api/cityBoundaries'
import { basemapLabelInsertionLayerId } from './basemapStyle'
import { WORLD_PLACE_AREA_LAYER_IDS } from './worldPlaceLayers'

export const CITY_BOUNDARY_SOURCE_ID = 'visited-city-boundaries'
export const CITY_BOUNDARY_FILL_ID = 'visited-city-boundary-fill'
export const CITY_BOUNDARY_OUTLINE_ID = 'visited-city-boundary-outline'
export const CITY_BOUNDARY_MIN_ZOOM = 8
export interface CityBoundaryData {
  type: 'FeatureCollection'
  features: { type: 'Feature'; id: string; properties: { cityId: string }; geometry: CityBoundaryGeometry }[]
}
export interface CityBoundaryColors { fill: string; outline: string }

export function ensureCityBoundaryLayers(map: maplibregl.Map, colors: CityBoundaryColors): void {
  if (map.getSource(CITY_BOUNDARY_SOURCE_ID) && map.getLayer(CITY_BOUNDARY_FILL_ID) && map.getLayer(CITY_BOUNDARY_OUTLINE_ID)) return
  if (!map.getSource(CITY_BOUNDARY_SOURCE_ID)) {
    map.addSource(CITY_BOUNDARY_SOURCE_ID, {
      type: 'geojson', data: { type: 'FeatureCollection', features: [] },
      attribution: '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> (city boundaries, ODbL)',
    })
  }
  const beforeId = basemapLabelInsertionLayerId(map.getStyle()?.layers ?? [])
    ?? (map.getLayer('trip-route-casing') ? 'trip-route-casing' : undefined)
  if (!map.getLayer(CITY_BOUNDARY_FILL_ID)) {
    map.addLayer({
      id: CITY_BOUNDARY_FILL_ID, type: 'fill', source: CITY_BOUNDARY_SOURCE_ID, minzoom: CITY_BOUNDARY_MIN_ZOOM,
      layout: { visibility: 'none' },
      paint: { 'fill-color': colors.fill, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.12, 10, 0.2, 14, 0.16] },
    }, beforeId)
  }
  if (!map.getLayer(CITY_BOUNDARY_OUTLINE_ID)) {
    map.addLayer({
      id: CITY_BOUNDARY_OUTLINE_ID, type: 'line', source: CITY_BOUNDARY_SOURCE_ID, minzoom: CITY_BOUNDARY_MIN_ZOOM,
      layout: { visibility: 'none' },
      paint: { 'line-color': colors.outline, 'line-opacity': 0.45, 'line-width': 1 },
    }, beforeId)
  }
}

export function updateCityBoundaryColors(map: maplibregl.Map, colors: CityBoundaryColors): void {
  if (map.getLayer(CITY_BOUNDARY_FILL_ID)) map.setPaintProperty(CITY_BOUNDARY_FILL_ID, 'fill-color', colors.fill)
  if (map.getLayer(CITY_BOUNDARY_OUTLINE_ID)) map.setPaintProperty(CITY_BOUNDARY_OUTLINE_ID, 'line-color', colors.outline)
}

export function updateCityBoundaryData(map: maplibregl.Map, data: CityBoundaryData): void {
  map.getSource<maplibregl.GeoJSONSource>(CITY_BOUNDARY_SOURCE_ID)?.setData(data)
  const ids = data.features.map((feature) => feature.properties.cityId)
  // MapLibre includes source attribution only for sources used by visible layers.
  // Keep the source stable, but do not claim boundary data when only fallback glow is shown.
  for (const id of [CITY_BOUNDARY_FILL_ID, CITY_BOUNDARY_OUTLINE_ID]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', ids.length ? 'visible' : 'none')
  }
  // Leave clustered source data untouched. Only the approximate fallback paint is filtered.
  for (const layer of WORLD_PLACE_AREA_LAYER_IDS) {
    if (map.getLayer(layer)) {
      map.setFilter(layer, ids.length ? ['all', ['!', ['has', 'point_count']],
        ['!', ['in', ['get', 'cityId'], ['literal', ids]]]] : ['!', ['has', 'point_count']])
    }
  }
}

export function removeCityBoundaryLayers(map: maplibregl.Map): void {
  for (const id of [CITY_BOUNDARY_OUTLINE_ID, CITY_BOUNDARY_FILL_ID]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  if (map.getSource(CITY_BOUNDARY_SOURCE_ID)) map.removeSource(CITY_BOUNDARY_SOURCE_ID)
}
