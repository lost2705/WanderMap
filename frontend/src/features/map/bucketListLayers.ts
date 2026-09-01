import { Popup } from 'maplibre-gl'
import type * as maplibregl from 'maplibre-gl'
import type { BucketListFeatureCollection } from './mapData'
import { WORLD_PLACE_CLUSTER_LAYER_ID } from './worldPlaceLayers'

export const BUCKET_LIST_SOURCE_ID = 'bucket-list-places'
export const BUCKET_LIST_HALO_LAYER_ID = 'bucket-list-place-halo'
export const BUCKET_LIST_RING_LAYER_ID = 'bucket-list-place-ring'

const BUCKET_LIST_LAYER_IDS = [BUCKET_LIST_HALO_LAYER_ID, BUCKET_LIST_RING_LAYER_ID] as const

export interface BucketListColors {
  ring: string
  halo: string
  fill: string
}

type BucketListPaintProperty = 'circle-color' | 'circle-stroke-color'

export function ensureBucketListLayers(
  map: maplibregl.Map,
  data: BucketListFeatureCollection,
  colors: BucketListColors,
  visible: boolean,
): void {
  if (!map.getSource(BUCKET_LIST_SOURCE_ID)) {
    map.addSource(BUCKET_LIST_SOURCE_ID, { type: 'geojson', data })
  }

  const visibility = visible ? 'visible' : 'none'
  const beforeId = map.getLayer(WORLD_PLACE_CLUSTER_LAYER_ID) ? WORLD_PLACE_CLUSTER_LAYER_ID : undefined
  if (!map.getLayer(BUCKET_LIST_HALO_LAYER_ID)) {
    map.addLayer({
      id: BUCKET_LIST_HALO_LAYER_ID,
      type: 'circle',
      source: BUCKET_LIST_SOURCE_ID,
      layout: { visibility },
      paint: {
        'circle-color': colors.halo,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 5, 11, 10, 15],
        'circle-opacity': 0.48,
        'circle-blur': 0.35,
      },
    }, beforeId)
  }
  if (!map.getLayer(BUCKET_LIST_RING_LAYER_ID)) {
    map.addLayer({
      id: BUCKET_LIST_RING_LAYER_ID,
      type: 'circle',
      source: BUCKET_LIST_SOURCE_ID,
      layout: { visibility },
      paint: {
        'circle-color': colors.fill,
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 5, 6, 10, 8],
        'circle-opacity': 0.72,
        'circle-stroke-color': colors.ring,
        'circle-stroke-width': 2.5,
        'circle-stroke-opacity': 1,
      },
    }, beforeId)
  }
}

export function updateBucketListData(map: maplibregl.Map, data: BucketListFeatureCollection): void {
  map.getSource<maplibregl.GeoJSONSource>(BUCKET_LIST_SOURCE_ID)?.setData(data)
}

export function updateBucketListVisibility(map: maplibregl.Map, visible: boolean): void {
  const visibility = visible ? 'visible' : 'none'
  for (const layerId of BUCKET_LIST_LAYER_IDS) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visibility)
    }
  }
}

export function updateBucketListColors(map: maplibregl.Map, colors: BucketListColors): void {
  setPaintWhenPresent(map, BUCKET_LIST_HALO_LAYER_ID, 'circle-color', colors.halo)
  setPaintWhenPresent(map, BUCKET_LIST_RING_LAYER_ID, 'circle-color', colors.fill)
  setPaintWhenPresent(map, BUCKET_LIST_RING_LAYER_ID, 'circle-stroke-color', colors.ring)
}

export function bindBucketListInteractions(
  map: maplibregl.Map,
  onSelectPlace: (cityId: string) => void,
): () => void {
  const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 14 })
  const show = (event: maplibregl.MapLayerMouseEvent) => {
    map.getCanvas().style.cursor = 'pointer'
    const feature = event.features?.[0]
    const coordinate = pointCoordinates(feature)
    const cityName = stringProperty(feature, 'cityName')
    const countryName = stringProperty(feature, 'countryName')
    if (!coordinate || !cityName || !countryName) {
      return
    }
    const content = document.createElement('div')
    const city = document.createElement('strong')
    city.textContent = `${cityName}, ${countryName}`
    const state = document.createElement('span')
    state.textContent = feature?.properties.visited ? 'Want to visit · Visited too' : 'Want to visit'
    content.append(city, state)
    popup.setDOMContent(content).setLngLat(coordinate).addTo(map)
  }
  const hide = () => {
    map.getCanvas().style.cursor = ''
    popup.remove()
  }
  const select = (event: maplibregl.MapLayerMouseEvent) => {
    const cityId = stringProperty(event.features?.[0], 'cityId')
    if (cityId) {
      onSelectPlace(cityId)
    }
  }
  map.on('mouseenter', BUCKET_LIST_RING_LAYER_ID, show)
  map.on('mouseleave', BUCKET_LIST_RING_LAYER_ID, hide)
  map.on('click', BUCKET_LIST_RING_LAYER_ID, select)
  return () => {
    map.off('mouseenter', BUCKET_LIST_RING_LAYER_ID, show)
    map.off('mouseleave', BUCKET_LIST_RING_LAYER_ID, hide)
    map.off('click', BUCKET_LIST_RING_LAYER_ID, select)
    popup.remove()
    map.getCanvas().style.cursor = ''
  }
}

export function removeBucketListLayers(map: maplibregl.Map): void {
  for (const layerId of [...BUCKET_LIST_LAYER_IDS].reverse()) {
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId)
    }
  }
  if (map.getSource(BUCKET_LIST_SOURCE_ID)) {
    map.removeSource(BUCKET_LIST_SOURCE_ID)
  }
}

function setPaintWhenPresent(
  map: maplibregl.Map,
  layerId: string,
  property: BucketListPaintProperty,
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

function pointCoordinates(feature: maplibregl.MapGeoJSONFeature | undefined): [number, number] | null {
  if (feature?.geometry.type !== 'Point') {
    return null
  }
  const [longitude, latitude] = feature.geometry.coordinates
  return typeof longitude === 'number' && typeof latitude === 'number'
    ? [longitude, latitude]
    : null
}
