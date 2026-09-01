import type * as maplibregl from 'maplibre-gl'
import type { BasemapPalette } from './mapTheme'

interface BasemapStyleLayer {
  id: string
  type?: string
  source?: string
  'source-layer'?: string
  filter?: unknown
}

export interface BasemapLayerIndex {
  backgrounds: string[]
  relief: string[]
  water: string[]
  terrain: string[]
  terrainLines: string[]
  boundaries: string[]
  majorRoads: string[]
  minorRoads: string[]
  roadAreas: string[]
  transportationLabels: string[]
  pois: string[]
  countryLabels: string[]
  stateLabels: string[]
  cityLabels: string[]
  localPlaceLabels: string[]
  waterLabels: string[]
}

const COUNTRY_LABEL_SIZE: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  0, 8,
  2, 9,
  4, 10.5,
  6, 11.5,
  8.5, 10.5,
]
const COUNTRY_LABEL_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  0, 0.44,
  2.5, 0.58,
  5, 0.42,
  7, 0.2,
  8.5, 0.05,
]
const STATE_LABEL_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  4.5, 0,
  6, 0.28,
  8, 0.2,
]
const CITY_LABEL_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  3, 0.08,
  4.5, 0.36,
  6.5, 0.74,
  9, 0.88,
]
const LOCAL_PLACE_LABEL_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  6, 0,
  8, 0.18,
  10, 0.65,
  13, 0.82,
]
const MAJOR_ROAD_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  4, 0,
  6, 0.06,
  8, 0.13,
  11, 0.26,
  14, 0.44,
]
const MINOR_ROAD_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  9, 0,
  11, 0.08,
  13, 0.22,
  16, 0.48,
]
const ROAD_AREA_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  12, 0,
  14, 0.12,
  17, 0.35,
]
const TRANSPORTATION_LABEL_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  9, 0,
  12, 0.08,
  14, 0.42,
  17, 0.65,
]
const POI_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  10, 0,
  13.5, 0,
  15, 0.28,
  17, 0.58,
]
const COUNTRY_BOUNDARY_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  0, 0.3,
  4, 0.5,
  8, 0.6,
]
const TERRAIN_LINE_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  5, 0,
  8, 0.12,
  12, 0.26,
  15, 0.38,
]
const REGIONAL_BOUNDARY_OPACITY: maplibregl.ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  5, 0,
  7, 0.22,
  10, 0.4,
]

export function discoverBasemapLayers(layers: readonly BasemapStyleLayer[]): BasemapLayerIndex {
  const index = emptyLayerIndex()

  for (const layer of layers) {
    const sourceLayer = layer['source-layer'] ?? ''

    if (layer.type === 'background') {
      index.backgrounds.push(layer.id)
    } else if (layer.type === 'raster' && layer.source === 'ne2_shaded') {
      index.relief.push(layer.id)
    } else if (layer.type === 'fill' && sourceLayer === 'water') {
      index.water.push(layer.id)
    } else if (layer.type === 'fill' && isTintableTerrainLayer(layer.id, sourceLayer)) {
      index.terrain.push(layer.id)
    } else if (layer.type === 'line' && ['park', 'landcover', 'landuse'].includes(sourceLayer)) {
      index.terrainLines.push(layer.id)
    } else if (layer.type === 'line' && sourceLayer === 'boundary') {
      index.boundaries.push(layer.id)
    } else if (layer.type === 'line' && sourceLayer === 'transportation') {
      const destination = isMinorTransportationLayer(layer.id) ? index.minorRoads : index.majorRoads
      destination.push(layer.id)
    } else if (layer.type === 'fill' && sourceLayer === 'transportation') {
      index.roadAreas.push(layer.id)
    } else if (layer.type === 'symbol' && sourceLayer === 'transportation_name') {
      index.transportationLabels.push(layer.id)
    } else if (layer.type === 'symbol' && ['poi', 'aerodrome_label'].includes(sourceLayer)) {
      index.pois.push(layer.id)
    } else if (layer.type === 'symbol' && sourceLayer === 'place') {
      classifyPlaceLabel(layer, index)
    } else if (layer.type === 'symbol' && sourceLayer.startsWith('water')) {
      index.waterLabels.push(layer.id)
    }
  }

  return index
}

export function configureBasemapHierarchy(map: maplibregl.Map, layers: BasemapLayerIndex): void {
  setLayout(map, layers.countryLabels, 'text-font', ['Noto Sans Regular'])
  setLayout(map, layers.countryLabels, 'text-size', COUNTRY_LABEL_SIZE)
  setPaint(map, layers.countryLabels, 'text-opacity', COUNTRY_LABEL_OPACITY)
  setPaint(map, layers.countryLabels, 'text-halo-width', 0.8)
  setPaint(map, layers.countryLabels, 'text-halo-blur', 0.35)

  setPaint(map, layers.stateLabels, 'text-opacity', STATE_LABEL_OPACITY)
  setPaint(map, layers.cityLabels, 'text-opacity', CITY_LABEL_OPACITY)
  setPaint(map, layers.localPlaceLabels, 'text-opacity', LOCAL_PLACE_LABEL_OPACITY)

  setPaint(map, layers.majorRoads, 'line-opacity', MAJOR_ROAD_OPACITY)
  setPaint(map, layers.minorRoads, 'line-opacity', MINOR_ROAD_OPACITY)
  setPaint(map, layers.roadAreas, 'fill-opacity', ROAD_AREA_OPACITY)
  setPaint(map, layers.transportationLabels, 'text-opacity', TRANSPORTATION_LABEL_OPACITY)
  setPaint(map, layers.transportationLabels, 'icon-opacity', TRANSPORTATION_LABEL_OPACITY)
  setPaint(map, layers.pois, 'text-opacity', POI_OPACITY)
  setPaint(map, layers.pois, 'icon-opacity', POI_OPACITY)
  setPaint(map, layers.terrainLines, 'line-opacity', TERRAIN_LINE_OPACITY)

  for (const layerId of layers.boundaries) {
    setPaintWhenPresent(
      map,
      layerId,
      'line-opacity',
      isRegionalBoundaryLayer(layerId) ? REGIONAL_BOUNDARY_OPACITY : COUNTRY_BOUNDARY_OPACITY,
    )
  }
}

