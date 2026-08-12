import { request } from './client'
import type { Country } from '../types/travel'

export function listCountries(): Promise<Country[]> {
  return request<Country[]>('/api/countries')
}
