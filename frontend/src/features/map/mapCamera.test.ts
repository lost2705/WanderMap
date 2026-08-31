import { describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import {
  configureFlatMapInteractions,
  constrainAtlasCamera,
  FLAT_MAP_INTERACTION_OPTIONS,
  flatCameraOptions,
  worldOverviewCamera,
} from './mapCamera'

describe('flat map camera', () => {
  it('keeps pan, wheel zoom, keyboard navigation, and pinch zoom while disabling every rotation/pitch path', () => {
    expect(FLAT_MAP_INTERACTION_OPTIONS).toMatchObject({
      bearing: 0,
      pitch: 0,
      minPitch: 0,
      maxPitch: 0,
      dragPan: true,
      dragRotate: false,
      scrollZoom: true,
      keyboard: true,
      touchZoomRotate: true,
      touchPitch: false,
      pitchWithRotate: false,
    })
    expect(FLAT_MAP_INTERACTION_OPTIONS.transformCameraUpdate()).toEqual({ bearing: 0, pitch: 0 })

    const map = {
      dragRotate: { disable: vi.fn() },
      touchZoomRotate: { disableRotation: vi.fn() },
      touchPitch: { disable: vi.fn() },
      keyboard: { disableRotation: vi.fn() },
    } as unknown as MapLibreMap

    configureFlatMapInteractions(map)

    expect(map.dragRotate.disable).toHaveBeenCalledOnce()
    expect(map.touchZoomRotate.disableRotation).toHaveBeenCalledOnce()
    expect(map.touchPitch.disable).toHaveBeenCalledOnce()
    expect(map.keyboard.disableRotation).toHaveBeenCalledOnce()
  })

  it('forces programmatic camera operations back to north-up and zero pitch', () => {
    expect(flatCameraOptions({ center: [12, 42], zoom: 6, bearing: 30, pitch: 45 })).toEqual({
      center: [12, 42],
      zoom: 6,
      bearing: 0,
      pitch: 0,
    })
  })
})

describe('single-world atlas framing', () => {
  it('blocks the observed far-zoom drag into the dateline and Antarctic framing', () => {
    const overview = worldOverviewCamera(1072, 900)!
    // Captured in the browser: zoom stayed at its floor, but unrestricted drag
    // moved center [6,18] to [-6,-32.0945], exposing west=-180 and south=-85.0511.
    const update = constrainAtlasCamera({
      center: { lng: -6, lat: -32.094524209083524 }, zoom: overview.zoom,
    }, 1072, 900)
    expect(update.zoom).toBe(overview.zoom)
    expect(update.center?.[0]).toBeCloseTo(overview.center[0])
    expect(update.center?.[1]).toBeCloseTo(overview.center[1])
  })

  it.each([[1552, 1080], [1072, 900], [704, 768], [430, 932]])('keeps the entire far-zoom viewport envelope fixed after wheel/pan at %i×%i', (width, height) => {
    const overview = worldOverviewCamera(width, height)!
    for (const center of [{ lng: -179, lat: 80 }, { lng: 179, lat: -80 }, { lng: 0, lat: 27.729985852425372 }]) {
      const update = constrainAtlasCamera({ center, zoom: overview.zoom - 0.2 }, width, height)
      expect(update.zoom).toBe(overview.zoom)
      expect(update.center?.[0]).toBeCloseTo(overview.center[0])
      expect(update.center?.[1]).toBeCloseTo(overview.center[1])
      expect(update).toMatchObject({ bearing: 0, pitch: 0 })
    }
  })

  it('releases pan continuously above the floor and leaves regional/Journey cameras untouched', () => {
    const overview = worldOverviewCamera(1072, 900)!
    const next = { center: { lng: -100, lat: -50 }, zoom: overview.zoom + 0.000001 }
    const nearFloor = constrainAtlasCamera(next, 1072, 900)
    expect(nearFloor.center?.[0]).toBeCloseTo(6, 3)
    expect(nearFloor.center?.[1]).toBeCloseTo(18, 3)
    const halfway = constrainAtlasCamera({ ...next, zoom: overview.zoom + 0.5 }, 1072, 900)
    expect(halfway.center?.[0]).toBeLessThan(0)
    expect(halfway.center?.[1]).toBeLessThan(18)
    // The original camera passes through at regional scales, including Japan fit.
    for (const zoom of [overview.zoom + 1, 6, 12]) {
      expect(constrainAtlasCamera({ ...next, zoom }, 1072, 900)).toEqual({ bearing: 0, pitch: 0 })
    }
    expect(constrainAtlasCamera(next, 0, 0)).toEqual({ bearing: 0, pitch: 0 })
  })

  it.each([[1552, 1080], [1072, 900], [704, 768]])('frames the actual %i×%i map area, excluding the sidebar', (width, height) => {
    const camera = worldOverviewCamera(width, height)!
    const worldSize = 512 * 2 ** camera.zoom
    const halfLongitudeSpan = width / worldSize * 180
    expect(camera.center[0]).toBe(6)
    expect(camera.center[0] - halfLongitudeSpan).toBeGreaterThanOrEqual(-168 - 1e-9)
    expect(camera.center[0] + halfLongitudeSpan).toBeLessThanOrEqual(180 + 1e-9)
    expect(worldSize).toBeGreaterThanOrEqual(height)
    expect(camera).toMatchObject({ bearing: 0, pitch: 0 })
  })

  it('uses the deliberate latitude when space allows, and respects the single-world vertical constraint on tall canvases', () => {
    expect(worldOverviewCamera(1072, 900)?.center).toEqual([6, 18])
    expect(worldOverviewCamera(704, 768)?.center).toEqual([6, 0])
    expect(worldOverviewCamera(704, 768)?.zoom).toBeCloseTo(Math.log2(768 / 512))
    expect(worldOverviewCamera(390, 844)?.center).toEqual([6, 0])
  })

  it('ignores a temporarily zero-sized container', () => {
    expect(worldOverviewCamera(0, 900)).toBeNull()
    expect(worldOverviewCamera(1072, 0)).toBeNull()
  })
})
