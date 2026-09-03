// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../api/auth'
import type { TravelProfile } from '../types/travel'
import { TravelProfileView } from './TravelProfileView'

const user: CurrentUser = { id: 'alice', displayName: 'Alice Atlas', email: 'alice@example.com' }
const profile: TravelProfile = {
  journeyCount: 5,
  visitCount: 12,
  uniqueCityCount: 9,
  countryCount: 4,
  travelDayCount: 31,
  memoryCount: 7,
  photoCount: 26,
  revisitedCityCount: 2,
  revisitedCountryCount: 1,
  highlights: {
    mostVisitedCity: {
      cityId: 'rome',
      cityName: 'Rome',
      countryCode: 'IT',
      countryName: 'Italy',
      visitCount: 3,
    },
    mostVisitedCountry: { countryCode: 'IT', countryName: 'Italy', visitCount: 5 },
    longestJourney: { journeyId: 'summer', journeyName: 'Italian summer', dayCount: 14 },
    mostRecentJourney: { journeyId: 'japan', journeyName: 'Japan 2026', startDate: '2026-04-05' },
    mostMemoryRichJourney: { journeyId: 'summer', journeyName: 'Italian summer', memoryCount: 4 },
  },
  achievements: [{
    code: 'FIRST_JOURNEY',
    title: 'First chapter',
    description: 'Create your first Journey.',
    category: 'journeys',
    unlocked: true,
    currentValue: 5,
    targetValue: 1,
    progressPercent: 100,
  }, {
    code: 'COUNTRY_EXPLORER',
    title: 'Country explorer',
    description: 'Visit five countries.',
    category: 'exploration',
    unlocked: false,
    currentValue: 4,
    targetValue: 5,
    progressPercent: 80,
  }],
}

afterEach(cleanup)

describe('TravelProfileView', () => {
  it('renders identity, hierarchical metrics, highlights, and accessible achievement progress', () => {
    renderView()

    expect(screen.getByRole('heading', { name: 'Travel Profile' })).toBeTruthy()
    expect(screen.getByText('Alice Atlas')).toBeTruthy()
    expect(screen.getByText('alice@example.com')).toBeTruthy()
    expect(screen.getByText('Countries').nextElementSibling?.textContent).toBe('4')
    expect(screen.getByText('Travel days').nextElementSibling?.textContent).toBe('31')
    expect(screen.getByText('Rome, Italy')).toBeTruthy()
    expect(screen.getByText('Japan 2026')).toBeTruthy()

    const achievements = screen.getByRole('list')
    expect(within(achievements).getByText('First chapter')).toBeTruthy()
    expect(within(achievements).getByText('Unlocked')).toBeTruthy()
    expect(within(achievements).getByText('Country explorer')).toBeTruthy()
    expect(within(achievements).getByText('In progress')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'First chapter progress' }).getAttribute('aria-valuenow'))
      .toBe('100')
    expect(screen.getByRole('progressbar', { name: 'Country explorer progress' }).getAttribute('aria-valuenow'))
      .toBe('80')
  })

  it('renders a truthful empty profile with locked zero progress', () => {
    renderView({
      profile: {
        ...profile,
        journeyCount: 0,
        visitCount: 0,
        uniqueCityCount: 0,
        countryCount: 0,
        travelDayCount: 0,
        memoryCount: 0,
        photoCount: 0,
        revisitedCityCount: 0,
        revisitedCountryCount: 0,
        highlights: {
          mostVisitedCity: null,
          mostVisitedCountry: null,
          longestJourney: null,
          mostRecentJourney: null,
          mostMemoryRichJourney: null,
        },
        achievements: [{
          ...profile.achievements[1]!,
          currentValue: 0,
          progressPercent: 0,
        }],
      },
    })

    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText('Your travel highlights will appear after your first Journey.')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Country explorer progress' }).getAttribute('aria-valuenow'))
      .toBe('0')
  })

  it('keeps profile failures recoverable and Back to map available', () => {
    const onBack = vi.fn()
    const onRetry = vi.fn()
    renderView({ profile: null, error: 'Travel profile is temporarily unavailable.', onBack, onRetry })

    expect(screen.getByRole('alert').textContent).toContain('Travel profile is temporarily unavailable.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to map' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

function renderView(overrides: Partial<React.ComponentProps<typeof TravelProfileView>> = {}) {
  return render(
    <TravelProfileView
      error={null}
      isLoading={false}
      profile={profile}
      user={user}
      onBack={vi.fn()}
      onRetry={vi.fn()}
      {...overrides}
    />,
  )
}
