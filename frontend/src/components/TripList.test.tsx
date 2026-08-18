// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TripMapOverview, TripSummary } from '../types/travel'
import { TripList } from './TripList'

const trips: TripSummary[] = [
  {
    id: 'japan',
    name: 'Japan 2026',
    startDate: '2026-04-05',
    endDate: '2026-04-18',
    description: 'Spring trip through Japan.',
    stopCount: 3,
  },
]

const overview: TripMapOverview = {
  visitedCountryCodes: ['JP'],
  memoryCount: 4,
  markers: [
    {
      tripId: 'japan',
      stopId: 'kyoto-stop',
      cityId: 'kyoto',
      position: 2,
      cityName: 'Kyoto',
      latitude: 35.0116,
      longitude: 135.7681,
      country: { code: 'JP', name: 'Japan' },
    },
    {
      tripId: 'japan',
      stopId: 'tokyo-stop',
      cityId: 'tokyo',
      position: 1,
      cityName: 'Tokyo',
      latitude: 35.6762,
      longitude: 139.6503,
      country: { code: 'JP', name: 'Japan' },
    },
    {
      tripId: 'japan',
      stopId: 'tokyo-return',
      cityId: 'tokyo',
      position: 3,
      cityName: 'Tokyo',
      latitude: 35.6762,
      longitude: 139.6503,
      country: { code: 'JP', name: 'Japan' },
    },
  ],
}

afterEach(cleanup)

describe('TripList journey index', () => {
  it('shows real journey metadata and unique place names in itinerary order', () => {
    render(
      <TripList
        isLoading={false}
        overview={overview}
        selectedTripId={null}
        trips={trips}
        onCreate={() => undefined}
        onSelect={() => undefined}
      />,
    )

    const journey = screen.getByRole('button', { name: 'Japan 2026, 3 places' })
    expect(journey.getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByText('Apr 5, 2026 – Apr 18, 2026')).toBeTruthy()
    expect(screen.getByText('Tokyo · Kyoto')).toBeTruthy()
    expect(screen.getByText('Spring trip through Japan.')).toBeTruthy()
    expect(screen.getByLabelText('Travel atlas summary').textContent)
      .toBe('Places2Countries1Journeys1Memories4')
  })

  it('keeps journey selection and creation as explicit button actions', () => {
    const onSelect = vi.fn()
    const onCreate = vi.fn()
    render(
      <TripList
        isLoading={false}
        overview={overview}
        selectedTripId={null}
        trips={trips}
        onCreate={onCreate}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Japan 2026, 3 places' }))
    fireEvent.click(screen.getByRole('button', { name: 'Create a new journey' }))

    expect(onSelect).toHaveBeenCalledWith('japan')
    expect(onCreate).toHaveBeenCalledTimes(1)
  })

  it('shows a truthful zeroed atlas summary for an empty global state', () => {
    render(
      <TripList
        isLoading={false}
        overview={{ visitedCountryCodes: [], markers: [], memoryCount: 0 }}
        selectedTripId={null}
        trips={[]}
        onCreate={() => undefined}
        onSelect={() => undefined}
      />,
    )

    expect(screen.getByText('Your atlas is waiting for its first journey.')).toBeTruthy()
    expect(screen.getByLabelText('Travel atlas summary').textContent)
      .toBe('Places0Countries0Journeys0Memories0')
  })
})
