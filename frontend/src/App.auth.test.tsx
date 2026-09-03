// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './api/client'
import type { CurrentUser } from './api/auth'
import type { TripMapOverview, TripSummary } from './types/travel'

const clientState = vi.hoisted(() => ({
  generation: 0,
  unauthorizedHandler: null as ((requestGeneration: number) => void) | null,
}))

vi.mock('./api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./api/client')>()
  return {
    ...actual,
    getClientSessionGeneration: vi.fn(() => clientState.generation),
    resetClientSession: vi.fn(() => {
      clientState.generation += 1
    }),
    setUnauthorizedHandler: vi.fn((handler: ((requestGeneration: number) => void) | null) => {
      clientState.unauthorizedHandler = handler
    }),
  }
})

vi.mock('./api/auth', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
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

vi.mock('./api/bucketList', () => ({
  addBucketListItem: vi.fn(),
  deleteBucketListItem: vi.fn(),
  listBucketListItems: vi.fn(),
}))

vi.mock('./api/profile', () => ({ getTravelProfile: vi.fn() }))
vi.mock('./api/places', () => ({ getPlaceDetails: vi.fn() }))
vi.mock('./api/cities', () => ({ searchCities: vi.fn() }))
vi.mock('./features/map/MapView', () => ({
  MapView: ({ selectedTrip }: { selectedTrip: { name: string } | null }) => (
    <div data-testid="authenticated-map">{selectedTrip?.name ?? 'World map'}</div>
  ),
}))

import { getCurrentUser, login, logout, register } from './api/auth'
import { listBucketListItems } from './api/bucketList'
import { getTravelProfile } from './api/profile'
import { getMapOverview, getTrip, listTrips } from './api/trips'
import App from './App'

const alice: CurrentUser = { id: 'alice', email: 'alice@example.com', displayName: 'Alice' }
const bob: CurrentUser = { id: 'bob', email: 'bob@example.com', displayName: 'Bob' }
const emptyOverview: TripMapOverview = { markers: [], visitedCountryCodes: [], memoryCount: 0 }
const aliceTrips: TripSummary[] = [{
  id: 'alice-trip',
  name: 'Alice in Rome',
  startDate: null,
  endDate: null,
  description: null,
  stopCount: 0,
}]
const bobTrips: TripSummary[] = [{
  id: 'bob-trip',
  name: 'Bob in Tokyo',
  startDate: null,
  endDate: null,
  description: null,
  stopCount: 0,
}]

beforeEach(() => {
  vi.mocked(getCurrentUser).mockRejectedValue(new ApiError(401, 'AUTH_REQUIRED'))
  vi.mocked(listTrips).mockResolvedValue([])
  vi.mocked(getMapOverview).mockResolvedValue(emptyOverview)
  vi.mocked(getTravelProfile).mockRejectedValue(new Error('Optional profile unavailable'))
  vi.mocked(listBucketListItems).mockRejectedValue(new Error('Optional bucket unavailable'))
  vi.mocked(logout).mockResolvedValue()
  clientState.generation = 0
  clientState.unauthorizedHandler = null
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('App authentication boundary', () => {
  it('shows a session-checking state without flashing the sign-in form', () => {
    vi.mocked(getCurrentUser).mockReturnValue(new Promise(() => undefined))

    render(<App />)

    expect(screen.getByRole('status', { name: 'Restoring your WanderMap session' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
    expect(listTrips).not.toHaveBeenCalled()
  })

  it('shows sign in when no session can be restored', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.queryByTestId('authenticated-map')).toBeNull()
    expect(listTrips).not.toHaveBeenCalled()
  })

  it('restores an authenticated session before loading personal data', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(alice)

    render(<App />)

    expect(await screen.findByTestId('authenticated-map')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(listTrips).toHaveBeenCalledTimes(1)
  })

  it('opens WanderMap after a successful login and keeps failures local to the form', async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new ApiError(401, 'INVALID_CREDENTIALS'))
      .mockResolvedValueOnce(alice)
    render(<App />)
    await screen.findByRole('heading', { name: 'Welcome back' })

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect((await screen.findByRole('alert')).textContent).toContain('The email or password is incorrect.')
    expect(screen.queryByTestId('authenticated-map')).toBeNull()

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByTestId('authenticated-map')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
  })

  it('creates an account and starts an authenticated atlas', async () => {
    vi.mocked(register).mockResolvedValue(alice)
    render(<App />)
    await screen.findByRole('heading', { name: 'Welcome back' })

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByTestId('authenticated-map')).toBeTruthy()
    expect(register).toHaveBeenCalledWith({
      displayName: 'Alice',
      email: 'alice@example.com',
      password: 'correct horse',
    })
  })

  it('rejects a password over the BCrypt UTF-8 byte limit without submitting it', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Welcome back' })

    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Alice' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'alice@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: '😀'.repeat(19) } })
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect((await screen.findByRole('alert')).textContent).toContain('72 UTF-8 bytes or fewer')
    expect(register).not.toHaveBeenCalled()
  })

  it('unmounts all personal data on logout and starts the next user with clean state', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(alice)
    vi.mocked(listTrips).mockResolvedValue(aliceTrips)
    vi.mocked(getTrip).mockResolvedValue({ ...aliceTrips[0]!, stops: [] })
    vi.mocked(login).mockResolvedValue(bob)
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Alice in Rome, 0 places' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.queryByText('Alice in Rome')).toBeNull()

    vi.mocked(listTrips).mockResolvedValue(bobTrips)
    vi.mocked(getTrip).mockResolvedValue({ ...bobTrips[0]!, stops: [] })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bob@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('button', { name: 'Bob in Tokyo, 0 places' })).toBeTruthy()
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.queryByText('Alice in Rome')).toBeNull()
  })

  it.each([
    ['network failure', new Error('offline')],
    ['server failure', new ApiError(503, undefined, 'Service unavailable')],
  ])('keeps the authenticated UI when logout has a %s', async (_label, failure) => {
    vi.mocked(getCurrentUser).mockResolvedValue(alice)
    vi.mocked(logout).mockRejectedValue(failure)
    render(<App />)
    await screen.findByTestId('authenticated-map')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect((await screen.findByRole('alert')).textContent).toContain('Sign out failed. Please try again.')
    expect(screen.getByTestId('authenticated-map')).toBeTruthy()
    expect(screen.getByText('Alice')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
  })

  it('treats a logout 401 as an already-ended session', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(alice)
    vi.mocked(logout).mockRejectedValue(new ApiError(401, 'AUTH_REQUIRED'))
    render(<App />)
    await screen.findByTestId('authenticated-map')

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeTruthy()
    expect(screen.queryByTestId('authenticated-map')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('ignores an old Alice 401 after Bob starts a newer authenticated generation', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(alice)
    vi.mocked(login).mockResolvedValue(bob)
    render(<App />)
    await screen.findByTestId('authenticated-map')
    const aliceGeneration = clientState.generation

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'Welcome back' })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'bob@example.com' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByTestId('authenticated-map')

    act(() => clientState.unauthorizedHandler?.(aliceGeneration))

    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.getByTestId('authenticated-map')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Welcome back' })).toBeNull()
  })

  it('returns to sign in when the centralized client reports an expired session', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(alice)
    render(<App />)
    await screen.findByTestId('authenticated-map')

    act(() => clientState.unauthorizedHandler?.(clientState.generation))

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy())
    expect(screen.queryByTestId('authenticated-map')).toBeNull()
    expect(screen.queryByText('Alice')).toBeNull()
  })
})
