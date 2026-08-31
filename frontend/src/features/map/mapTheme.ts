import type { WorldPlaceColors } from './worldPlaceLayers'

const DEFAULT_COUNTRY_FILL = '#df8a5f'
const DEFAULT_SELECTED_ROUTE = '#bd5426'
const DEFAULT_MAP_MARKER = '#bd5426'
const DEFAULT_MAP_MARKER_BORDER = '#fffdf8'
const DEFAULT_MAP_MARKER_LABEL = '#fff'
const DEFAULT_MAP_VISITED_AREA = '#d97745'
const DEFAULT_MAP_VISITED_AREA_CORE = '#b94f24'

export interface BasemapPalette {
  land: string
  water: string
  terrain: string
  label: string
  labelMuted: string
  labelHalo: string
  boundary: string
  road: string
  reliefOpacity: number
}

export interface MapThemeColors {
  countryFill: string
  selectedRoute: string
  worldPlaces: WorldPlaceColors
  basemap: BasemapPalette
}

export function mapThemeColors(): MapThemeColors {
  const styles = getComputedStyle(document.documentElement)
  const color = (property: string, fallback: string) => styles.getPropertyValue(property).trim() || fallback
  const marker = color('--color-map-marker', DEFAULT_MAP_MARKER)

  return {
    countryFill: color('--color-map-country-fill', DEFAULT_COUNTRY_FILL),
    selectedRoute: color('--color-map-route', DEFAULT_SELECTED_ROUTE),
    worldPlaces: {
      area: color('--color-map-visited-area', DEFAULT_MAP_VISITED_AREA),
      areaCore: color('--color-map-visited-area-core', DEFAULT_MAP_VISITED_AREA_CORE),
      cluster: marker,
      clusterBorder: color('--color-map-marker-border', DEFAULT_MAP_MARKER_BORDER),
      clusterText: color('--color-map-cluster-text', DEFAULT_MAP_MARKER_LABEL),
    },
    basemap: {
      land: color('--color-map-basemap-land', '#eee9dd'),
      water: color('--color-map-basemap-water', '#c7d9db'),
      terrain: color('--color-map-basemap-terrain', '#dde2d5'),
      label: color('--color-map-basemap-label', '#304955'),
      labelMuted: color('--color-map-basemap-label-muted', '#65767b'),
      labelHalo: color('--color-map-basemap-label-halo', '#f6f1e7'),
      boundary: color('--color-map-basemap-boundary', '#899597'),
      road: color('--color-map-basemap-road', '#c8b8a5'),
      reliefOpacity: numericToken(styles.getPropertyValue('--opacity-map-basemap-relief'), 0.28),
    },
  }
}

function numericToken(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
