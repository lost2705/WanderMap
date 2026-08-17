// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trip, TripMapOverview, TripSummary } from './types/travel'

vi.mock('./api/trips', () => ({
  addStop: vi.fn(),
  createTrip: vi.fn(),
  deleteStop: vi.fn(),
  deleteTrip: vi.fn(),
  getMapOverview: vi.fn(),
  getTrip: vi.fn(),
  listTrips: vi.fn(),
  moveStop: vi.fn(),
  updateTrip: vi.fn(),
}))

vi.mock('./features/map/MapView', async () => {
  const { countryCodesForMap, markersForMap } = await vi.importActual<typeof import('./features/map/mapData')>(
    './features/map/mapData',
  )

  return {
    MapView: ({ overview, selectedTrip }: { overview: TripMapOverview | null; selectedTrip: Trip | null }) => {
      const countryCodes = countryCodesForMap(overview, selectedTrip)
      const markers = markersForMap(overview, selectedTrip?.id ?? null)

      return (
        <div
          data-countries={countryCodes.join(',')}
          data-markers={markers.map((marker) => marker.tripId).join(',')}
          data-selected-trip={selectedTrip?.id ?? 'global'}
          data-testid="map-state"
        />
      )
    },
  }
})

import {
  getMapOverview,
  getTrip,
  listTrips,
} from './api/trips'
import App from './App'

const tripSummaries: TripSummary[] = [
  {
    id: 'italy',
    name: 'Italy',
    startDate: null,
    endDate: null,
    stopCount: 1,
  },
  {
    id: 'japan',
    name: 'Japan 2026',
    startDate: null,
    endDate: null,
    stopCount: 1,
  },
]

const italyTrip: Trip = {
  id: 'italy',
  name: 'Italy',
  startDate: null,
  endDate: null,
  stops: [
    {
      id: 'rome',
      position: 1,
      city: {
        id: 'city-rome',
        name: 'Rome',
        latitude: 41.9028,
        longitude: 12.4964,
        country: { code: 'IT', name: 'Italy' },
      },
    },
  ],
}

const japanTrip: Trip = {
  id: 'japan',
  name: 'Japan 2026',
  startDate: null,
  endDate: null,
  stops: [
    {
      id: 'tokyo',
      position: 1,
      city: {
        id: 'city-tokyo',
        name: 'Tokyo',
        latitude: 35.6762,
        longitude: 139.6503,
        country: { code: 'JP', name: 'Japan' },
      },
    },
  ],
}

const overview: TripMapOverview = {
  visitedCountryCodes: ['IT', 'JP'],
  markers: [
    {
      tripId: 'italy',
      stopId: 'rome',
      position: 1,
      cityName: 'Rome',
      latitude: 41.9028,
      longitude: 12.4964,
      country: { code: 'IT', name: 'Italy' },
    },
    {
      tripId: 'japan',
      stopId: 'tokyo',
      position: 1,
      cityName: 'Tokyo',
      latitude: 35.6762,
      longitude: 139.6503,
      country: { code: 'JP', name: 'Japan' },
    },
  ],
}

beforeEach(() => {
  vi.mocked(listTrips).mockResolvedValue(tripSummaries)
  vi.mocked(getMapOverview).mockResolvedValue(overview)
  vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(tripId === 'italy' ? italyTrip : japanTrip))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('App trip selection', () => {
  it('deselects the active trip and can select it again from the global state', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    const italyButton = screen.getByRole('button', { name: 'Italy1 stop' })
    expect(italyButton.getAttribute('aria-pressed')).toBe('true')
    expectMapState('italy', 'IT', 'italy')

    fireEvent.click(italyButton)

    expect(italyButton.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('heading', { name: 'Italy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit trip' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Add a stop' })).toBeNull()
    expect(screen.getByText('Select a trip to view its itinerary.')).toBeTruthy()
    expectMapState('global', 'IT,JP', 'italy,japan')

    fireEvent.click(italyButton)

    await screen.findByRole('heading', { name: 'Italy' })
    expect(italyButton.getAttribute('aria-pressed')).toBe('true')
    expectMapState('italy', 'IT', 'italy')
  })

  it('switches directly from one selected trip to another', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    const italyButton = screen.getByRole('button', { name: 'Italy1 stop' })
    const japanButton = screen.getByRole('button', { name: 'Japan 20261 stop' })
    fireEvent.click(japanButton)

    expect(italyButton.getAttribute('aria-pressed')).toBe('false')
    expect(japanButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Italy' })).toBeNull()
    expect(screen.queryByText('Select a trip to view its itinerary.')).toBeNull()

    await screen.findByRole('heading', { name: 'Japan 2026' })
    expectMapState('japan', 'JP', 'japan')
  })
})

function expectMapState(selectedTrip: string, countries: string, markers: string) {
  const mapState = screen.getByTestId('map-state')
  expect(mapState.getAttribute('data-selected-trip')).toBe(selectedTrip)
  expect(mapState.getAttribute('data-countries')).toBe(countries)
  expect(mapState.getAttribute('data-markers')).toBe(markers)
}
