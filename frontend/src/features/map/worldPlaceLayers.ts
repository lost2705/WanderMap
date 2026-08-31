import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import type { WorldPlaceFeatureCollection } from './mapData'
import { flatCameraOptions } from './mapCamera'
import { basemapLabelInsertionLayerId } from './basemapStyle'

export const WORLD_PLACE_SOURCE_ID = 'world-places'
export const WORLD_PLACE_CLUSTER_LAYER_ID = 'world-place-clusters'
export const WORLD_PLACE_CLUSTER_COUNT_LAYER_ID = 'world-place-cluster-count'
export const WORLD_PLACE_AREA_OUTER_LAYER_ID = 'world-place-area-outer'
export const WORLD_PLACE_AREA_MIDDLE_LAYER_ID = 'world-place-area-middle'
export const WORLD_PLACE_AREA_CORE_LAYER_ID = 'world-place-area-core'
export const WORLD_PLACE_CLUSTER_MAX_ZOOM = 7
export const WORLD_PLACE_CLUSTER_RADIUS = 48

export const WORLD_PLACE_AREA_LAYER_IDS = [
  WORLD_PLACE_AREA_OUTER_LAYER_ID,
  WORLD_PLACE_AREA_MIDDLE_LAYER_ID,
  WORLD_PLACE_AREA_CORE_LAYER_ID,
] as const

const WORLD_PLACE_LAYER_IDS = [
  WORLD_PLACE_CLUSTER_LAYER_ID,
  WORLD_PLACE_CLUSTER_COUNT_LAYER_ID,
  ...WORLD_PLACE_AREA_LAYER_IDS,
] as const

const WORLD_PLACE_INTERACTIVE_LAYER_IDS = [...WORLD_PLACE_AREA_LAYER_IDS]

type WorldPlacePaintProperty =
  | 'circle-color'
  | 'circle-stroke-color'
  | 'text-color'

export interface WorldPlaceColors {
  area: string
  areaCore: string
  cluster: string
  clusterBorder: string
  clusterText: string
}

