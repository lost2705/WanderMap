import type { Country, Trip } from '../types/travel'

const COUNTRY_CODE_BY_SUPPORTED_CITY: Record<string, string> = {
  amsterdam: 'NL',
  barcelona: 'ES',
  berlin: 'DE',
  bologna: 'IT',
  florence: 'IT',
  lisbon: 'PT',
  london: 'GB',
  lyon: 'FR',
  madrid: 'ES',
  milan: 'IT',
  naples: 'IT',
  'new york': 'US',
  paris: 'FR',
  prague: 'CZ',
  rome: 'IT',
  'san francisco': 'US',
  sydney: 'AU',
  tokyo: 'JP',
  toronto: 'CA',
  venice: 'IT',
  vienna: 'AT',
}

export function defaultCountryCodeForTrip(trip: Trip, countries: Country[]): string {
  const supportedCountryCodes = new Set(countries.map((country) => country.code))
  const stopCountryCodes = new Set(trip.stops.map((stop) => stop.city.country.code))

  if (stopCountryCodes.size === 1) {
    const [countryCode] = stopCountryCodes
    if (countryCode && supportedCountryCodes.has(countryCode)) {
      return countryCode
    }
  }

  return countryCodeFromTripName(trip.name, countries)
}

function countryCodeFromTripName(tripName: string, countries: Country[]): string {
  const normalizedTripName = normalize(tripName)
  if (!normalizedTripName) {
    return ''
  }

  const country = [...countries]
    .sort((left, right) => right.name.length - left.name.length)
    .find((candidate) => includesPhrase(normalizedTripName, normalize(candidate.name)))
  if (country) {
    return country.code
  }

  const city = Object.keys(COUNTRY_CODE_BY_SUPPORTED_CITY)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => includesPhrase(normalizedTripName, candidate))
  const cityCountryCode = city ? COUNTRY_CODE_BY_SUPPORTED_CITY[city] : undefined
  return cityCountryCode && countries.some((country) => country.code === cityCountryCode) ? cityCountryCode : ''
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .toLocaleLowerCase()
}

function includesPhrase(value: string, phrase: string): boolean {
  return phrase !== '' && ` ${value} `.includes(` ${phrase} `)
}
