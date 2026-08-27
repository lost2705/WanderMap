// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEMES, THEME_STORAGE_KEY } from './appearance/theme'
import type { CitySearchResult, PlaceDetails, Trip, TripMapOverview, TripStop, TripSummary } from './types/travel'

vi.mock('./api/cities', () => ({
  searchCities: vi.fn(),
}))

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
  const { countryCodesForMap, markersForMap, routesForMap } = await vi.importActual<typeof import('./features/map/mapData')>(
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
      const routes = routesForMap(overview, selectedTrip)

      return (
        <div
          data-countries={countryCodes.join(',')}
          data-city-ids={markers.map((marker) => marker.cityId).join(',')}
          data-marker-count={markers.length}
          data-markers={markers.flatMap((marker) => marker.visits.map((visit) => visit.tripId)).join(',')}
          data-route={routes[0]?.coordinates.map((coordinate) => coordinate.join(',')).join('|') ?? ''}
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
  addStop,
  createTrip,
  deleteStopPhoto,
  getMapOverview,
  getTrip,
  listTrips,
  updateStopJournal,
  uploadStopPhoto,
} from './api/trips'
import { searchCities } from './api/cities'
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
      note: 'A rainy return to Tokyo years later.',
      photos: [],
    },
  ],
}

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
  vi.mocked(listTrips).mockResolvedValue(tripSummaries)
  vi.mocked(getMapOverview).mockResolvedValue(overview)
  vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(tripId === 'italy' ? italyTrip : japanTrip))
  vi.mocked(getPlaceDetails).mockImplementation((cityId) => Promise.resolve(cityId === 'city-rome' ? romePlace : tokyoPlace))
  vi.mocked(searchCities).mockResolvedValue([])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
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