export function ensureWorldPlaceLayers(
  map: maplibregl.Map,
  data: WorldPlaceFeatureCollection,
  colors: WorldPlaceColors,
  visible: boolean,
): void {
  if (!map.getSource(WORLD_PLACE_SOURCE_ID)) {
    map.addSource(WORLD_PLACE_SOURCE_ID, {
      type: 'geojson',
      data,
      cluster: true,
      clusterMaxZoom: WORLD_PLACE_CLUSTER_MAX_ZOOM,
      clusterRadius: WORLD_PLACE_CLUSTER_RADIUS,
    })
  }

  const visibility = visible ? 'visible' : 'none'
  const beforeId = basemapLabelInsertionLayerId(map.getStyle()?.layers ?? []) ?? WORLD_PLACE_CLUSTER_LAYER_ID

  // Keep interactive travel data above basemap symbols so labels cannot obscure counts.
  if (!map.getLayer(WORLD_PLACE_CLUSTER_LAYER_ID)) {
    map.addLayer({
      id: WORLD_PLACE_CLUSTER_LAYER_ID,
      type: 'circle',
      source: WORLD_PLACE_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: { visibility },
      paint: {
        'circle-color': colors.cluster,
        'circle-radius': ['step', ['get', 'point_count'], 20, 10, 24, 50, 28],
        'circle-opacity': 1,
        'circle-stroke-color': colors.clusterBorder,
        'circle-stroke-width': 3,
        'circle-stroke-opacity': 1,
      },
    })
  }

  if (!map.getLayer(WORLD_PLACE_CLUSTER_COUNT_LAYER_ID)) {
    map.addLayer({
      id: WORLD_PLACE_CLUSTER_COUNT_LAYER_ID,
      type: 'symbol',
      source: WORLD_PLACE_SOURCE_ID,
      filter: ['has', 'point_count'],
      layout: {
        visibility,
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 14,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': colors.clusterText,
      },
    })
  }

  if (!map.getLayer(WORLD_PLACE_AREA_OUTER_LAYER_ID)) {
    map.addLayer({
      id: WORLD_PLACE_AREA_OUTER_LAYER_ID,
      type: 'circle',
      source: WORLD_PLACE_SOURCE_ID,
      minzoom: 2.75,
      filter: ['!', ['has', 'point_count']],
      layout: { visibility },
      paint: {
        'circle-color': colors.area,
        'circle-radius': [
          'interpolate', ['exponential', 2], ['zoom'],
          2.75, 2,
          3.5, 5,
          4, 10,
          5, 20,
          6, 38,
          7, 68,
          9, 104,
          12, 132,
        ],
        'circle-opacity': [
          'interpolate', ['linear'], ['zoom'],
          2.75, 0,
          3.45, 0.1,
          4.15, 0.22,
          7, 0.28,
          12, 0.22,
        ],
        'circle-blur': 1,
      },
    }, beforeId)
  }

  if (!map.getLayer(WORLD_PLACE_AREA_MIDDLE_LAYER_ID)) {
    map.addLayer({
      id: WORLD_PLACE_AREA_MIDDLE_LAYER_ID,
      type: 'circle',
      source: WORLD_PLACE_SOURCE_ID,
      minzoom: 2.75,
      filter: ['!', ['has', 'point_count']],
      layout: { visibility },
      paint: {
        'circle-color': colors.area,
        'circle-radius': [
          'interpolate', ['exponential', 2], ['zoom'],
          2.75, 2,
          3.5, 4,
          4, 8,
          5, 16,
          6, 30,
          7, 52,
          9, 82,
          12, 104,
        ],
        'circle-opacity': [
          'interpolate', ['linear'], ['zoom'],
          2.75, 0,
          3.45, 0.14,
          4.15, 0.28,
          7, 0.36,
          12, 0.3,
        ],
        'circle-blur': 0.88,
      },
    }, beforeId)
  }

  if (!map.getLayer(WORLD_PLACE_AREA_CORE_LAYER_ID)) {
    map.addLayer({
      id: WORLD_PLACE_AREA_CORE_LAYER_ID,
      type: 'circle',
      source: WORLD_PLACE_SOURCE_ID,
      filter: ['!', ['has', 'point_count']],
      layout: { visibility },
      paint: {
        'circle-color': colors.areaCore,
        'circle-radius': [
          'interpolate', ['exponential', 2], ['zoom'],
          0, 7,
          2.75, 8,
          4, 10,
          5, 12,
          6, 22,
          7, 36,
          9, 54,
          12, 68,
        ],
        'circle-opacity': [
          'interpolate', ['linear'], ['zoom'],
          0, 0.95,
          2.75, 0.9,
          4.15, 0.7,
          7, 0.52,
          12, 0.42,
        ],
        'circle-blur': [
          'interpolate', ['linear'], ['zoom'],
          0, 0.2,
          2.75, 0.25,
          4.15, 0.45,
          7, 0.65,
        ],
      },
    }, WORLD_PLACE_CLUSTER_LAYER_ID)
  }
}

export function updateWorldPlaceData(map: maplibregl.Map, data: WorldPlaceFeatureCollection): void {
  map.getSource<maplibregl.GeoJSONSource>(WORLD_PLACE_SOURCE_ID)?.setData(data)
}

export function updateWorldPlaceVisibility(map: maplibregl.Map, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none'
  for (const layerId of WORLD_PLACE_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visibility)
    }
  }
}

export function updateWorldPlaceColors(map: maplibregl.Map, colors: WorldPlaceColors): void {
  setPaintPropertyWhenPresent(map, WORLD_PLACE_CLUSTER_LAYER_ID, 'circle-color', colors.cluster)
  setPaintPropertyWhenPresent(map, WORLD_PLACE_CLUSTER_LAYER_ID, 'circle-stroke-color', colors.clusterBorder)
  setPaintPropertyWhenPresent(map, WORLD_PLACE_CLUSTER_COUNT_LAYER_ID, 'text-color', colors.clusterText)
  setPaintPropertyWhenPresent(map, WORLD_PLACE_AREA_OUTER_LAYER_ID, 'circle-color', colors.area)
  setPaintPropertyWhenPresent(map, WORLD_PLACE_AREA_MIDDLE_LAYER_ID, 'circle-color', colors.area)
  setPaintPropertyWhenPresent(map, WORLD_PLACE_AREA_CORE_LAYER_ID, 'circle-color', colors.areaCore)
}

