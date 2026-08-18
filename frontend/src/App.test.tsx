// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceDetails, Trip, TripMapOverview, TripSummary } from './types/travel'

vi.mock('./api/places', () => ({
  getPlaceDetails: vi.fn(),
}))

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
    MapView: ({
      overview,
      selectedTrip,
      onSelectPlace,
    }: {
      overview: TripMapOverview | null
      selectedTrip: Trip | null
      onSelectPlace: (cityId: string) => void
    }) => {
      const countryCodes = countryCodesForMap(overview, selectedTrip)
      const markers = markersForMap(overview, selectedTrip?.id ?? null)

      return (
        <div
          data-countries={countryCodes.join(',')}
          data-markers={markers.flatMap((marker) => marker.visits.map((visit) => visit.tripId)).join(',')}
          data-selected-trip={selectedTrip?.id ?? 'global'}
          data-testid="map-state"
        >
          {markers.map((marker) => marker.mode === 'global-place' ? (
            <button key={marker.markerKey} type="button" onClick={() => onSelectPlace(marker.cityId)}>
              Open memories for {marker.cityName}
            </button>
          ) : (
            <button key={marker.markerKey} type="button">
              {marker.cityName} itinerary marker
            </button>
          ))}
        </div>
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
import { getPlaceDetails } from './api/places'
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
  memoryCount: 1,
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

const romePlace: PlaceDetails = {
  city: italyTrip.stops[0]!.city,
  visitCount: 1,
  visits: [{
    tripId: 'italy',
    tripName: 'Italy',
    tripStartDate: '2026-05-01',
    tripEndDate: '2026-05-12',
    tripDescription: 'Spring in Italy.',
    stopId: 'rome',
    position: 1,
    arrivalDate: '2026-05-03',
    departureDate: '2026-05-05',
    note: 'An evening walk through Trastevere.',
    photos: [{
      id: 'rome-memory',
      originalFilename: 'rome.jpg',
      contentType: 'image/jpeg',
      size: 123,
      position: 1,
      contentUrl: '/api/trips/italy/stops/rome/photos/rome-memory/content',
    }],
  }],
}

const tokyoPlace: PlaceDetails = {
  city: japanTrip.stops[0]!.city,
  visitCount: 2,
  visits: [
    {
      tripId: 'japan',
      tripName: 'Japan 2026',
      tripStartDate: '2026-04-01',
      tripEndDate: '2026-04-12',
      tripDescription: null,
      stopId: 'tokyo',
      position: 1,
      arrivalDate: '2026-04-02',
      departureDate: '2026-04-05',
      note: 'Morning light in Shinjuku.',
      photos: [],
    },
    {
      tripId: 'italy',
      tripName: 'A legacy journey',
      tripStartDate: null,
      tripEndDate: null,
      tripDescription: null,
      stopId: 'tokyo-legacy',
      position: 4,
      arrivalDate: null,
      departureDate: null,
      note: null,
      photos: [],
    },
  ],
}

beforeEach(() => {
  vi.mocked(listTrips).mockResolvedValue(tripSummaries)
  vi.mocked(getMapOverview).mockResolvedValue(overview)
  vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(tripId === 'italy' ? italyTrip : japanTrip))
  vi.mocked(getPlaceDetails).mockImplementation((cityId) => Promise.resolve(cityId === 'city-rome' ? romePlace : tokyoPlace))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('App trip selection', () => {
  it('deselects the active trip and can select it again from the global state', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    const italyButton = screen.getByRole('button', { name: 'Italy, 1 place' })
    expect(italyButton.getAttribute('aria-pressed')).toBe('true')
    expectMapState('italy', 'IT', 'italy')

    fireEvent.click(italyButton)

    expect(italyButton.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('heading', { name: 'Italy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit journey' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Add a stop' })).toBeNull()
    expect(screen.getByText('Select a journey to open its travel timeline.')).toBeTruthy()
    expect(screen.getByLabelText('Travel atlas summary').textContent)
      .toBe('Places2Countries2Journeys2Memories1')
    expectMapState('global', '', 'italy,japan')

    fireEvent.click(italyButton)

    await screen.findByRole('heading', { name: 'Italy' })
    expect(italyButton.getAttribute('aria-pressed')).toBe('true')
    expectMapState('italy', 'IT', 'italy')
  })

  it('switches directly from one selected trip to another', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    const italyButton = screen.getByRole('button', { name: 'Italy, 1 place' })
    const japanButton = screen.getByRole('button', { name: 'Japan 2026, 1 place' })
    fireEvent.click(japanButton)

    expect(italyButton.getAttribute('aria-pressed')).toBe('false')
    expect(japanButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('heading', { name: 'Italy' })).toBeNull()
    expect(screen.queryByText('Select a journey to open its travel timeline.')).toBeNull()

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
    vi.mocked(getMapOverview)
      .mockResolvedValueOnce(overview)
      .mockResolvedValueOnce({ ...overview, memoryCount: 2 })
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const file = new File(['jpeg'], 'Rome evening.jpg', { type: 'image/jpeg' })

    fireEvent.change(screen.getByLabelText('Add photo for Rome'), { target: { files: [file] } })

    expect(await screen.findByRole('img', { name: 'Rome memory 1' })).toBeTruthy()
    expect(uploadStopPhoto).toHaveBeenCalledWith('italy', 'rome', file)
    expect(getTrip).toHaveBeenCalledTimes(1)
    expect(getMapOverview).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Italy, 1 place' }).getAttribute('aria-pressed')).toBe('true')
    expectMapState('italy', 'IT', 'italy')

    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    await waitFor(() => expect(screen.getByLabelText('Travel atlas summary').textContent)
      .toBe('Places2Countries2Journeys2Memories2'))
    expect(getMapOverview).toHaveBeenCalledTimes(2)
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
    expect(screen.getByRole('button', { name: 'Italy, 1 place' }).getAttribute('aria-pressed')).toBe('true')
    expectMapState('italy', 'IT', 'italy')
  })
})

describe('App global place details', () => {
  it('opens a global marker through loading and renders its place memories', async () => {
    const request = deferred<PlaceDetails>()
    vi.mocked(getPlaceDetails).mockReturnValueOnce(request.promise)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))

    fireEvent.click(screen.getByRole('button', { name: 'Open memories for Rome' }))

    expect(screen.getByRole('status').textContent).toContain('Gathering your visits')
    expect(getPlaceDetails).toHaveBeenCalledWith('city-rome', expect.any(AbortSignal))
    request.resolve(romePlace)

    expect(await screen.findByRole('heading', { name: 'Rome' })).toBeTruthy()
    expect(screen.getByText('Italy', { selector: '.place-details-header > p' })).toBeTruthy()
    expect(screen.getByText('Visited 1 time')).toBeTruthy()
    expect(screen.getByText('May 3, 2026 – May 5, 2026')).toBeTruthy()
    expect(screen.getByText('An evening walk through Trastevere.')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Rome memory from Italy, photo 1' })).toBeTruthy()
  })

  it('closes place details without changing the global map', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open memories for Rome' }))
    await screen.findByRole('heading', { name: 'Rome' })

    fireEvent.click(screen.getByRole('button', { name: 'Close place details' }))

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Place details' })).toBeNull())
    expectMapState('global', '', 'italy,japan')
  })

  it('does not reopen details when a request finishes after the panel is closed', async () => {
    const request = deferred<PlaceDetails>()
    vi.mocked(getPlaceDetails).mockReturnValueOnce(request.promise)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open memories for Rome' }))
    expect(screen.getByRole('status')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Close place details' }))
    request.resolve(romePlace)

    await waitFor(() => expect(screen.queryByRole('region', { name: 'Place details' })).toBeNull())
    expectMapState('global', '', 'italy,japan')
  })

  it('keeps the newest place when an earlier request resolves late', async () => {
    const romeRequest = deferred<PlaceDetails>()
    const tokyoRequest = deferred<PlaceDetails>()
    vi.mocked(getPlaceDetails)
      .mockReturnValueOnce(romeRequest.promise)
      .mockReturnValueOnce(tokyoRequest.promise)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))

    fireEvent.click(screen.getByRole('button', { name: 'Open memories for Rome' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open memories for Tokyo' }))
    tokyoRequest.resolve(tokyoPlace)
    expect(await screen.findByRole('heading', { name: 'Tokyo' })).toBeTruthy()
    expect(screen.getByText('Visited 2 times')).toBeTruthy()

    romeRequest.resolve(romePlace)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tokyo' })).toBeTruthy())
    expect(screen.queryByRole('heading', { name: 'Rome' })).toBeNull()
  })

  it('shows a controlled place error and can retry', async () => {
    vi.mocked(getPlaceDetails)
      .mockRejectedValueOnce(new Error('Place history is unavailable.'))
      .mockResolvedValueOnce(romePlace)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open memories for Rome' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Place history is unavailable.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(await screen.findByRole('heading', { name: 'Rome' })).toBeTruthy()
    expectMapState('global', '', 'italy,japan')
  })

  it('views the requested trip using the existing selection and closes the panel', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open memories for Tokyo' }))
    await screen.findByRole('heading', { name: 'Tokyo' })

    fireEvent.click(screen.getAllByRole('button', { name: 'View journey →' })[0]!)

    expect(await screen.findByRole('heading', { name: 'Japan 2026' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Place details' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Japan 2026, 1 place' }).getAttribute('aria-pressed')).toBe('true')
    expectMapState('japan', 'JP', 'japan')
  })

  it('does not open place history from a selected-trip marker', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    fireEvent.click(screen.getByRole('button', { name: 'Rome itinerary marker' }))

    expect(getPlaceDetails).not.toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Place details' })).toBeNull()
    expectMapState('italy', 'IT', 'italy')
  })
})

function expectMapState(selectedTrip: string, countries: string, markers: string) {
  const mapState = screen.getByTestId('map-state')
  expect(mapState.getAttribute('data-selected-trip')).toBe(selectedTrip)
  expect(mapState.getAttribute('data-countries')).toBe(countries)
  expect(mapState.getAttribute('data-markers')).toBe(markers)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
