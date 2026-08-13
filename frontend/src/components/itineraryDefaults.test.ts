import { describe, expect, it } from 'vitest'
import { defaultCountryCodeForTrip } from './itineraryDefaults'
import type { Country, Trip } from '../types/travel'

const countries: Country[] = [
  { code: 'FR', name: 'France' },
  { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' },
]

function trip(name: string, countryCodes: string[] = []): Trip {
  return {
    id: 'trip-id',
    name,
    startDate: null,
    endDate: null,
    stops: countryCodes.map((countryCode, index) => ({
      id: `stop-${index}`,
      position: index + 1,
      city: {
        id: `city-${index}`,
        name: `City ${index}`,
        latitude: null,
        longitude: null,
        country: { code: countryCode, name: countryCode },
      },
    })),
  }
}

describe('defaultCountryCodeForTrip', () => {
  it('uses the consistent country of existing stops before the trip name', () => {
    expect(defaultCountryCodeForTrip(trip('France and Italy', ['IT', 'IT']), countries)).toBe('IT')
  })

  it('uses a supported country or known supported city in an empty trip name', () => {
    expect(defaultCountryCodeForTrip(trip('Italy 2026'), countries)).toBe('IT')
    expect(defaultCountryCodeForTrip(trip('Rome weekend'), countries)).toBe('IT')
  })

  it('falls back to the trip name when stops do not consistently identify a country', () => {
    expect(defaultCountryCodeForTrip(trip('Japan', ['IT', 'FR']), countries)).toBe('JP')
  })

  it('leaves the choice empty when no supported country can be inferred', () => {
    expect(defaultCountryCodeForTrip(trip('Summer plans'), countries)).toBe('')
    expect(defaultCountryCodeForTrip(trip('Rome'), countries.filter((country) => country.code !== 'IT'))).toBe('')
  })
})
