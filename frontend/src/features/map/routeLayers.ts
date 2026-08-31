import type * as maplibregl from 'maplibre-gl'
import { routeFeatureCollection } from './mapData'
import type { TripRouteFeatureCollection } from './mapData'
import { WORLD_PLACE_AREA_CORE_LAYER_ID } from './worldPlaceLayers'

export const ROUTE_SOURCE_ID = 'trip-routes'
export const ROUTE_CASING_LAYER_ID = 'trip-route-casing'
export const ROUTE_LINE_LAYER_ID = 'trip-route-lines'
const ROUTE_IDENTITY_COLOR: maplibregl.ExpressionSpecification = ['get', 'identityColor']

export function ensureTripRouteLayers(map: maplibregl.Map): void {
  // Travel routes sit above the basemap, but below interactive World cores/counts.
  const beforeId = map.getLayer(WORLD_PLACE_AREA_CORE_LAYER_ID) ? WORLD_PLACE_AREA_CORE_LAYER_ID : undefined
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: routeFeatureCollection([]),
    })
  }
  if (!map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_CASING_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': '#fffdf8',
        'line-width': ['get', 'casingWidth'],
        'line-opacity': 0.82,
        'line-offset': ['get', 'lineOffset'],
      },
    }, beforeId)
  }
  if (!map.getLayer(ROUTE_LINE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LINE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: {
        'line-cap': 'round',
        'line-join': 'round',
      },
      paint: {
        'line-color': ROUTE_IDENTITY_COLOR,
        'line-width': ['get', 'lineWidth'],
        'line-opacity': ['get', 'lineOpacity'],
        'line-offset': ['get', 'lineOffset'],
      },
    }, beforeId)
  }
}

export function updateTripRouteData(map: maplibregl.Map, routeData: TripRouteFeatureCollection): void {
  map.getSource<maplibregl.GeoJSONSource>(ROUTE_SOURCE_ID)?.setData(routeData)
}

export function updateTripRouteColor(map: maplibregl.Map, selectedRouteColor: string | null): void {
  if (map.getLayer(ROUTE_LINE_LAYER_ID)) {
    map.setPaintProperty(
      ROUTE_LINE_LAYER_ID,
      'line-color',
      selectedRouteColor ?? ROUTE_IDENTITY_COLOR,
    )
  }
}

export function removeTripRouteLayers(map: maplibregl.Map): void {
  if (map.getLayer(ROUTE_LINE_LAYER_ID)) {
    map.removeLayer(ROUTE_LINE_LAYER_ID)
  }
  if (map.getLayer(ROUTE_CASING_LAYER_ID)) {
    map.removeLayer(ROUTE_CASING_LAYER_ID)
  }
  if (map.getSource(ROUTE_SOURCE_ID)) {
    map.removeSource(ROUTE_SOURCE_ID)
  }
}
