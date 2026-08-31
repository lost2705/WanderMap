import type * as maplibregl from 'maplibre-gl'

export const FLAT_BEARING = 0
export const FLAT_PITCH = 0

// A single atlas sheet: crop the small western dateline sliver, not City data.
// Size against the map container (excluding the sidebar), not the browser window.
export const WORLD_ATLAS_LONGITUDE = 6
const WORLD_ATLAS_LONGITUDE_SPAN = 348 // -168° to +180° on a wide canvas
const WORLD_ATLAS_LATITUDE = 18
const MERCATOR_TILE_SIZE = 512

export function worldOverviewCamera(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return null
  }

  // With renderWorldCopies:false, MapLibre also requires one Mercator world
  // to cover the canvas vertically. Account for that before choosing the center.
  const worldSize = Math.max(width * 360 / WORLD_ATLAS_LONGITUDE_SPAN, height)
  const maximumLatitude = Math.atan(Math.sinh(Math.PI * (1 - height / worldSize))) * 180 / Math.PI
  return flatCameraOptions({
    center: [WORLD_ATLAS_LONGITUDE, Math.min(WORLD_ATLAS_LATITUDE, maximumLatitude)] as [number, number],
    zoom: Math.log2(worldSize / MERCATOR_TILE_SIZE),
  })
}

interface CameraPosition {
  center: { lng: number; lat: number }
  zoom: number
}

interface AtlasCameraUpdate {
  bearing: 0
  pitch: 0
  center?: [number, number]
  zoom?: number
}

// An overview camera alone is not a constraint: wheel anchors and drag can move
// its center back to the dateline/poles even while minZoom is unchanged.
// Hold the overview's visible envelope at the zoom floor, then release it to
// the native single-world extent over one zoom level. Local Journey fits and
// zoomed-in pan are therefore unaffected; no move-event correction is needed.
export function constrainAtlasCamera(next: CameraPosition, width: number, height: number): AtlasCameraUpdate {
  const overview = worldOverviewCamera(width, height)
  if (!overview || next.zoom >= overview.zoom + 1) {
    return flatCameraOptions({})
  }

  const zoom = Math.max(next.zoom, overview.zoom)
  const release = zoom - overview.zoom
  const overviewSize = MERCATOR_TILE_SIZE * 2 ** overview.zoom
  const worldSize = MERCATOR_TILE_SIZE * 2 ** zoom
  const halfWidth = width / (2 * worldSize)
  const halfHeight = height / (2 * worldSize)
  const overviewX = (overview.center[0] + 180) / 360
  const overviewY = mercatorY(overview.center[1])
  const west = (overviewX - width / (2 * overviewSize)) * (1 - release)
  const east = 1 - (1 - overviewX - width / (2 * overviewSize)) * (1 - release)
  const north = (overviewY - height / (2 * overviewSize)) * (1 - release)
  const south = 1 - (1 - overviewY - height / (2 * overviewSize)) * (1 - release)
  const x = clamp((next.center.lng + 180) / 360, west + halfWidth, east - halfWidth)
  const y = clamp(mercatorY(next.center.lat), north + halfHeight, south - halfHeight)

  return flatCameraOptions({
    center: [x * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI] as [number, number],
    zoom,
  })
}

function mercatorY(latitude: number): number {
  return (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export const FLAT_MAP_INTERACTION_OPTIONS = {
  bearing: FLAT_BEARING,
  pitch: FLAT_PITCH,
  minPitch: FLAT_PITCH,
  maxPitch: FLAT_PITCH,
  dragPan: true,
  dragRotate: false,
  scrollZoom: true,
  keyboard: true,
  touchZoomRotate: true,
  touchPitch: false,
  pitchWithRotate: false,
  rollEnabled: false,
  transformCameraUpdate: () => ({ bearing: FLAT_BEARING, pitch: FLAT_PITCH }),
} as const

export function configureFlatMapInteractions(map: maplibregl.Map): void {
  map.dragRotate.disable()
  map.touchZoomRotate.disableRotation()
  map.touchPitch.disable()
  map.keyboard.disableRotation()
}

export function flatCameraOptions<T extends object>(options: T): T & { bearing: 0; pitch: 0 } {
  return {
    ...options,
    bearing: FLAT_BEARING,
    pitch: FLAT_PITCH,
  }
}
