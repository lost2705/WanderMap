import type * as maplibregl from 'maplibre-gl'
import { describe, expect, it, vi } from 'vitest'
import { countryFeatureFilter } from './mapData'
import {
  COUNTRY_HIGHLIGHT_LAYER_ID,
  COUNTRY_HIGHLIGHT_OPACITY,
  COUNTRY_HIGHLIGHT_SOURCE_ID,
  countryHighlightInsertionLayerId,
  ensureCountryHighlightLayer,
  isCountryBoundaryData,
  removeCountryHighlightLayer,
  updateCountryHighlightColor,
  updateCountryHighlightFilter,
} from './countryHighlightLayers'
import type { CountryBoundaryData } from './countryHighlightLayers'

const countryData: CountryBoundaryData = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { ISO_A2_EH: 'IT' },
    geometry: {
      type: 'Polygon',
      coordinates: [[[12, 42], [13, 42], [12, 43], [12, 42]]],
    },
  }],
}

describe('country highlight MapLibre layer', () => {
  it('adds the Natural Earth data once as a restrained fill below base transportation', () => {
    const fixture = mapFixture([
      { id: 'water', type: 'fill', 'source-layer': 'water' },
      { id: 'roads', type: 'line', 'source-layer': 'transportation' },
      { id: 'boundaries', type: 'line', 'source-layer': 'boundary' },
      { id: 'labels', type: 'symbol', 'source-layer': 'place' },
    ])

    ensureCountryHighlightLayer(fixture.map, countryData, ['IT'], '#df8a5f')

    expect(fixture.addSource).toHaveBeenCalledWith(COUNTRY_HIGHLIGHT_SOURCE_ID, {
      type: 'geojson',
      data: countryData,
    })
    expect(fixture.addLayer).toHaveBeenCalledTimes(1)
    expect(fixture.addLayer.mock.calls[0]?.[1]).toBe('roads')
    expect(fixture.addLayer.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      id: COUNTRY_HIGHLIGHT_LAYER_ID,
      type: 'fill',
      source: COUNTRY_HIGHLIGHT_SOURCE_ID,
      filter: countryFeatureFilter(['IT']),
      paint: {
        'fill-antialias': true,
        'fill-color': '#df8a5f',
        'fill-opacity': COUNTRY_HIGHLIGHT_OPACITY,
      },
    }))
    expect(JSON.stringify(fixture.addLayer.mock.calls[0]?.[0])).not.toContain('FR')
    expect(fixture.addLayer.mock.calls[0]?.[0]).not.toHaveProperty('paint.fill-outline-color')
  })

  it('uses the base boundary line as the fallback insertion point', () => {
    expect(countryHighlightInsertionLayerId([
      { id: 'land', type: 'fill', 'source-layer': 'landcover' },
      { id: 'admin', type: 'line', 'source-layer': 'boundary' },
      { id: 'places', type: 'symbol', 'source-layer': 'place' },
    ])).toBe('admin')
  })

  it('falls back to the first label when the style has no known road or boundary layer', () => {
    expect(countryHighlightInsertionLayerId([
      { id: 'background', type: 'background' },
      { id: 'places', type: 'symbol', 'source-layer': 'place' },
    ])).toBe('places')
    expect(countryHighlightInsertionLayerId([])).toBeUndefined()
  })

  it('does not recreate the source or layer when ensure is called again', () => {
    const fixture = mapFixture([])

    ensureCountryHighlightLayer(fixture.map, countryData, ['IT'], '#df8a5f')
    ensureCountryHighlightLayer(fixture.map, countryData, ['JP'], '#5f92a1')

    expect(fixture.addSource).toHaveBeenCalledTimes(1)
    expect(fixture.addLayer).toHaveBeenCalledTimes(1)
  })

  it('updates selected-country filters without rebuilding geometry', () => {
    const fixture = mapFixture([])
    ensureCountryHighlightLayer(fixture.map, countryData, ['IT'], '#df8a5f')

    updateCountryHighlightFilter(fixture.map, ['JP', 'US'])

    expect(fixture.setFilter).toHaveBeenCalledWith(
      COUNTRY_HIGHLIGHT_LAYER_ID,
      countryFeatureFilter(['JP', 'US']),
    )
    expect(fixture.addSource).toHaveBeenCalledTimes(1)
    expect(fixture.addLayer).toHaveBeenCalledTimes(1)
  })

  it('uses an empty non-matching filter when no country is selected', () => {
    const fixture = mapFixture([])
    ensureCountryHighlightLayer(fixture.map, countryData, ['IT'], '#df8a5f')

    updateCountryHighlightFilter(fixture.map, [])

    expect(fixture.setFilter).toHaveBeenCalledWith(
      COUNTRY_HIGHLIGHT_LAYER_ID,
      ['==', ['get', 'ISO_A2_EH'], ''],
    )
  })

  it('passes unknown persisted ISO codes through the same generic filter', () => {
    const fixture = mapFixture([])
    ensureCountryHighlightLayer(fixture.map, countryData, [], '#df8a5f')

    updateCountryHighlightFilter(fixture.map, ['ZZ'])

    expect(fixture.setFilter).toHaveBeenCalledWith(
      COUNTRY_HIGHLIGHT_LAYER_ID,
      countryFeatureFilter(['ZZ']),
    )
  })

  it('updates only the fill color when the active theme changes', () => {
    const fixture = mapFixture([])
    ensureCountryHighlightLayer(fixture.map, countryData, ['IT'], '#df8a5f')

    updateCountryHighlightColor(fixture.map, '#e18a62')

    expect(fixture.setPaintProperty).toHaveBeenCalledWith(
      COUNTRY_HIGHLIGHT_LAYER_ID,
      'fill-color',
      '#e18a62',
    )
    expect(fixture.addSource).toHaveBeenCalledTimes(1)
    expect(fixture.addLayer).toHaveBeenCalledTimes(1)
  })

  it('ignores updates when a failed boundary request left no layer', () => {
    const fixture = mapFixture([])

    updateCountryHighlightFilter(fixture.map, ['IT'])
    updateCountryHighlightColor(fixture.map, '#df8a5f')

    expect(fixture.setFilter).not.toHaveBeenCalled()
    expect(fixture.setPaintProperty).not.toHaveBeenCalled()
  })

  it('removes the layer before its source', () => {
    const fixture = mapFixture([])
    ensureCountryHighlightLayer(fixture.map, countryData, ['IT'], '#df8a5f')

    removeCountryHighlightLayer(fixture.map)

    expect(fixture.removeLayer).toHaveBeenCalledWith(COUNTRY_HIGHLIGHT_LAYER_ID)
    expect(fixture.removeSource).toHaveBeenCalledWith(COUNTRY_HIGHLIGHT_SOURCE_ID)
    expect(fixture.removeLayer.mock.invocationCallOrder[0])
      .toBeLessThan(fixture.removeSource.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER)
  })

  it('accepts polygon and multipolygon collections while rejecting malformed responses', () => {
    expect(isCountryBoundaryData(countryData)).toBe(true)
    expect(isCountryBoundaryData({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: null,
        geometry: { type: 'MultiPolygon', coordinates: [] },
      }],
    })).toBe(true)
    expect(isCountryBoundaryData({ type: 'FeatureCollection', features: [{ geometry: null }] })).toBe(false)
    expect(isCountryBoundaryData({ type: 'FeatureCollection', features: 'not-an-array' })).toBe(false)
  })
})

function mapFixture(styleLayers: Array<{ id: string; type?: string; 'source-layer'?: string }>) {
  let hasSource = false
  let hasLayer = false
  const addSource = vi.fn((_id: string, _specification: unknown) => { hasSource = true })
  const addLayer = vi.fn((_specification: { id: string }, _beforeId?: string) => { hasLayer = true })
  const removeLayer = vi.fn((_id: string) => { hasLayer = false })
  const removeSource = vi.fn((_id: string) => { hasSource = false })
  const setFilter = vi.fn((_id: string, _filter: unknown) => undefined)
  const setPaintProperty = vi.fn((_id: string, _property: string, _value: unknown) => undefined)
  const map = {
    getStyle: () => ({ layers: styleLayers }),
    getSource: () => hasSource ? {} : undefined,
    getLayer: () => hasLayer ? {} : undefined,
    addSource,
    addLayer,
    setFilter,
    setPaintProperty,
    removeLayer,
    removeSource,
  } as unknown as maplibregl.Map

  return {
    map,
    addSource,
    addLayer,
    setFilter,
    setPaintProperty,
    removeLayer,
    removeSource,
  }
}
