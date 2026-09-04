// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEMES, THEME_STORAGE_KEY } from './appearance/theme'
import { ApiError } from './api/client'
import type {
  BucketListItem,
  CitySearchResult,
  PlaceDetails,
  TravelProfile,
  Trip,
  TripMapOverview,
  TripStop,
  TripSummary,
} from './types/travel'

vi.mock('./api/cities', () => ({
  searchCities: vi.fn(),
}))

vi.mock('./api/assistant', () => ({
  askTravelAssistant: vi.fn(),
}))

vi.mock('./api/planner', () => ({
  createTripPlan: vi.fn(),
  refineTripPlan: vi.fn(),
}))

vi.mock('./api/bucketList', () => ({
  addBucketListItem: vi.fn(),
  deleteBucketListItem: vi.fn(),
  listBucketListItems: vi.fn(),
}))

vi.mock('./api/places', () => ({
  getPlaceDetails: vi.fn(),
}))

vi.mock('./api/profile', () => ({
  getTravelProfile: vi.fn(),
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
      bucketListItems,
      selectedTrip,
      onSelectPlace,
      worldResetKey,
    }: {
      overview: TripMapOverview | null
      bucketListItems: BucketListItem[]
      selectedTrip: Trip | null
      onSelectPlace: (cityId: string) => void
      worldResetKey: number
    }) => {
      const countryCodes = countryCodesForMap(overview, selectedTrip)
      const markers = markersForMap(overview, selectedTrip?.id ?? null)
      const routes = routesForMap(overview, selectedTrip)

      return (
        <div
          data-countries={countryCodes.join(',')}
          data-city-ids={markers.map((marker) => marker.cityId).join(',')}
          data-bucket-city-ids={bucketListItems.map((item) => item.city.id).join(',')}
          data-marker-count={markers.length}
          data-markers={markers.flatMap((marker) => marker.visits.map((visit) => visit.tripId)).join(',')}
          data-route={routes[0]?.coordinates.map((coordinate) => coordinate.join(',')).join('|') ?? ''}
          data-selected-trip={selectedTrip?.id ?? 'global'}
          data-world-reset-key={worldResetKey}
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
import { addBucketListItem, deleteBucketListItem, listBucketListItems } from './api/bucketList'
import { searchCities } from './api/cities'
import { askTravelAssistant } from './api/assistant'
import { createTripPlan, refineTripPlan } from './api/planner'
import { getPlaceDetails } from './api/places'
import { getTravelProfile } from './api/profile'
import { AuthenticatedApp as App } from './App'

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

const travelProfile: TravelProfile = {
  journeyCount: 2,
  visitCount: 2,
  uniqueCityCount: 2,
  countryCount: 2,
  travelDayCount: 0,
  memoryCount: 1,
  photoCount: 1,
  revisitedCityCount: 0,
  revisitedCountryCount: 0,
  highlights: {
    mostVisitedCity: {
      cityId: 'city-rome',
      cityName: 'Rome',
      countryCode: 'IT',
      countryName: 'Italy',
      visitCount: 1,
    },
    mostVisitedCountry: { countryCode: 'IT', countryName: 'Italy', visitCount: 1 },
    longestJourney: null,
    mostRecentJourney: null,
    mostMemoryRichJourney: { journeyId: 'italy', journeyName: 'Italy', memoryCount: 1 },
  },
  achievements: [{
    code: 'FIRST_JOURNEY',
    title: 'First chapter',
    description: 'Create your first Journey.',
    category: 'journeys',
    unlocked: true,
    currentValue: 2,
    targetValue: 1,
    progressPercent: 100,
  }, {
    code: 'COUNTRY_EXPLORER',
    title: 'Country explorer',
    description: 'Visit five countries.',
    category: 'exploration',
    unlocked: false,
    currentValue: 2,
    targetValue: 5,
    progressPercent: 40,
  }],
}

const optionalKyotoItem: BucketListItem = {
  id: 'bucket-kyoto-optional',
  city: {
    id: 'city-kyoto-optional',
    name: 'Kyoto',
    latitude: 35.0116,
    longitude: 135.7681,
    country: { code: 'JP', name: 'Japan' },
  },
  createdAt: '2026-09-01T12:00:00Z',
  visited: false,
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
  vi.mocked(getTravelProfile).mockResolvedValue(travelProfile)
  vi.mocked(listBucketListItems).mockResolvedValue([])
  vi.mocked(getTrip).mockImplementation((tripId) => Promise.resolve(tripId === 'italy' ? italyTrip : japanTrip))
  vi.mocked(getPlaceDetails).mockImplementation((cityId) => Promise.resolve(cityId === 'city-rome' ? romePlace : tokyoPlace))
  vi.mocked(searchCities).mockResolvedValue([])
  vi.mocked(askTravelAssistant).mockResolvedValue({
    runId: 'assistant-run',
    answer: 'Consider Porto next.',
    toolsUsed: ['get_travel_profile'],
  })
  vi.mocked(createTripPlan).mockResolvedValue({
    runId: 'planner-run',
    toolsUsed: ['search_places'],
    plan: {
      title: 'Italy in October',
      summary: 'A relaxed Italian draft.',
      durationDays: 1,
      startDate: null,
      endDate: null,
      destinationSummary: 'Italy',
      pace: 'RELAXED',
      stops: [{
        cityName: 'Rome',
        countryCode: 'IT',
        countryName: 'Italy',
        latitude: 41.9028,
        longitude: 12.4964,
        daysAtStop: 1,
        reason: 'A good fit.',
        activities: ['Architecture'],
        bucketListMatch: false,
        alreadyVisited: true,
      }],
      considerations: ['Read-only draft.'],
      sourcesUsed: ['Place Search'],
    },
  })
  vi.mocked(refineTripPlan).mockImplementation((plan, message) => Promise.resolve({
    runId: `refine-${message}`,
    toolsUsed: ['get_journeys', 'get_bucket_list', 'search_places'],
    plan: { ...plan, title: message },
  }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
})

describe('App initial loading resilience', () => {
  it('keeps core and Bucket List available when Travel Profile fails', async () => {
    vi.mocked(getTravelProfile).mockRejectedValue(new Error('Profile unavailable.'))
    vi.mocked(listBucketListItems).mockResolvedValue([optionalKyotoItem])

    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))

    expect(await screen.findByRole('button', { name: /KyotoJapanWant to visit/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Japan 2026, 1 place' })).toBeTruthy()
    expect(screen.queryByLabelText('World travel statistics')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expectMapState('global', 'IT,JP', 'italy,japan')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
  })

  it('keeps core, Travel Profile, and visited places available when Bucket List fails', async () => {
    vi.mocked(listBucketListItems).mockRejectedValue(new Error('Bucket List unavailable.'))

    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const mapSurface = screen.getByTestId('map-state')
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))

    expect(await screen.findByText('Want to visit is temporarily unavailable.')).toBeTruthy()
    expect(screen.getByLabelText('World travel statistics').textContent)
      .toBe('Countries2Places2Journeys2Travel days0Memories1')
    const visitedPlaces = screen.getByRole('button', { name: 'Visited places — 2 places' })
    fireEvent.click(visitedPlaces)
    expect(screen.getByRole('button', { name: 'Open Rome, Italy — 1 visit' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expectMapState('global', 'IT,JP', 'italy,japan')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
  })

  it('keeps the core World experience available when both optional APIs fail', async () => {
    vi.mocked(getTravelProfile).mockRejectedValue(new Error('Profile unavailable.'))
    vi.mocked(listBucketListItems).mockRejectedValue(new Error('Bucket List unavailable.'))

    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const mapSurface = screen.getByTestId('map-state')
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))

    expect(await screen.findByText('Want to visit is temporarily unavailable.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Japan 2026, 1 place' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Visited places — 2 places' })).toBeTruthy()
    expect(screen.queryByLabelText('World travel statistics')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expectMapState('global', 'IT,JP', 'italy,japan')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
  })

  it('still treats a core API rejection as a fatal application loading error', async () => {
    vi.mocked(listTrips).mockRejectedValue(new Error('Trips unavailable.'))

    render(<App />)

    expect((await screen.findByRole('alert')).textContent).toContain('Trips unavailable.')
    expect(screen.queryByRole('button', { name: 'Italy, 1 place' })).toBeNull()
    expect(screen.queryByLabelText('World travel statistics')).toBeNull()
    expectMapState('global', '', '')
  })

  it('ignores optional results that resolve after the same load iteration has failed core', async () => {
    const profileRequest = deferred<TravelProfile>()
    const bucketListRequest = deferred<BucketListItem[]>()
    vi.mocked(listTrips).mockRejectedValue(new Error('Trips unavailable.'))
    vi.mocked(getTravelProfile).mockReturnValue(profileRequest.promise)
    vi.mocked(listBucketListItems).mockReturnValue(bucketListRequest.promise)

    render(<App />)

    const fatalAlert = await screen.findByRole('alert')
    expect(fatalAlert.textContent).toContain('Trips unavailable.')

    await act(async () => {
      profileRequest.resolve(travelProfile)
      bucketListRequest.resolve([optionalKyotoItem])
      await Promise.all([profileRequest.promise, bucketListRequest.promise])
      await Promise.resolve()
    })

    expect(screen.getByRole('alert')).toBe(fatalAlert)
    expect(screen.getByRole('alert').textContent).toContain('Trips unavailable.')
    expect(screen.queryByRole('button', { name: 'Italy, 1 place' })).toBeNull()
    expect(screen.queryByLabelText('World travel statistics')).toBeNull()
    expect(screen.queryByRole('button', { name: /KyotoJapanWant to visit/ })).toBeNull()
    expect(screen.getByText('Save places that are still calling you.')).toBeTruthy()
    expectMapState('global', '', '')
  })
})

describe('App trip selection', () => {
  it('deselects the active trip and can select it again from the global state', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    const italyButton = screen.getByRole('button', { name: 'Italy, 1 place' })
    const mapSurface = screen.getByTestId('map-state')
    expect(italyButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByLabelText('World travel statistics')).toBeNull()
    expectMapState('italy', 'IT', 'italy')

    fireEvent.click(italyButton)

    expect(italyButton.getAttribute('aria-pressed')).toBe('false')
    expect(screen.queryByRole('heading', { name: 'Italy' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit journey' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Add a stop' })).toBeNull()
    expect(screen.getByText('Select a journey to open its travel timeline.')).toBeTruthy()
    expect(screen.getByLabelText('World travel statistics').textContent)
      .toBe('Countries2Places2Journeys2Travel days0Memories1')
    expectMapState('global', 'IT,JP', 'italy,japan')

    fireEvent.click(italyButton)

    await screen.findByRole('heading', { name: 'Italy' })
    expect(italyButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByLabelText('World travel statistics')).toBeNull()
    expectMapState('italy', 'IT', 'italy')

    fireEvent.click(italyButton)

    expect(screen.getByLabelText('World travel statistics').textContent)
      .toBe('Countries2Places2Journeys2Travel days0Memories1')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
  })

  it('hides the World stats bar for an empty profile', async () => {
    vi.mocked(listTrips).mockResolvedValue([])
    vi.mocked(getMapOverview).mockResolvedValue({ visitedCountryCodes: [], markers: [], memoryCount: 0 })
    vi.mocked(getTravelProfile).mockResolvedValue({
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
      achievements: [],
    })

    render(<App />)

    await screen.findByText('Your atlas is waiting for its first journey.')
    expect(screen.queryByRole('region', { name: 'Travel statistics' })).toBeNull()
    expectMapState('global', '', '')
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
    vi.mocked(getTravelProfile)
      .mockResolvedValueOnce(travelProfile)
      .mockResolvedValue({ ...travelProfile, memoryCount: 2, photoCount: 2 })
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
    await waitFor(() => expect(screen.getByLabelText('World travel statistics').textContent)
      .toContain('Memories2'))
    expect(screen.queryByText('Photos')).toBeNull()
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

describe('App Want to visit flow', () => {
  const kyotoSearch: CitySearchResult = {
    name: 'Kyoto',
    countryName: 'Japan',
    regionName: 'Kyoto Prefecture',
    countryCode: 'JP',
    latitude: 35.0116,
    longitude: 135.7681,
  }
  const kyotoItem: BucketListItem = {
    id: 'bucket-kyoto',
    city: {
      id: 'city-kyoto',
      name: 'Kyoto',
      latitude: 35.0116,
      longitude: 135.7681,
      country: { code: 'JP', name: 'Japan' },
    },
    createdAt: '2026-09-01T12:00:00Z',
    visited: false,
  }

  it('adds a searched city without changing history profile metrics or recreating the map surface', async () => {
    vi.mocked(searchCities).mockResolvedValue([kyotoSearch])
    vi.mocked(addBucketListItem).mockResolvedValue(kyotoItem)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    const mapSurface = screen.getByTestId('map-state')
    const initialProfile = screen.getByLabelText('World travel statistics').textContent

    fireEvent.click(screen.getByRole('button', { name: 'Add a place to Want to visit' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Where would you like to go?' }), {
      target: { value: 'Kyoto' },
    })
    fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option'))
    fireEvent.click(screen.getByRole('button', { name: 'Save place' }))

    await waitFor(() => expect(screen.getByRole('button', { name: /KyotoJapanWant to visit/ })).toBeTruthy())
    expect(addBucketListItem).toHaveBeenCalledWith({
      countryCode: 'JP',
      cityName: 'Kyoto',
      latitude: 35.0116,
      longitude: 135.7681,
    })
    expect(mapSurface.getAttribute('data-bucket-city-ids')).toBe('city-kyoto')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(screen.getByLabelText('World travel statistics').textContent).toBe(initialProfile)
    expect(getTravelProfile).toHaveBeenCalledTimes(1)
  })

  it('opens a bucket-only Place Details state and removes only the bucket item after success', async () => {
    const kyotoPlace: PlaceDetails = { city: kyotoItem.city, visitCount: 0, visits: [] }
    vi.mocked(listBucketListItems).mockResolvedValue([kyotoItem])
    vi.mocked(getPlaceDetails).mockImplementation((cityId) => Promise.resolve(
      cityId === 'city-kyoto' ? kyotoPlace : cityId === 'city-rome' ? romePlace : tokyoPlace,
    ))
    vi.mocked(deleteBucketListItem).mockResolvedValue()
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    const initialProfile = screen.getByLabelText('World travel statistics').textContent

    const kyoto = screen.getByRole('button', { name: /KyotoJapanWant to visit/ })
    kyoto.focus()
    fireEvent.click(kyoto)

    expect(await screen.findByRole('heading', { name: 'Kyoto' })).toBeTruthy()
    expect(screen.getByText('Not visited yet')).toBeTruthy()
    expect(screen.getByText('Want to visit', { selector: '.place-details-states > span' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove from Want to visit' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove from Want to visit' })).toBeNull())
    expect(deleteBucketListItem).toHaveBeenCalledWith('bucket-kyoto')
    expect(screen.getByRole('heading', { name: 'Kyoto' })).toBeTruthy()
    expect(screen.getByTestId('map-state').getAttribute('data-bucket-city-ids')).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Close place details' }))
    expect(screen.getByLabelText('World travel statistics').textContent).toBe(initialProfile)
    expect(getTravelProfile).toHaveBeenCalledTimes(1)
  })

  it('keeps the city selection and shows a recoverable duplicate response inline', async () => {
    vi.mocked(searchCities).mockResolvedValue([kyotoSearch])
    vi.mocked(addBucketListItem).mockRejectedValue(new ApiError(
      409,
      'BUCKET_LIST_DUPLICATE',
      'city is already on the bucket list',
    ))
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a place to Want to visit' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Where would you like to go?' }), {
      target: { value: 'Kyoto' },
    })
    fireEvent.click(within(await screen.findByRole('listbox')).getByRole('option'))
    fireEvent.click(screen.getByRole('button', { name: 'Save place' }))

    expect((await screen.findByRole('alert')).textContent).toContain('already in Want to visit')
    expect(screen.getByText('Selected city')).toBeTruthy()
    expect(screen.getByTestId('map-state').getAttribute('data-bucket-city-ids')).toBe('')
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
    vi.mocked(getTravelProfile)
      .mockResolvedValueOnce(travelProfile)
      .mockResolvedValue({
        ...travelProfile,
        journeyCount: 3,
        visitCount: 5,
        uniqueCityCount: 4,
        countryCount: 3,
        travelDayCount: 12,
        revisitedCityCount: 1,
      })

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
    expect(mapSurface.getAttribute('data-countries')).toBe('ES,IT,JP')
    expect(mapSurface.getAttribute('data-route')).toBe('')
    expect(mapSurface.getAttribute('data-marker-count')).toBe('4')
    expect(screen.getAllByRole('button', { name: 'Open memories for Barcelona' })).toHaveLength(1)
    expect(screen.getByLabelText('World travel statistics').textContent)
      .toBe('Countries3Places4Journeys3Travel days12Memories1')
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

    await waitFor(() => expectMapState('global', 'IT,JP', 'italy,japan'))
    expect(screen.getByText('Select a journey to open its travel timeline.')).toBeTruthy()
  })

  it('returns directly to the global atlas from the mobile World action', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })

    fireEvent.click(screen.getByRole('button', { name: 'Return to world map' }))

    await waitFor(() => expectMapState('global', 'IT,JP', 'italy,japan'))
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

  it('opens a visited place from the mobile drawer and restores focus outside the closed drawer', async () => {
    stubNavigationViewport(true)
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const mapSurface = screen.getByTestId('map-state')
    const navigation = screen.getByRole('complementary', { name: 'Journey navigation' })
    const openButton = screen.getByRole('button', { name: 'Open journey navigation' })

    fireEvent.click(openButton)
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    fireEvent.click(screen.getByRole('button', { name: 'Visited places — 2 places' }))
    const rome = screen.getByRole('button', { name: 'Open Rome, Italy — 1 visit' })
    rome.focus()
    rome.click()

    expect(await screen.findByRole('heading', { name: 'Rome' })).toBeTruthy()
    expect(navigation.classList.contains('is-open')).toBe(false)
    expect(document.querySelector('.content-area')?.hasAttribute('inert')).toBe(false)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close place details' }))
    expect(screen.getByTestId('map-state')).toBe(mapSurface)

    fireEvent.click(screen.getByRole('button', { name: 'Close place details' }))
    expect(document.activeElement).toBe(openButton)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
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
  it('opens the existing Place Details from keyboard-focusable World navigation without resetting the map', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    const mapSurface = screen.getByTestId('map-state')

    expect(screen.queryByRole('region', { name: 'Visited places' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    const navigation = screen.getByRole('region', { name: 'Visited places' })
    fireEvent.click(within(navigation).getByRole('button', { name: 'Visited places — 2 places' }))
    const rome = within(navigation).getByRole('button', { name: 'Open Rome, Italy — 1 visit' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Appearance' }), { target: { value: 'ocean' } })
    expect(within(navigation).getByRole('button', { name: 'Visited places — 2 places' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('map-state')).toBe(mapSurface)

    rome.focus()
    expect(document.activeElement).toBe(rome)
    rome.click()

    expect(await screen.findByRole('heading', { name: 'Rome' })).toBeTruthy()
    expect(getPlaceDetails).toHaveBeenCalledWith('city-rome', expect.any(AbortSignal))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close place details' }))
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(mapSurface.getAttribute('data-world-reset-key')).toBe('0')

    fireEvent.click(screen.getByRole('button', { name: 'Close place details' }))
    expect(document.activeElement).toBe(rome)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(mapSurface.getAttribute('data-world-reset-key')).toBe('0')
  })

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
    expectMapState('global', 'IT,JP', 'italy,japan')
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
    expectMapState('global', 'IT,JP', 'italy,japan')
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
    expectMapState('global', 'IT,JP', 'italy,japan')
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
  it('requests an explicit World reset from a global Memory without resetting on Place/Memory opening', async () => {
    render(<App />)
    await openGlobalMemory('Rome')
    expect(screen.getByTestId('map-state').getAttribute('data-world-reset-key')).toBe('0')
    expect(screen.getByTestId('map-state').getAttribute('data-selected-trip')).toBe('global')
    fireEvent.click(screen.getByRole('button', { name: 'World' }))
    expect(screen.getByTestId('map-state').getAttribute('data-world-reset-key')).toBe('1')
    expect(screen.queryByRole('region', { name: 'Memory view' })).toBeNull()
    expect(screen.getAllByTestId('map-state')).toHaveLength(1)
  })

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
    expectMapState('global', 'IT,JP', 'italy,japan')
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
    expectMapState('global', 'IT,JP', 'italy,japan')
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
    vi.mocked(getTravelProfile).mockImplementation(() => Promise.resolve({
      ...travelProfile,
      memoryCount,
      photoCount: memoryCount,
    }))
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
    await waitFor(() => expect(getTravelProfile).toHaveBeenCalled())
    expect(screen.queryByLabelText('World travel statistics')).toBeNull()

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

describe('App Travel Profile navigation', () => {
  const currentUser = { id: 'alice', displayName: 'Alice Atlas', email: 'alice@example.com' }

  it('opens the dedicated profile and returns to the same selected Journey and map instance', async () => {
    render(<App currentUser={currentUser} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    await waitFor(() => expectMapState('italy', 'IT', 'italy'))
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'View profile' }))

    const profileView = screen.getByRole('region', { name: 'Travel Profile' })
    const backButton = within(profileView).getByRole('button', { name: 'Back to map' })
    expect(within(profileView).getByRole('heading', { name: 'Travel Profile' })).toBeTruthy()
    expect(within(profileView).getByText('Alice Atlas')).toBeTruthy()
    expect(within(profileView).getByText('Country explorer')).toBeTruthy()
    expect(document.activeElement).toBe(backButton)
    expect(document.querySelector('#journey-navigation')?.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('.content-area')?.hasAttribute('inert')).toBe(true)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(screen.getAllByTestId('map-state')).toHaveLength(1)

    fireEvent.click(backButton)

    expect(screen.queryByRole('heading', { name: 'Travel Profile' })).toBeNull()
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('italy', 'IT', 'italy')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'View profile' })))
  })

  it('preserves the global World state after a profile round trip', async () => {
    render(<App currentUser={currentUser} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    await waitFor(() => expectMapState('global', 'IT,JP', 'italy,japan'))
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'View profile' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to map' }))

    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('global', 'IT,JP', 'italy,japan')
  })

  it('shows a recoverable local error when the profile API is unavailable', async () => {
    vi.mocked(getTravelProfile).mockRejectedValueOnce(new Error('offline'))
    render(<App currentUser={currentUser} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    await waitFor(() => expect(getTravelProfile).toHaveBeenCalledTimes(1))
    vi.mocked(getTravelProfile).mockResolvedValueOnce(travelProfile)

    fireEvent.click(screen.getByRole('button', { name: 'View profile' }))

    expect(screen.getByRole('alert').textContent).toContain('Travel profile is temporarily unavailable.')
    expect(screen.getByTestId('map-state')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Country explorer')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('restores focus to the visible map navigation control on mobile', async () => {
    stubNavigationViewport(true)
    render(<App currentUser={currentUser} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Open journey navigation' }))
    fireEvent.click(screen.getByRole('button', { name: 'View profile' }))

    fireEvent.click(screen.getByRole('button', { name: 'Back to map' }))

    await waitFor(() => expect(document.activeElement)
      .toBe(screen.getByRole('button', { name: 'Open journey navigation' })))
  })
})

describe('App Travel Assistant navigation', () => {
  const alice = { id: 'alice', displayName: 'Alice Atlas', email: 'alice@example.com' }
  const bob = { id: 'bob', displayName: 'Bob Atlas', email: 'bob@example.com' }

  it('opens the assistant while preserving the selected Journey and single map instance', async () => {
    render(<App currentUser={alice} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    await waitFor(() => expectMapState('italy', 'IT', 'italy'))
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'Travel Assistant' }))

    const assistant = screen.getByRole('region', { name: 'Travel Assistant' })
    expect(within(assistant).getByRole('heading', { name: 'Travel Assistant' })).toBeTruthy()
    expect(document.activeElement).toBe(within(assistant).getByRole('button', { name: 'Back to map' }))
    expect(document.querySelector('#journey-navigation')?.hasAttribute('inert')).toBe(true)
    expect(document.querySelector('.content-area')?.hasAttribute('inert')).toBe(true)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(screen.getAllByTestId('map-state')).toHaveLength(1)

    fireEvent.click(within(assistant).getByRole('button', { name: 'Back to map' }))

    expect(screen.queryByRole('region', { name: 'Travel Assistant' })).toBeNull()
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('italy', 'IT', 'italy')
    await waitFor(() => expect(document.activeElement)
      .toBe(screen.getByRole('button', { name: 'Travel Assistant' })))
  })

  it('clears browser-session assistant state when the authenticated user changes', async () => {
    const { rerender } = render(<App key={alice.id} currentUser={alice} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Travel Assistant' }))
    fireEvent.change(screen.getByLabelText('What would you like to explore?'), {
      target: { value: 'Use Alice data' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask WanderMap' }))
    await screen.findByText('Consider Porto next.')

    rerender(<App key={bob.id} currentUser={bob} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Travel Assistant' }))

    expect(screen.queryByText('Consider Porto next.')).toBeNull()
    expect((screen.getByLabelText('What would you like to explore?') as HTMLTextAreaElement).value).toBe('')
  })
})

describe('App Trip Planner navigation', () => {
  const alice = { id: 'alice', displayName: 'Alice Atlas', email: 'alice@example.com' }

  it('opens exclusively while preserving the selected Journey and single map instance', async () => {
    render(<App currentUser={alice} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    await waitFor(() => expectMapState('italy', 'IT', 'italy'))
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'Trip Planner' }))

    const planner = screen.getByRole('region', { name: 'Plan a trip' })
    expect(within(planner).getByRole('heading', { name: 'Plan a trip' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Travel Assistant' })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Travel Profile' })).toBeNull()
    expect(document.activeElement).toBe(within(planner).getByRole('button', { name: 'Back to map' }))
    expect(document.querySelector('#journey-navigation')?.hasAttribute('inert')).toBe(true)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(screen.getAllByTestId('map-state')).toHaveLength(1)

    fireEvent.click(within(planner).getByRole('button', { name: 'Back to map' }))

    expect(screen.queryByRole('region', { name: 'Plan a trip' })).toBeNull()
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('italy', 'IT', 'italy')
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Trip Planner' })))
  })

  it('preserves the global World state across a planner round trip', async () => {
    render(<App currentUser={alice} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    await waitFor(() => expectMapState('global', 'IT,JP', 'italy,japan'))
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'Trip Planner' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Plan a trip' }))
      .getByRole('button', { name: 'Back to map' }))

    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expectMapState('global', 'IT,JP', 'italy,japan')
  })

  it('keeps a selected Journey and the same map instance across multiple refinements', async () => {
    render(<App currentUser={alice} onLogout={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Italy' })
    await waitFor(() => expectMapState('italy', 'IT', 'italy'))
    const mapSurface = screen.getByTestId('map-state')

    fireEvent.click(screen.getByRole('button', { name: 'Trip Planner' }))
    fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), {
      target: { value: 'Plan Italy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    await screen.findByRole('heading', { name: 'Italy in October' })

    fireEvent.change(screen.getByLabelText('How should this plan change?'), {
      target: { value: 'First refinement' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update plan' }))
    await screen.findByRole('heading', { name: 'First refinement' })
    fireEvent.change(screen.getByLabelText('How should this plan change?'), {
      target: { value: 'Second refinement' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update plan' }))
    await screen.findByRole('heading', { name: 'Second refinement' })

    fireEvent.click(screen.getByRole('button', { name: 'Back to map' }))

    expect(refineTripPlan).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(screen.getAllByTestId('map-state')).toHaveLength(1)
    expectMapState('italy', 'IT', 'italy')
  })
})

describe('App appearance', () => {
  it('keeps the World stats bar and map surface stable across a theme switch', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Italy' })
    fireEvent.click(screen.getByRole('button', { name: 'Italy, 1 place' }))
    const mapSurface = screen.getByTestId('map-state')
    const statsBar = screen.getByRole('region', { name: 'Travel statistics' })
    const values = screen.getByLabelText('World travel statistics').textContent

    fireEvent.change(screen.getByRole('combobox', { name: 'Appearance' }), { target: { value: 'midnight' } })

    expect(document.documentElement.dataset.theme).toBe('midnight')
    expect(screen.getByRole('region', { name: 'Travel statistics' })).toBe(statsBar)
    expect(screen.getByLabelText('World travel statistics').textContent).toBe(values)
    expect(screen.getByTestId('map-state')).toBe(mapSurface)
    expect(getTravelProfile).toHaveBeenCalledTimes(1)
  })

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
    expectMapState('global', 'IT,JP', 'italy,japan')
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
