import { request } from './client'
import type { PlaceDetails } from '../types/travel'

export function getPlaceDetails(cityId: string, signal?: AbortSignal): Promise<PlaceDetails> {
  return request<PlaceDetails>(`/api/places/${cityId}`, { signal })
}
