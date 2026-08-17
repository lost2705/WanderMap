// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trip, TripMapOverview, TripSummary } from './types/travel'

vi.mock('./api/trips', () => ({
  addStop: vi.fn(),
  createTrip: vi.fn(),
  deleteStop: vi.fn(),
  deleteStopPhoto: vi.fn(),
  deleteTrip: vi.fn(),
  getMapOverview: vi.fn(),
  getTrip: vi.fn(),
  listTrips: vi.fn(),
  moveStop: vi.fn(),
  updateStopJournal: vi.fn(),
  updateTrip: vi.fn(),
  uploadStopPhoto: vi.fn(),
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
          data-markers={markers.flatMap((marker) => marker.visits.map((visit) => visit.tripId)).join(',')}
          data-selected-trip={selectedTrip?.id ?? 'global'}
          data-testid="map-state"
        />
      )
    },
  }
})

import {
  deleteStopPhoto,
  getMapOverview,
  getTrip,
  listTrips,
  updateStopJournal,
  uploadStopPhoto,
} from './api/trips'
import App from './App'

const tripSummaries: TripSummary[] = [
  {
    id: 'italy',
    name: 'Italy',
    startDate: null,
    endDate: null,
    description: null,
    stopCount: 1,
  },
  {
    id: 'japan',
    name: 'Japan 2026',
    startDate: null,
    endDate: null,
    description: null,
    stopCount: 1,
  },
]

const italyTrip: Trip = {
  id: 'italy',
  name: 'Italy',
  startDate: null,
  endDate: null,
  description: null,
  stops: [
    {
      id: 'rome',
      position: 1,
      arrivalDate: null,
      departureDate: null,
      note: null,
      photos: [],
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
  description: null,
  stops: [
    {
      id: 'tokyo',
      position: 1,
      arrivalDate: null,
      departureDate: null,
      note: null,
      photos: [],
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
      cityId: 'city-rome',
      position: 1,
      cityName: 'Rome',
      latitude: 41.9028,
      longitude: 12.4964,
      country: { code: 'IT', name: 'Italy' },
    },
    {
      tripId: 'japan',
      stopId: 'tokyo',
      cityId: 'city-tokyo',
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
    expectMapState('global', '', 'italy,japan')

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

  it('refreshes journal content without changing the selected map data', async () => {
    const updatedItalyTrip: Trip = {
      ...italyTrip,
      stops: italyTrip.stops.map((stop) => ({
        ...stop,
        arrivalDate: '2026-05-10',
        departureDate: '2026-05-12',
        note: 'An evening walk through Trastevere.',
      })),
    }
    vi.mocked(updateStopJournal).mockResolvedValue(updatedItalyTrip.stops[0]!)

    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    expectMapState('italy', 'IT', 'italy')

    fireEvent.click(screen.getByRole('button', { name: 'Edit journal for Rome' }))
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: '2026-05-10' } })
    fireEvent.change(screen.getByLabelText('Departure'), { target: { value: '2026-05-12' } })
    fireEvent.change(screen.getByLabelText('Note'), {
      target: { value: 'An evening walk through Trastevere.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save journal' }))

    await screen.findByText('An evening walk through Trastevere.')
    expect(updateStopJournal).toHaveBeenCalledWith('italy', 'rome', {
      arrivalDate: '2026-05-10',
      departureDate: '2026-05-12',
      note: 'An evening walk through Trastevere.',
    })
    expect(getTrip).toHaveBeenCalledTimes(1)
    expectMapState('italy', 'IT', 'italy')
  })

  it('adds a photo locally without refetching or disturbing selected map state', async () => {
    const createdPhoto = {
      id: 'rome-photo',
      originalFilename: 'Rome evening.jpg',
      contentType: 'image/jpeg',
      size: 123,
      position: 1,
      contentUrl: '/api/photos/rome-photo',
    }
    vi.mocked(uploadStopPhoto).mockResolvedValue(createdPhoto)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const file = new File(['jpeg'], 'Rome evening.jpg', { type: 'image/jpeg' })

    fireEvent.change(screen.getByLabelText('Add photo for Rome'), { target: { files: [file] } })

    expect(await screen.findByRole('img', { name: 'Rome memory 1' })).toBeTruthy()
    expect(uploadStopPhoto).toHaveBeenCalledWith('italy', 'rome', file)
    expect(getTrip).toHaveBeenCalledTimes(1)
    expect(getMapOverview).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Italy1 stop' }).getAttribute('aria-pressed')).toBe('true')
    expectMapState('italy', 'IT', 'italy')
  })

  it('shows an upload failure without changing the selected trip or map data', async () => {
    vi.mocked(uploadStopPhoto).mockRejectedValue(new Error('Photo storage is unavailable.'))
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    fireEvent.change(screen.getByLabelText('Add photo for Rome'), {
      target: { files: [new File(['bad'], 'bad.jpg', { type: 'image/jpeg' })] },
    })

    expect((await screen.findByRole('alert')).textContent).toContain('Photo storage is unavailable.')
    expect(screen.queryByRole('img', { name: /Rome memory/ })).toBeNull()
    expect(getTrip).toHaveBeenCalledTimes(1)
    expect(getMapOverview).toHaveBeenCalledTimes(1)
    expectMapState('italy', 'IT', 'italy')
  })

  it('deletes a photo locally without refetching or changing selection', async () => {
    const tripWithPhoto: Trip = {
      ...italyTrip,
      stops: italyTrip.stops.map((stop) => ({
        ...stop,
        photos: [{
          id: 'rome-photo',
          originalFilename: 'Rome evening.jpg',
          contentType: 'image/jpeg',
          size: 123,
          position: 1,
          contentUrl: '/api/photos/rome-photo',
        }],
      })),
    }
    vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(tripId === 'italy' ? tripWithPhoto : japanTrip))
    vi.mocked(deleteStopPhoto).mockResolvedValue()
    render(<App />)
    await screen.findByRole('img', { name: 'Rome memory 1' })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Rome evening.jpg' }))

    await waitFor(() => expect(screen.queryByRole('img', { name: 'Rome memory 1' })).toBeNull())
    expect(deleteStopPhoto).toHaveBeenCalledWith('italy', 'rome', 'rome-photo')
    expect(getTrip).toHaveBeenCalledTimes(1)
    expect(getMapOverview).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Italy1 stop' }).getAttribute('aria-pressed')).toBe('true')
    expectMapState('italy', 'IT', 'italy')
  })
})

function expectMapState(selectedTrip: string, countries: string, markers: string) {
  const mapState = screen.getByTestId('map-state')
  expect(mapState.getAttribute('data-selected-trip')).toBe(selectedTrip)
  expect(mapState.getAttribute('data-countries')).toBe(countries)
  expect(mapState.getAttribute('data-markers')).toBe(markers)
}
