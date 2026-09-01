import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  applyBasemapPalette,
  basemapLabelInsertionLayerId,
  configureBasemapHierarchy,
  discoverBasemapLayers,
} from './basemapStyle'

const styleLayers = [
  { id: 'background', type: 'background' },
  { id: 'natural_earth', type: 'raster', source: 'ne2_shaded' },
  { id: 'water', type: 'fill', 'source-layer': 'water' },
  { id: 'wood', type: 'fill', 'source-layer': 'landcover' },
  { id: 'park_outline', type: 'line', 'source-layer': 'park' },
  { id: 'boundary_2', type: 'line', 'source-layer': 'boundary' },
  { id: 'boundary_3', type: 'line', 'source-layer': 'boundary' },
  { id: 'road_motorway', type: 'line', 'source-layer': 'transportation' },
  { id: 'road_minor', type: 'line', 'source-layer': 'transportation' },
  { id: 'road_area_pattern', type: 'fill', 'source-layer': 'transportation' },
  { id: 'highway-name-major', type: 'symbol', 'source-layer': 'transportation_name' },
  { id: 'poi_transit', type: 'symbol', 'source-layer': 'poi' },
  {
    id: 'renamed-or-localized-country-layer',
    type: 'symbol',
    'source-layer': 'place',
    filter: ['==', 'class', 'country'],
  },
  { id: 'region-caption', type: 'symbol', 'source-layer': 'place', filter: ['==', 'class', 'state'] },
  { id: 'settlement-caption', type: 'symbol', 'source-layer': 'place', filter: ['==', 'class', 'city'] },
  { id: 'local-caption', type: 'symbol', 'source-layer': 'place', filter: ['==', 'class', 'town'] },
  { id: 'water_name_point_label', type: 'symbol', 'source-layer': 'water_name' },
]

const palette = {
  land: '#eee9dd',
  water: '#c7d9db',
  terrain: '#dde2d5',
  label: '#304955',
  labelMuted: '#65767b',
  labelHalo: '#f6f1e7',
  boundary: '#899597',
  road: '#c8b8a5',
  reliefOpacity: 0.28,
}

describe('OpenFreeMap basemap configuration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('classifies by style schema/filter semantics instead of requiring Liberty layer IDs', () => {
    const layers = discoverBasemapLayers(styleLayers)

    expect(layers.countryLabels).toEqual(['renamed-or-localized-country-layer'])
    expect(layers.cityLabels).toEqual(['settlement-caption'])
    expect(layers.majorRoads).toEqual(['road_motorway'])
    expect(layers.minorRoads).toEqual(['road_minor'])
    expect(layers.pois).toEqual(['poi_transit'])
  })

  it('reduces country-label dominance and progressively suppresses roads, POIs, and regional boundaries', () => {
    const fixture = mapFixture(styleLayers)
    const layers = discoverBasemapLayers(styleLayers)

    configureBasemapHierarchy(fixture.map, layers)

    expect(fixture.setLayoutProperty).toHaveBeenCalledWith(
      'renamed-or-localized-country-layer',
      'text-font',
      ['Noto Sans Regular'],
    )
    expect(fixture.setLayoutProperty).toHaveBeenCalledWith(
      'renamed-or-localized-country-layer',
      'text-size',
      expect.arrayContaining(['interpolate']),
    )
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      'renamed-or-localized-country-layer',
      'text-opacity',
      expect.arrayContaining(['interpolate']),
    )
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      'road_motorway',
      'line-opacity',
      expect.arrayContaining(['interpolate']),
    )
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      'road_minor',
      'line-opacity',
      expect.arrayContaining(['interpolate']),
    )
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      'poi_transit',
      'icon-opacity',
      expect.arrayContaining(['interpolate']),
    )
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      'park_outline',
      'line-opacity',
      expect.arrayContaining(['interpolate']),
    )
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      'boundary_3',
      'line-opacity',
      expect.arrayContaining(['interpolate']),
    )
  })

  it('applies one semantic palette to land, water, labels, boundaries, roads, and relief', () => {
    const fixture = mapFixture(styleLayers)
    applyBasemapPalette(fixture.map, discoverBasemapLayers(styleLayers), palette)

    expect(fixture.setPaintProperty).toHaveBeenCalledWith('background', 'background-color', palette.land)
    expect(fixture.setPaintProperty).toHaveBeenCalledWith('water', 'fill-color', palette.water)
    expect(fixture.setPaintProperty).toHaveBeenCalledWith('wood', 'fill-color', palette.terrain)
    expect(fixture.setPaintProperty).toHaveBeenCalledWith('park_outline', 'line-color', palette.terrain)
    expect(fixture.setPaintProperty).toHaveBeenCalledWith('boundary_2', 'line-color', palette.boundary)
    expect(fixture.setPaintProperty).toHaveBeenCalledWith('road_motorway', 'line-color', palette.road)
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      'settlement-caption',
      'text-color',
      palette.label,
    )
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      'renamed-or-localized-country-layer',
      'text-color',
      palette.labelMuted,
    )
    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      'natural_earth',
      'raster-opacity',
      expect.arrayContaining(['interpolate']),
    )
  })

  it('gracefully ignores optional layer classes that the loaded style does not provide', () => {
    const fixture = mapFixture([{ id: 'background', type: 'background' }])
    const layers = discoverBasemapLayers([{ id: 'background', type: 'background' }])

    expect(() => configureBasemapHierarchy(fixture.map, layers)).not.toThrow()
    expect(() => applyBasemapPalette(fixture.map, layers, palette)).not.toThrow()
    expect(fixture.setPaintProperty).toHaveBeenCalledTimes(1)
  })

  it('finds only the final basemap label band, skipping custom symbols and interleaved opaque geometry', () => {
    expect(basemapLabelInsertionLayerId([
      { id: 'early-caption', type: 'symbol', 'source-layer': 'transportation_name' },
      { id: 'opaque-area', type: 'fill', 'source-layer': 'landcover' },
      { id: 'world-count', type: 'symbol' },
      { id: 'base-label', type: 'symbol', 'source-layer': 'place' },
    ])).toBe('base-label')
    expect(basemapLabelInsertionLayerId([
      { id: 'early-caption', type: 'symbol', 'source-layer': 'place' },
      { id: 'opaque-area', type: 'fill', 'source-layer': 'landcover' },
    ])).toBeUndefined()
    expect(basemapLabelInsertionLayerId([])).toBeUndefined()
  })
})

function mapFixture(layers: readonly { id: string; type?: string }[]) {
  const layerIds = new Set(layers.map((layer) => layer.id))
  const setPaintProperty = vi.fn()
  const setLayoutProperty = vi.fn()
  const map = {
    getLayer: (id: string) => layerIds.has(id) ? { id } : undefined,
    setPaintProperty,
    setLayoutProperty,
  } as unknown as MapLibreMap

  return { map, setPaintProperty, setLayoutProperty }
}
