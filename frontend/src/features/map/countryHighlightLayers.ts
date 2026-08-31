import type * as maplibregl from 'maplibre-gl'
import { countryFeatureFilter } from './mapData'

export const COUNTRY_HIGHLIGHT_SOURCE_ID = 'visited-country-highlights'
export const COUNTRY_HIGHLIGHT_LAYER_ID = 'visited-country-fill'
export const WORLD_COUNTRY_HIGHLIGHT_OPACITY = 0
export const JOURNEY_COUNTRY_HIGHLIGHT_OPACITY = 0.22

export interface CountryBoundaryData {
  type: 'FeatureCollection'
  features: CountryBoundaryFeature[]
}

interface CountryBoundaryFeature {
  type: 'Feature'
  properties: Record<string, unknown> | null
  geometry: CountryGeometry
}

type CountryGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

interface StyleLayerPlacement {
  id: string
  type?: string
  'source-layer'?: string
}

export function ensureCountryHighlightLayer(
  map: maplibregl.Map,
  data: CountryBoundaryData,
  countryCodes: string[],
  fillColor: string,
  fillOpacity: number,
): void {
  if (!map.getSource(COUNTRY_HIGHLIGHT_SOURCE_ID)) {
    map.addSource(COUNTRY_HIGHLIGHT_SOURCE_ID, {
      type: 'geojson',
      data,
    })
  }

  if (!map.getLayer(COUNTRY_HIGHLIGHT_LAYER_ID)) {
    map.addLayer({
      id: COUNTRY_HIGHLIGHT_LAYER_ID,
      type: 'fill',
      source: COUNTRY_HIGHLIGHT_SOURCE_ID,
      filter: countryFeatureFilter(countryCodes),
      paint: {
        'fill-antialias': true,
        'fill-color': fillColor,
        'fill-opacity': fillOpacity,
      },
    }, countryHighlightInsertionLayerId(map.getStyle()?.layers ?? []))
  }
}

export function updateCountryHighlightFilter(map: maplibregl.Map, countryCodes: string[]): void {
  if (map.getLayer(COUNTRY_HIGHLIGHT_LAYER_ID)) {
    map.setFilter(COUNTRY_HIGHLIGHT_LAYER_ID, countryFeatureFilter(countryCodes))
  }
}

export function updateCountryHighlightColor(map: maplibregl.Map, fillColor: string): void {
  if (map.getLayer(COUNTRY_HIGHLIGHT_LAYER_ID)) {
    map.setPaintProperty(COUNTRY_HIGHLIGHT_LAYER_ID, 'fill-color', fillColor)
  }
}

export function updateCountryHighlightOpacity(map: maplibregl.Map, fillOpacity: number): void {
  if (map.getLayer(COUNTRY_HIGHLIGHT_LAYER_ID)) {
    map.setPaintProperty(COUNTRY_HIGHLIGHT_LAYER_ID, 'fill-opacity', fillOpacity)
  }
}

export function removeCountryHighlightLayer(map: maplibregl.Map): void {
  if (map.getLayer(COUNTRY_HIGHLIGHT_LAYER_ID)) {
    map.removeLayer(COUNTRY_HIGHLIGHT_LAYER_ID)
  }
  if (map.getSource(COUNTRY_HIGHLIGHT_SOURCE_ID)) {
    map.removeSource(COUNTRY_HIGHLIGHT_SOURCE_ID)
  }
}

export function countryHighlightInsertionLayerId(layers: readonly StyleLayerPlacement[]): string | undefined {
  return layers.find((layer) => layer['source-layer'] === 'transportation')?.id
    ?? layers.find((layer) => layer.type === 'line' && layer['source-layer'] === 'boundary')?.id
    ?? layers.find((layer) => layer.type === 'symbol')?.id
}

export function isCountryBoundaryData(data: unknown): data is CountryBoundaryData {
  return typeof data === 'object'
    && data !== null
    && (data as { type?: unknown }).type === 'FeatureCollection'
    && Array.isArray((data as { features?: unknown }).features)
    && (data as { features: unknown[] }).features.every(isCountryBoundaryFeature)
}

function isCountryBoundaryFeature(feature: unknown): feature is CountryBoundaryFeature {
  return typeof feature === 'object'
    && feature !== null
    && (feature as { type?: unknown }).type === 'Feature'
    && isCountryGeometry((feature as { geometry?: unknown }).geometry)
    && ((feature as { properties?: unknown }).properties === null
      || typeof (feature as { properties?: unknown }).properties === 'object')
}

function isCountryGeometry(geometry: unknown): geometry is CountryGeometry {
  return typeof geometry === 'object'
    && geometry !== null
    && ((geometry as { type?: unknown }).type === 'Polygon' || (geometry as { type?: unknown }).type === 'MultiPolygon')
    && Array.isArray((geometry as { coordinates?: unknown }).coordinates)
}