export function bindWorldPlaceInteractions(
  map: maplibregl.Map,
  onSelectPlace: (cityId: string) => void,
): () => void {
  const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 14 })
  const showPointer = () => {
    map.getCanvas().style.cursor = 'pointer'
  }
  const hidePointer = () => {
    map.getCanvas().style.cursor = ''
  }
  const showPlacePopup = (event: maplibregl.MapLayerMouseEvent) => {
    showPointer()
    const feature = event.features?.[0]
    const coordinate = pointCoordinates(feature)
    const cityName = stringProperty(feature, 'cityName')
    const countryName = stringProperty(feature, 'countryName')
    const visitCount = numberProperty(feature, 'visitCount')
    if (!coordinate || !cityName || !countryName || visitCount === null) {
      return
    }

    const content = document.createElement('div')
    const city = document.createElement('strong')
    city.textContent = `${cityName}, ${countryName}`
    const visits = document.createElement('span')
    visits.textContent = `${visitCount} ${visitCount === 1 ? 'visit' : 'visits'}`
    content.append(city, visits)
    popup.setDOMContent(content).setLngLat(coordinate).addTo(map)
  }
  const hidePlacePopup = () => {
    hidePointer()
    popup.remove()
  }
  const selectPlace = (event: maplibregl.MapLayerMouseEvent) => {
    const cityId = stringProperty(event.features?.[0], 'cityId')
    if (cityId) {
      onSelectPlace(cityId)
    }
  }
  const expandCluster = (event: maplibregl.MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    const coordinate = pointCoordinates(feature)
    const clusterId = numberProperty(feature, 'cluster_id')
    const source = map.getSource<maplibregl.GeoJSONSource>(WORLD_PLACE_SOURCE_ID)
    if (!coordinate || clusterId === null || !source) {
      return
    }

    void source.getClusterExpansionZoom(clusterId)
      .then((zoom) => {
        if (map.getSource(WORLD_PLACE_SOURCE_ID) === source) {
          map.easeTo(flatCameraOptions({ center: coordinate, zoom }))
        }
      })
      .catch(() => undefined)
  }

  map.on('mouseenter', WORLD_PLACE_INTERACTIVE_LAYER_IDS, showPlacePopup)
  map.on('mouseleave', WORLD_PLACE_INTERACTIVE_LAYER_IDS, hidePlacePopup)
  map.on('click', WORLD_PLACE_INTERACTIVE_LAYER_IDS, selectPlace)
  map.on('mouseenter', WORLD_PLACE_CLUSTER_LAYER_ID, showPointer)
  map.on('mouseleave', WORLD_PLACE_CLUSTER_LAYER_ID, hidePointer)
  map.on('click', WORLD_PLACE_CLUSTER_LAYER_ID, expandCluster)

  return () => {
    map.off('mouseenter', WORLD_PLACE_INTERACTIVE_LAYER_IDS, showPlacePopup)
    map.off('mouseleave', WORLD_PLACE_INTERACTIVE_LAYER_IDS, hidePlacePopup)
    map.off('click', WORLD_PLACE_INTERACTIVE_LAYER_IDS, selectPlace)
    map.off('mouseenter', WORLD_PLACE_CLUSTER_LAYER_ID, showPointer)
    map.off('mouseleave', WORLD_PLACE_CLUSTER_LAYER_ID, hidePointer)
    map.off('click', WORLD_PLACE_CLUSTER_LAYER_ID, expandCluster)
    popup.remove()
    hidePointer()
  }
}

export function removeWorldPlaceLayers(map: maplibregl.Map): void {
  for (const layerId of [...WORLD_PLACE_LAYER_IDS].reverse()) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
    }
  }
  if (map.getSource(WORLD_PLACE_SOURCE_ID)) {
    map.removeSource(WORLD_PLACE_SOURCE_ID)
  }
}

function setPaintPropertyWhenPresent(
  map: maplibregl.Map,
  layerId: string,
  property: WorldPlacePaintProperty,
  value: string,
): void {
  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, property, value)
  }
}

function stringProperty(feature: maplibregl.MapGeoJSONFeature | undefined, property: string): string | null {
  const value = feature?.properties[property]
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberProperty(feature: maplibregl.MapGeoJSONFeature | undefined, property: string): number | null {
  const value = feature?.properties[property]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function pointCoordinates(feature: maplibregl.MapGeoJSONFeature | undefined): [number, number] | null {
  if (feature?.geometry.type !== 'Point') {
    return null
  }
  const [longitude, latitude] = feature.geometry.coordinates
  return typeof longitude === 'number' && typeof latitude === 'number'
    ? [longitude, latitude]
    : null
}
