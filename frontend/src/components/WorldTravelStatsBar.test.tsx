// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { TravelProfile } from '../types/travel'
import { WorldTravelStatsBar } from './WorldTravelStatsBar'

const profile: TravelProfile = {
  journeyCount: 3,
  visitCount: 8,
  uniqueCityCount: 5,
  countryCount: 4,
  travelDayCount: 17,
  memoryCount: 2,
  photoCount: 11,
  revisitedCityCount: 2,
  revisitedCountryCount: 1,
  highlights: {
    mostVisitedCity: null,
    mostVisitedCountry: null,
    longestJourney: null,
    mostRecentJourney: null,
    mostMemoryRichJourney: null,
  },
  achievements: [],
}

afterEach(cleanup)

describe('WorldTravelStatsBar', () => {
  it('renders only the five World headline metrics in an accessible description list', () => {
    render(<WorldTravelStatsBar profile={profile} />)

    expect(screen.getByRole('region', { name: 'Travel statistics' })).toBeTruthy()
    expect(screen.getByLabelText('World travel statistics').textContent)
      .toBe('Countries4Places5Journeys3Travel days17Memories2')
    expect(screen.queryByText('Visits')).toBeNull()
    expect(screen.queryByText('Photos')).toBeNull()
    expect(screen.queryByText('Returned to')).toBeNull()
  })

  it('stays hidden while loading and for an empty profile', () => {
    const view = render(<WorldTravelStatsBar profile={null} />)
    expect(screen.queryByRole('region', { name: 'Travel statistics' })).toBeNull()

    view.rerender(<WorldTravelStatsBar profile={{
      journeyCount: 0,
      visitCount: 0,
      uniqueCityCount: 0,
      countryCount: 0,
      travelDayCount: 0,
      memoryCount: 0,
      photoCount: 0,
      revisitedCityCount: 0,
      revisitedCountryCount: 0,
      highlights: profile.highlights,
      achievements: [],
    }} />)
    expect(screen.queryByRole('region', { name: 'Travel statistics' })).toBeNull()
  })
})
