import { request } from './client'
import type { TravelProfile } from '../types/travel'

export function getTravelProfile(): Promise<TravelProfile> {
  return request<TravelProfile>('/api/travel-profile')
}