export function applyBasemapPalette(
  map: maplibregl.Map,
  layers: BasemapLayerIndex,
  palette: BasemapPalette,
): void {
  setPaint(map, layers.backgrounds, 'background-color', palette.land)
  setPaint(map, layers.relief, 'raster-opacity', reliefOpacity(palette.reliefOpacity))
  setPaint(map, layers.water, 'fill-color', palette.water)
  setPaint(map, layers.terrain, 'fill-color', palette.terrain)
  setPaint(map, layers.terrainLines, 'line-color', palette.terrain)
  setPaint(map, layers.boundaries, 'line-color', palette.boundary)
  setPaint(map, [...layers.majorRoads, ...layers.minorRoads], 'line-color', palette.road)
  setPaint(map, layers.roadAreas, 'fill-color', palette.road)

  setTextPalette(map, layers.countryLabels, palette.labelMuted, palette.labelHalo)
  setTextPalette(map, layers.stateLabels, palette.labelMuted, palette.labelHalo)
  setTextPalette(map, layers.cityLabels, palette.label, palette.labelHalo)
  setTextPalette(map, layers.localPlaceLabels, palette.labelMuted, palette.labelHalo)
  setTextPalette(map, layers.waterLabels, palette.labelMuted, palette.labelHalo)
  setTextPalette(map, layers.transportationLabels, palette.labelMuted, palette.labelHalo)
  setTextPalette(map, layers.pois, palette.labelMuted, palette.labelHalo)
}

export function basemapLabelInsertionLayerId(layers: readonly BasemapStyleLayer[]): string | undefined {
  // Symbols can be interleaved with opaque geometry. Only the final label band is safe.
  let lastGeometryIndex = -1
  layers.forEach((layer, index) => {
    if (layer.type !== 'symbol' && (layer['source-layer'] || layer.type === 'background' || layer.type === 'raster')) {
      lastGeometryIndex = index
    }
  })
  return layers.slice(lastGeometryIndex + 1)
    .find((layer) => layer.type === 'symbol' && Boolean(layer['source-layer']))?.id
}

function emptyLayerIndex(): BasemapLayerIndex {
  return {
    backgrounds: [],
    relief: [],
    water: [],
    terrain: [],
    terrainLines: [],
    boundaries: [],
    majorRoads: [],
    minorRoads: [],
    roadAreas: [],
    transportationLabels: [],
    pois: [],
    countryLabels: [],
    stateLabels: [],
    cityLabels: [],
    localPlaceLabels: [],
    waterLabels: [],
  }
}

function classifyPlaceLabel(layer: BasemapStyleLayer, index: BasemapLayerIndex): void {
  const signature = `${layer.id} ${JSON.stringify(layer.filter ?? '')}`.toLowerCase()
  if (signature.includes('country')) {
    index.countryLabels.push(layer.id)
  } else if (signature.includes('state')) {
    index.stateLabels.push(layer.id)
  } else if (signature.includes('city')) {
    index.cityLabels.push(layer.id)
  } else {
    index.localPlaceLabels.push(layer.id)
  }
}

function isMinorTransportationLayer(id: string): boolean {
  return /(minor|service|path|track|rail|transit|pedestrian|steps|street)/i.test(id)
}

function isTintableTerrainLayer(id: string, sourceLayer: string): boolean {
  return sourceLayer === 'park'
    || sourceLayer === 'landuse'
    || (sourceLayer === 'landcover' && /(wood|grass|wetland)/i.test(id))
}

function isRegionalBoundaryLayer(id: string): boolean {
  return /boundary_(3|4|5|6)|regional/i.test(id)
}

function reliefOpacity(opacity: number): maplibregl.ExpressionSpecification {
  return [
    'interpolate', ['linear'], ['zoom'],
    0, opacity,
    3, opacity * 0.7,
    6, Math.min(opacity * 0.2, 0.04),
  ]
}

function setTextPalette(
  map: maplibregl.Map,
  layerIds: readonly string[],
  color: string,
  haloColor: string,
): void {
  setPaint(map, layerIds, 'text-color', color)
  setPaint(map, layerIds, 'text-halo-color', haloColor)
}

function setPaint(
  map: maplibregl.Map,
  layerIds: readonly string[],
  property: string,
  value: unknown,
): void {
  for (const layerId of layerIds) {
    setPaintWhenPresent(map, layerId, property, value)
  }
}

function setPaintWhenPresent(
  map: maplibregl.Map,
  layerId: string,
  property: string,
  value: unknown,
): void {
  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, property as never, value as never)
  }
}

function setLayout(
  map: maplibregl.Map,
  layerIds: readonly string[],
  property: string,
  value: unknown,
): void {
  for (const layerId of layerIds) {
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, property as never, value as never)
    }
  }
}
