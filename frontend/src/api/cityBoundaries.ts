import { request } from './client'
export interface CityBoundaryGeometry { type: 'MultiPolygon'; coordinates: number[][][][] }

export interface CityBoundaryResult {
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'TEMPORARILY_UNAVAILABLE'
  geometry: CityBoundaryGeometry | null
  stale: boolean
  retryAfterSeconds: number
}

export function getCityBoundary(cityId: string, signal: AbortSignal): Promise<CityBoundaryResult> {
  return request<CityBoundaryResult>(`/api/places/${encodeURIComponent(cityId)}/boundary`, { signal })
}