describe('App Journey creation and city search flow', () => {
  it('creates and selects a Journey, appends repeated visits locally, and restores the persisted World overview', async () => {
    const spainTrip: Trip = {
      id: 'spain',
      name: 'Spain 2027',
      startDate: '2027-04-03',
      endDate: '2027-04-14',
      description: 'Barcelona, Valencia, and the Mediterranean coast.',
      stops: [],
    }
    const barcelona: CitySearchResult = {
      name: 'Barcelona',
      countryName: 'Spain',
      regionName: 'Catalonia',
      countryCode: 'ES',
      latitude: 41.3851,
      longitude: 2.1734,
    }
    const valencia: CitySearchResult = {
      name: 'Valencia',
      countryName: 'Spain',
      regionName: 'Valencian Community',
      countryCode: 'ES',
      latitude: 39.4699,
      longitude: -0.3763,
    }
    const createdStops: TripStop[] = [
      locatedStop('barcelona-first', 1, 'city-barcelona', barcelona),
      locatedStop('valencia', 2, 'city-valencia', valencia),
      locatedStop('barcelona-return', 3, 'city-barcelona', barcelona),
    ]
    const finalOverview: TripMapOverview = {
      visitedCountryCodes: ['ES', 'IT', 'JP'],
      memoryCount: overview.memoryCount,
      markers: [
        ...overview.markers,
        ...createdStops.map((stop) => ({
          tripId: 'spain',
          stopId: stop.id,
          cityId: stop.city.id,
          position: stop.position,
          cityName: stop.city.name,
          latitude: stop.city.latitude!,
          longitude: stop.city.longitude!,
          country: stop.city.country,
        })),
      ],
    }
    vi.mocked(createTrip).mockResolvedValue(spainTrip)
    vi.mocked(addStop)
      .mockResolvedValueOnce(createdStops[0]!)
      .mockResolvedValueOnce(createdStops[1]!)
      .mockResolvedValueOnce(createdStops[2]!)
    vi.mocked(searchCities)
      .mockResolvedValueOnce([barcelona])
      .mockResolvedValueOnce([valencia])
      .mockResolvedValueOnce([barcelona])
    vi.mocked(getMapOverview).mockReset()
    vi.mocked(getMapOverview).mockResolvedValueOnce(overview).mockResolvedValue(finalOverview)

    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'Create a new journey' }))
    expect(screen.getByRole('region', { name: 'Create a journey' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Journey title'), { target: { value: 'Spain 2027' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2027-04-03' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2027-04-14' } })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Barcelona, Valencia, and the Mediterranean coast.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create journey' }))

    await screen.findByRole('heading', { name: 'Spain 2027' })
    expect(screen.queryByRole('region', { name: 'Create a journey' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Spain 2027, 0 places' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(createTrip).toHaveBeenCalledWith({
      name: 'Spain 2027',
      startDate: '2027-04-03',
      endDate: '2027-04-14',
      description: 'Barcelona, Valencia, and the Mediterranean coast.',
    })
    expect(listTrips).toHaveBeenCalledTimes(1)
    expect(getTrip).toHaveBeenCalledTimes(1)
    expect(getMapOverview).toHaveBeenCalledTimes(1)

    await searchSelectAndAdd('Barcelona', 'Catalonia, Spain')
    await waitFor(() => expect(screen.getByLabelText('Stop 1').textContent).toBe('01'))
    expect(mapSurface.getAttribute('data-route')).toBe('')

    await searchSelectAndAdd('Valencia', 'Valencian Community, Spain')
    await waitFor(() => expect(screen.getByLabelText('Stop 2').textContent).toBe('02'))
    expect(mapSurface.getAttribute('data-route')).toBe('2.1734,41.3851|-0.3763,39.4699')

    await searchSelectAndAdd('Barcelona', 'Catalonia, Spain')
    await waitFor(() => expect(screen.getByLabelText('Stop 3').textContent).toBe('03'))

    expect(addStop).toHaveBeenCalledTimes(3)
    expect(addStop).toHaveBeenNthCalledWith(1, 'spain', cityAddInput(barcelona))
    expect(addStop).toHaveBeenNthCalledWith(2, 'spain', cityAddInput(valencia))
    expect(addStop).toHaveBeenNthCalledWith(3, 'spain', cityAddInput(barcelona))
    expect(createdStops[0]!.city.id).toBe(createdStops[2]!.city.id)
    expect(createdStops[0]!.id).not.toBe(createdStops[2]!.id)
    expect(screen.getByRole('button', { name: 'Spain 2027, 3 places' }).getAttribute('aria-pressed')).toBe('true')
    expect(mapSurface.getAttribute('data-selected-trip')).toBe('spain')
    expect(mapSurface.getAttribute('data-countries')).toBe('ES')
    expect(mapSurface.getAttribute('data-marker-count')).toBe('3')
    expect(mapSurface.getAttribute('data-city-ids')).toBe('city-barcelona,city-valencia,city-barcelona')
    expect(mapSurface.getAttribute('data-route'))
      .toBe('2.1734,41.3851|-0.3763,39.4699|2.1734,41.3851')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(getTrip).toHaveBeenCalledTimes(1)
    expect(listTrips).toHaveBeenCalledTimes(1)
    expect(getMapOverview).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Spain 2027, 3 places' }))

    await waitFor(() => expect(mapSurface.getAttribute('data-selected-trip')).toBe('global'))
    expect(mapSurface.getAttribute('data-countries')).toBe('')
    expect(mapSurface.getAttribute('data-route')).toBe('')
    expect(mapSurface.getAttribute('data-marker-count')).toBe('4')
    expect(screen.getAllByRole('button', { name: 'Open memories for Barcelona' })).toHaveLength(1)
    expect(screen.getByLabelText('Travel atlas summary').textContent)
      .toBe('Places4Countries3Journeys3Memories1')
    expect(screen.getByRole('button', { name: 'Spain 2027, 3 places' }).textContent)
      .toContain('Barcelona · Valencia')
    expect(getMapOverview).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
  }, 10_000)

  it('keeps the Journey creation draft and map surface after an API failure', async () => {
    vi.mocked(createTrip).mockRejectedValue(new Error('Journey service is unavailable.'))
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'Create a new journey' }))
    fireEvent.change(screen.getByLabelText('Journey title'), { target: { value: 'Spain 2027' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create journey' }))

    await waitFor(() => expect(screen.getAllByRole('alert').some((alert) =>
      alert.textContent?.includes('Journey service is unavailable.'))).toBe(true))
    expect(screen.getByRole('region', { name: 'Create a journey' })).toBeTruthy()
    expect(screen.getByLabelText<HTMLInputElement>('Journey title').value).toBe('Spain 2027')
    expect(screen.queryByRole('button', { name: 'Spain 2027, 0 places' })).toBeNull()
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(createTrip).toHaveBeenCalledTimes(1)
  })
})

