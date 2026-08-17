import { request } from './client'
import type { CitySearchResult } from '../types/travel'

export function searchCities(query: string, signal?: AbortSignal): Promise<CitySearchResult[]> {
  const parameters = new URLSearchParams({ q: query })
  return request<CitySearchResult[]>(`/api/cities/search?${parameters}`, { signal })
}
