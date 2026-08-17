import type * as maplibregl from 'maplibre-gl'
import { routeFeatureCollection } from './mapData'
import type { TripRouteFeatureCollection } from './mapData'

export const ROUTE_SOURCE_ID = 'trip-routes'
export const ROUTE_CASING_LAYER_ID = 'trip-route-casing'
export const ROUTE_LINE_LAYER_ID = 'trip-route-lines'

export function ensureTripRouteLayers(map: maplibregl.Map): void {
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
    })
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
        'line-color': ['get', 'color'],
        'line-width': ['get', 'lineWidth'],
        'line-opacity': ['get', 'lineOpacity'],
        'line-offset': ['get', 'lineOffset'],
      },
    })
  }
}

export function updateTripRouteData(map: maplibregl.Map, routeData: TripRouteFeatureCollection): void {
  map.getSource<maplibregl.GeoJSONSource>(ROUTE_SOURCE_ID)?.setData(routeData)
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