describe('App responsive navigation', () => {
  it('opens and closes the Journey surface without replacing the map', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    const mapSurface = screen.getByTestId('map-state')
    const navigation = screen.getByRole('complementary', { name: 'Journey navigation' })
    const openButton = screen.getByRole('button', { name: 'Open journey navigation' })

    expect(navigation.classList.contains('is-open')).toBe(false)
    expect(openButton.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(openButton)

    expect(navigation.classList.contains('is-open')).toBe(true)
    expect(openButton.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)

    fireEvent.click(screen.getByRole('button', { name: 'Close journey navigation' }))

    expect(navigation.classList.contains('is-open')).toBe(false)
    expect(openButton.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(openButton)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
  })

  it('keeps trip selection behavior available from the compact Journey navigation', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    fireEvent.click(screen.getByRole('button', { name: 'Open journey navigation' }))
    fireEvent.click(screen.getByRole('button', { name: 'Japan 2026, 1 place' }))

    await screen.findByRole('heading', { name: 'Japan 2026' })
    expectMapState('japan', 'JP', 'japan')

    fireEvent.click(screen.getByRole('button', { name: 'Japan 2026, 1 place' }))

    await waitFor(() => expectMapState('global', '', 'italy,japan'))
    expect(screen.getByText('Select a journey to open its travel timeline.')).toBeTruthy()
  })

  it('returns directly to the global atlas from the mobile World action', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    fireEvent.click(screen.getByRole('button', { name: 'Return to world map' }))

    await waitFor(() => expectMapState('global', '', 'italy,japan'))
    expect(screen.queryByRole('button', { name: 'Return to world map' })).toBeNull()
  })

  it('isolates mobile background focus, traps Tab in the drawer, and restores focus after Escape', async () => {
    stubNavigationViewport(true)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    const mapSurface = screen.getByTestId('map-state')
    const navigation = screen.getByRole('complementary', { name: 'Journey navigation' })
    const openButton = screen.getByRole('button', { name: 'Open journey navigation' })
    const background = document.querySelector<HTMLElement>('.content-area')
    openButton.focus()

    fireEvent.click(openButton)

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close journey navigation' }))
    expect(background?.hasAttribute('inert')).toBe(true)
    expect(openButton.closest('[inert]')).toBe(background)

    const lastDrawerControl = screen.getByRole('combobox', { name: 'Appearance' })
    lastDrawerControl.focus()
    fireEvent.keyDown(window, { key: 'Tab' })
    expect(navigation.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(lastDrawerControl)

    fireEvent.keyDown(window, { key: 'Escape' })

    await waitFor(() => expect(document.activeElement).toBe(openButton))
    expect(navigation.classList.contains('is-open')).toBe(false)
    expect(background?.hasAttribute('inert')).toBe(false)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
  })

  it('restores mobile focus when the drawer Close button is used', async () => {
    stubNavigationViewport(true)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    const openButton = screen.getByRole('button', { name: 'Open journey navigation' })
    openButton.focus()
    fireEvent.click(openButton)
    fireEvent.click(screen.getByRole('button', { name: 'Close journey navigation' }))

    await waitFor(() => expect(document.activeElement).toBe(openButton))
    expect(document.querySelector('.content-area')?.hasAttribute('inert')).toBe(false)
  })

  it('keeps the desktop sidebar non-modal and the single map surface available', async () => {
    stubNavigationViewport(false)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    const mapSurface = screen.getByTestId('map-state')
    const openButton = screen.getByRole('button', { name: 'Open journey navigation' })
    openButton.focus()
    fireEvent.click(openButton)

    expect(document.querySelector('.content-area')?.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(openButton)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(screen.getAllByTestId('map-state')).toHaveLength(1)
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

  it('opens two visits to the same city as different stop memories', async () => {
    render(<App />)
    await openGlobalPlace('Tokyo')

    const memoryButtons = screen.getAllByRole('button', { name: 'View memory →' })
    expect(memoryButtons).toHaveLength(2)
    fireEvent.click(memoryButtons[0]!)

    expect(screen.getByRole('region', { name: 'Memory view' }).getAttribute('data-memory-id')).toBe('tokyo')
    expect(screen.getByText('Morning light in Shinjuku.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Back to Tokyo/ }))

    fireEvent.click(screen.getAllByRole('button', { name: 'View memory →' })[1]!)
    expect(screen.getByRole('region', { name: 'Memory view' }).getAttribute('data-memory-id'))
      .toBe('tokyo-legacy')
    expect(screen.getByText('A rainy return to Tokyo years later.')).toBeTruthy()
  })

  it('moves from Place Memories to Memory, back to Place, and into its Journey without remounting the map', async () => {
    render(<App />)
    const mapSurface = screen.getByTestId('map-state')
    await openGlobalPlace('Rome')

    fireEvent.click(screen.getByRole('button', { name: 'View memory →' }))

    expect(screen.getByRole('region', { name: 'Memory view' }).getAttribute('data-memory-id')).toBe('rome')
    expect(screen.getByText('An evening walk through Trastevere.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Place details' })).toBeNull()
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(screen.getAllByTestId('map-state')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: /Back to Rome/ }))
    expect(screen.getByRole('region', { name: 'Place details' })).toBeTruthy()
    expect(getPlaceDetails).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'View memory →' }))
    fireEvent.click(screen.getByRole('button', { name: 'View journey' }))

    expect(await screen.findByRole('heading', { name: 'Italy' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Memory view' })).toBeNull()
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('italy', 'IT', 'italy')
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

describe('App Journey memory navigation', () => {
  it('opens a stop memory while retaining selected-trip state, then returns to Journey and World', async () => {
    const journeyWithMemory: Trip = {
      ...japanTrip,
      stops: japanTrip.stops.map((stop) => ({ ...stop, note: 'Night walk through Shinjuku.' })),
    }
    vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(tripId === 'japan' ? journeyWithMemory : italyTrip))
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Japan 2026, 1 place' }))
    await screen.findByRole('heading', { name: 'Japan 2026' })
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'Open memory →' }))

    expect(within(screen.getByRole('region', { name: 'Memory view' }))
      .getByText('Night walk through Shinjuku.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open journey navigation' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Japan 2026, 1 place' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('japan', 'JP', 'japan')

    fireEvent.click(screen.getByRole('button', { name: /Back to Japan 2026/ }))
    expect(screen.queryByRole('region', { name: 'Memory view' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Japan 2026' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Open memory →' }))
    fireEvent.click(screen.getByRole('button', { name: 'World' }))

    expect(screen.queryByRole('region', { name: 'Memory view' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Japan 2026, 1 place' }).getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('global', '', 'italy,japan')
  })

  it('opens Place Memories from a Journey memory and ignores a stale prior Place response', async () => {
    const journeyWithMemory: Trip = {
      ...japanTrip,
      stops: japanTrip.stops.map((stop) => ({ ...stop, note: 'Tokyo from the selected Journey.' })),
    }
    const staleRomeRequest = deferred<PlaceDetails>()
    vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(tripId === 'japan' ? journeyWithMemory : italyTrip))
    vi.mocked(getPlaceDetails)
      .mockReturnValueOnce(staleRomeRequest.promise)
      .mockResolvedValueOnce(tokyoPlace)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open memories for Rome' }))
    expect(screen.getByRole('status')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Japan 2026, 1 place' }))
    await screen.findByRole('heading', { name: 'Japan 2026' })
    fireEvent.click(screen.getByRole('button', { name: 'Open memory →' }))
    expect(within(screen.getByRole('region', { name: 'Memory view' }))
      .getByText('Tokyo from the selected Journey.')).toBeTruthy()

    staleRomeRequest.resolve(romePlace)
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Memory view' }))
      .getByText('Tokyo from the selected Journey.')).toBeTruthy())
    expect(screen.queryByText('An evening walk through Trastevere.')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Place details' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'View place' }))
    expect(await screen.findByRole('region', { name: 'Place details' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Tokyo' })).toBeTruthy()
    expectMapState('global', '', 'italy,japan')
  })
})

describe('App Memory editing', () => {
  it('updates a Journey-origin Memory in the selected TripStop cache without a refetch', async () => {
    const journeyWithMemory: Trip = {
      ...japanTrip,
      stops: japanTrip.stops.map((stop) => ({ ...stop, note: 'Night walk through Shinjuku.' })),
    }
    const updatedStop = { ...journeyWithMemory.stops[0]!, note: 'Sunrise near Tsukiji.' }
    vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(
      tripId === 'japan' ? journeyWithMemory : italyTrip,
    ))
    vi.mocked(updateStopJournal).mockResolvedValue(updatedStop)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Japan 2026, 1 place' }))
    await screen.findByRole('heading', { name: 'Japan 2026' })
    const tripFetchesBeforeEdit = vi.mocked(getTrip).mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Open memory →' }))

    fireEvent.click(screen.getByRole('button', { name: /Edit$/ }))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Sunrise near Tsukiji.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }))
    expect(await screen.findByText('Sunrise near Tsukiji.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Back to Japan 2026/ }))

    expect(screen.getByText('Sunrise near Tsukiji.')).toBeTruthy()
    expect(getTrip).toHaveBeenCalledTimes(tripFetchesBeforeEdit)
    expect(updateStopJournal).toHaveBeenCalledWith('japan', 'tokyo', expect.objectContaining({
      note: 'Sunrise near Tsukiji.',
    }))
  })

  it('saves the exact stop and keeps Memory, Place and Journey data synchronized', async () => {
    const updatedStop = {
      ...italyTrip.stops[0]!,
      arrivalDate: '2026-05-04',
      departureDate: '2026-05-07',
      note: 'Rome after the summer rain.',
      photos: romePlace.visits[0]!.photos,
    }
    let persistedItaly = italyTrip
    vi.mocked(updateStopJournal).mockImplementation(async () => {
      persistedItaly = { ...italyTrip, stops: [updatedStop] }
      return updatedStop
    })
    vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(
      tripId === 'italy' ? persistedItaly : japanTrip,
    ))
    render(<App />)
    await openGlobalMemory('Rome')

    fireEvent.click(screen.getByRole('button', { name: /Edit$/ }))
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: '2026-05-04' } })
    fireEvent.change(screen.getByLabelText('Departure'), { target: { value: '2026-05-07' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Rome after the summer rain.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }))

    expect(await screen.findByText('Rome after the summer rain.')).toBeTruthy()
    expect(screen.queryByRole('form', { name: 'Edit memory for Rome' })).toBeNull()
    expect(updateStopJournal).toHaveBeenCalledWith('italy', 'rome', {
      arrivalDate: '2026-05-04',
      departureDate: '2026-05-07',
      note: 'Rome after the summer rain.',
    })

    fireEvent.click(screen.getByRole('button', { name: /Back to Rome/ }))
    const placePanel = screen.getByRole('region', { name: 'Place details' })
    expect(within(placePanel).getByText('Rome after the summer rain.')).toBeTruthy()
    expect(within(placePanel).getByText('May 4, 2026 – May 7, 2026')).toBeTruthy()
    fireEvent.click(within(placePanel).getByRole('button', { name: 'View memory →' }))
    expect(screen.getByRole('region', { name: 'Memory view' }).getAttribute('data-memory-id')).toBe('rome')

    fireEvent.click(screen.getByRole('button', { name: 'View journey' }))
    expect(await screen.findByRole('heading', { name: 'Italy' })).toBeTruthy()
    expect(screen.getByText('Rome after the summer rain.')).toBeTruthy()
    expect(screen.getByText('May 4, 2026 – May 7, 2026')).toBeTruthy()
  })

  it('uploads a photo in Memory edit mode and keeps the persisted change after Cancel', async () => {
    const createdPhoto = {
      id: 'rome-second',
      originalFilename: 'Rome rain.jpg',
      contentType: 'image/jpeg',
      size: 321,
      position: 2,
      contentUrl: '/api/photos/rome-second',
    }
    vi.mocked(uploadStopPhoto).mockResolvedValue(createdPhoto)
    render(<App />)
    await openGlobalMemory('Rome')
    fireEvent.click(screen.getByRole('button', { name: /Edit$/ }))
    const file = new File(['rain'], 'Rome rain.jpg', { type: 'image/jpeg' })

    fireEvent.change(screen.getByLabelText('Add photo for Rome'), { target: { files: [file] } })

    expect(await screen.findByRole('img', { name: 'Rome memory, photo 2' })).toBeTruthy()
    expect(uploadStopPhoto).toHaveBeenCalledWith('italy', 'rome', file)
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('src')))
      .toEqual([
        '/api/trips/italy/stops/rome/photos/rome-memory/content',
        '/api/photos/rome-second',
      ])

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('img', { name: 'Rome memory, photo 2' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Back to Rome/ }))
    expect(screen.getByRole('img', { name: 'Rome memory from Italy, photo 2' })).toBeTruthy()
  })

  it('removes the final note and photo without leaving a ghost Memory', async () => {
    let memoryCount = 1
    let persistedItaly = {
      ...italyTrip,
      stops: [{ ...italyTrip.stops[0]!, note: romePlace.visits[0]!.note, photos: romePlace.visits[0]!.photos }],
    }
    vi.mocked(getMapOverview).mockImplementation(() => Promise.resolve({ ...overview, memoryCount }))
    vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(
      tripId === 'italy' ? persistedItaly : japanTrip,
    ))
    vi.mocked(updateStopJournal).mockImplementation(async (_tripId, _stopId, input) => {
      persistedItaly = {
        ...persistedItaly,
        stops: [{ ...persistedItaly.stops[0]!, ...input }],
      }
      return persistedItaly.stops[0]!
    })
    vi.mocked(deleteStopPhoto).mockImplementation(async () => {
      memoryCount = 0
      persistedItaly = {
        ...persistedItaly,
        stops: [{ ...persistedItaly.stops[0]!, photos: [] }],
      }
    })
    render(<App />)
    await openGlobalMemory('Rome')

    fireEvent.click(screen.getByRole('button', { name: /Edit$/ }))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }))

    await screen.findByRole('button', { name: /Edit$/ })
    expect(screen.getByRole('img', { name: 'Rome memory, photo 1' })).toBeTruthy()
    expect(screen.getByText('Memory', { selector: '[aria-current="page"]' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Edit$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete rome.jpg' }))
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Rome memory, photo 1' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('This visit does not have journal notes or photos yet.')).toBeTruthy()
    expect(screen.getByText('Visit', { selector: '[aria-current="page"]' })).toBeTruthy()
    expect(deleteStopPhoto).toHaveBeenCalledWith('italy', 'rome', 'rome-memory')
    await waitFor(() => expect(screen.getByLabelText('Travel atlas summary').textContent)
      .toBe('Places2Countries2Journeys2Memories0'))

    fireEvent.click(screen.getByRole('button', { name: /Back to Rome/ }))
    expect(screen.queryByRole('button', { name: 'View memory →' })).toBeNull()
    expect(screen.getByText('Visited 1 time')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View journey →' }))
    expect(await screen.findByRole('heading', { name: 'Italy' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open memory →' })).toBeNull()
  })

  it('keeps a note-only Memory after its final photo is removed', async () => {
    vi.mocked(deleteStopPhoto).mockResolvedValue()
    render(<App />)
    await openGlobalMemory('Rome')
    fireEvent.click(screen.getByRole('button', { name: /Edit$/ }))

    fireEvent.click(screen.getByRole('button', { name: 'Delete rome.jpg' }))
    await waitFor(() => expect(screen.queryByRole('img', { name: 'Rome memory, photo 1' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByText('An evening walk through Trastevere.')).toBeTruthy()
    expect(screen.getByText('Memory', { selector: '[aria-current="page"]' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Back to Rome/ }))
    expect(screen.getByRole('button', { name: 'View memory →' })).toBeTruthy()
  })

  it('does not let a late save for one repeated visit replace the newer Memory selection', async () => {
    const saveRequest = deferred<Trip['stops'][number]>()
    vi.mocked(updateStopJournal).mockReturnValueOnce(saveRequest.promise)
    render(<App />)
    await openGlobalPlace('Tokyo')
    fireEvent.click(screen.getAllByRole('button', { name: 'View memory →' })[0]!)
    fireEvent.click(screen.getByRole('button', { name: /Edit$/ }))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Updated first Tokyo visit.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }))

    fireEvent.click(screen.getByRole('button', { name: /Back to Tokyo/ }))
    fireEvent.click(screen.getAllByRole('button', { name: 'View memory →' })[1]!)
    expect(screen.getByRole('region', { name: 'Memory view' }).getAttribute('data-memory-id'))
      .toBe('tokyo-legacy')

    saveRequest.resolve({
      ...japanTrip.stops[0]!,
      note: 'Updated first Tokyo visit.',
    })

    await waitFor(() => expect(screen.getByRole('region', { name: 'Memory view' }).getAttribute('data-memory-id'))
      .toBe('tokyo-legacy'))
    expect(screen.getByText('A rainy return to Tokyo years later.')).toBeTruthy()
    expect(screen.queryByText('Updated first Tokyo visit.')).toBeNull()
    expect(updateStopJournal).toHaveBeenCalledWith('japan', 'tokyo', expect.objectContaining({
      note: 'Updated first Tokyo visit.',
    }))
  })
})

describe('App appearance', () => {
  it('defaults to Terracotta and selects every theme without changing the Journey or map surface', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const mapSurface = screen.getByTestId('map-state')
    const initialMapData = {
      countries: mapSurface.getAttribute('data-countries'),
      markers: mapSurface.getAttribute('data-markers'),
      selectedTrip: mapSurface.getAttribute('data-selected-trip'),
    }
    const appearance = screen.getByRole('combobox', { name: 'Appearance' }) as HTMLSelectElement

    expect(appearance.value).toBe('terracotta')
    expect(document.documentElement.dataset.theme).toBe('terracotta')

    THEMES.forEach(({ id }) => {
      fireEvent.change(appearance, { target: { value: id } })
      expect(appearance.value).toBe(id)
      expect(document.documentElement.dataset.theme).toBe(id)
    })

    expect(screen.getByRole('button', { name: 'Italy, 1 place' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(screen.getAllByTestId('map-state')).toHaveLength(1)
    expect({
      countries: mapSurface.getAttribute('data-countries'),
      markers: mapSurface.getAttribute('data-markers'),
      selectedTrip: mapSurface.getAttribute('data-selected-trip'),
    }).toEqual(initialMapData)
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight')
  })

  it('preserves an active Place while switching appearance', async () => {
    render(<App />)
    await openGlobalPlace('Rome')
    const mapSurface = screen.getByTestId('map-state')
    const placePanel = screen.getByRole('region', { name: 'Place details' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Appearance' }), { target: { value: 'ocean' } })

    expect(document.documentElement.dataset.theme).toBe('ocean')
    expect(screen.getByRole('region', { name: 'Place details' })).toBe(placePanel)
    expect(screen.getByRole('heading', { name: 'Rome' })).toBeTruthy()
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('global', '', 'italy,japan')
  })

  it('preserves an active Memory and selected Journey while switching to Midnight', async () => {
    const journeyWithMemory: Trip = {
      ...japanTrip,
      stops: japanTrip.stops.map((stop) => ({ ...stop, note: 'Night walk through Shinjuku.' })),
    }
    vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(tripId === 'japan' ? journeyWithMemory : italyTrip))
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Japan 2026, 1 place' }))
    await screen.findByRole('heading', { name: 'Japan 2026' })
    fireEvent.click(screen.getByRole('button', { name: 'Open memory →' }))
    const memoryView = screen.getByRole('region', { name: 'Memory view' })
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.change(screen.getByRole('combobox', { name: 'Appearance' }), { target: { value: 'midnight' } })

    expect(document.documentElement.dataset.theme).toBe('midnight')
    expect(screen.getByRole('region', { name: 'Memory view' })).toBe(memoryView)
    expect(within(memoryView).getByText('Night walk through Shinjuku.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Japan 2026, 1 place' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('japan', 'JP', 'japan')
  })
})

async function searchSelectAndAdd(query: string, location: string) {
  const input = screen.getByRole('combobox', { name: 'Where did you go?' }) as HTMLInputElement
  fireEvent.change(input, { target: { value: query } })
  await screen.findByText(location, {}, { timeout: 2_000 })
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option'))
  fireEvent.click(screen.getByRole('button', { name: 'Add stop' }))
  await waitFor(() => expect(input.value).toBe(''))
}

function locatedStop(
  id: string,
  position: number,
  cityId: string,
  result: CitySearchResult,
): TripStop {
  return {
    id,
    position,
    arrivalDate: null,
    departureDate: null,
    note: null,
    photos: [],
    city: {
      id: cityId,
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      country: { code: result.countryCode, name: result.countryName },
    },
  }
}

function cityAddInput(result: CitySearchResult) {
  return {
    countryCode: result.countryCode,
    cityName: result.name,
    latitude: result.latitude,
    longitude: result.longitude,
  }
}

function expectMapState(selectedTrip: string, countries: string, markers: string) {
  const mapState = screen.getByTestId('map-state')
  expect(mapState.getAttribute('data-selected-trip')).toBe(selectedTrip)
  expect(mapState.getAttribute('data-countries')).toBe(countries)
  expect(mapState.getAttribute('data-markers')).toBe(markers)
}

async function openGlobalPlace(cityName: string) {
  await screen.findByRole('heading', { name: 'Italy' })
  fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
  fireEvent.click(screen.getByRole('button', { name: `Open memories for ${cityName}` }))
  await screen.findByRole('heading', { name: cityName })
}

async function openGlobalMemory(cityName: string) {
  await openGlobalPlace(cityName)
  fireEvent.click(screen.getByRole('button', { name: 'View memory →' }))
  await screen.findByRole('region', { name: 'Memory view' })
}

function stubNavigationViewport(matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches,
    media: '(max-width: 820px)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  })))
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
