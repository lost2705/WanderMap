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
  it('deduplicates a repeated cityId and preserves its first itinerary position', () => {
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
  })

  it('keeps different cityIds with the same name and disambiguates them by country', () => {
    const florenceTrip: TripSummary = {
      id: 'florence-trip',
      name: 'Two Florences',
      startDate: null,
      endDate: null,
      description: null,
      stopCount: 3,
    }
    const florenceOverview: TripMapOverview = {
      visitedCountryCodes: ['IT', 'US', 'RU'],
      memoryCount: 0,
      markers: [
        {
          tripId: 'florence-trip',
          stopId: 'moscow-stop',
          cityId: 'moscow',
          position: 3,
          cityName: 'Moscow',
          latitude: 55.7558,
          longitude: 37.6173,
          country: { code: 'RU', name: 'Russian Federation' },
        },
        {
          tripId: 'florence-trip',
          stopId: 'florence-us-stop',
          cityId: 'florence-us',
          position: 2,
          cityName: 'Florence',
          latitude: 34.7998,
          longitude: -87.6773,
          country: { code: 'US', name: 'United States' },
        },
        {
          tripId: 'florence-trip',
          stopId: 'florence-it-stop',
          cityId: 'florence-it',
          position: 1,
          cityName: 'Florence',
          latitude: 43.7696,
          longitude: 11.2558,
          country: { code: 'IT', name: 'Italy' },
        },
      ],
    }

    render(
      <TripList
        isLoading={false}
        overview={florenceOverview}
        selectedTripId={null}
        trips={[florenceTrip]}
        onCreate={() => undefined}
        onSelect={() => undefined}
      />,
    )

    expect(screen.getByText('Florence, Italy · Florence, United States · Moscow')).toBeTruthy()
  })

  it('limits the preview to the first four unique cityIds', () => {
    const extendedOverview: TripMapOverview = {
      ...overview,
      markers: [
        ...overview.markers,
        {
          tripId: 'japan',
          stopId: 'osaka-stop',
          cityId: 'osaka',
          position: 4,
          cityName: 'Osaka',
          latitude: 34.6937,
          longitude: 135.5023,
          country: { code: 'JP', name: 'Japan' },
        },
        {
          tripId: 'japan',
          stopId: 'nara-stop',
          cityId: 'nara',
          position: 5,
          cityName: 'Nara',
          latitude: 34.6851,
          longitude: 135.8048,
          country: { code: 'JP', name: 'Japan' },
        },
        {
          tripId: 'japan',
          stopId: 'hiroshima-stop',
          cityId: 'hiroshima',
          position: 6,
          cityName: 'Hiroshima',
          latitude: 34.3853,
          longitude: 132.4553,
          country: { code: 'JP', name: 'Japan' },
        },
      ],
    }

    render(
      <TripList
        isLoading={false}
        overview={extendedOverview}
        selectedTripId={null}
        trips={[{ ...trips[0], stopCount: 6 }]}
        onCreate={() => undefined}
        onSelect={() => undefined}
      />,
    )

    expect(screen.getByText('Tokyo · Kyoto · Osaka · Nara')).toBeTruthy()
    expect(screen.queryByText(/Hiroshima/)).toBeNull()
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

  it('keeps the empty global sidebar focused on navigation', () => {
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
    expect(screen.queryByText('Your travel story')).toBeNull()
  })
})
