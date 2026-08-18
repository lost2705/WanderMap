// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlaceDetails } from '../types/travel'
import { PlaceDetailsPanel } from './PlaceDetailsPanel'

const details: PlaceDetails = {
  city: {
    id: 'city-tokyo',
    name: 'Tokyo',
    latitude: 35.6762,
    longitude: 139.6503,
    country: { code: 'JP', name: 'Japan' },
  },
  visitCount: 2,
  visits: [
    {
      tripId: 'japan-2026',
      tripName: 'Japan 2026',
      tripStartDate: '2026-04-01',
      tripEndDate: '2026-04-12',
      tripDescription: 'Cherry blossoms and quiet mornings.',
      stopId: 'tokyo-2026',
      position: 2,
      arrivalDate: '2026-04-05',
      departureDate: '2026-04-09',
      note: 'Shinjuku, Shibuya, Senso-ji and Tokyo Station.',
      photos: [
        photo('photo-3', 3),
        photo('photo-1', 1),
        photo('photo-4', 4),
        photo('photo-2', 2),
      ],
    },
    {
      tripId: 'legacy',
      tripName: 'Legacy Japan trip',
      tripStartDate: null,
      tripEndDate: null,
      tripDescription: null,
      stopId: 'tokyo-legacy',
      position: 1,
      arrivalDate: null,
      departureDate: null,
      note: null,
      photos: [],
    },
  ],
}

afterEach(cleanup)

describe('PlaceDetailsPanel', () => {
  it('renders multiple visits, readable memories and conservative ordered photo previews', () => {
    renderPanel(details)

    expect(screen.getByRole('heading', { name: 'Tokyo' })).toBeTruthy()
    expect(screen.getByText('Japan', { selector: '.place-details-header > p' })).toBeTruthy()
    expect(screen.getByText('Visited 2 times')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Japan 2026' })).toBeTruthy()
    expect(screen.getByText('Apr 5, 2026 – Apr 9, 2026')).toBeTruthy()
    expect(screen.getByText('Cherry blossoms and quiet mornings.')).toBeTruthy()
    expect(screen.getByText('Shinjuku, Shibuya, Senso-ji and Tokyo Station.')).toBeTruthy()
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('src')))
      .toEqual(['/photos/1', '/photos/2', '/photos/3'])
    expect(screen.getByText('+1')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Legacy Japan trip' })).toBeTruthy()
    expect(screen.queryByText('No notes')).toBeNull()
    expect(screen.queryByText('No photos')).toBeNull()
    expect(screen.queryByText('No date')).toBeNull()
  })

  it('calls close, retry and the selected visit trip actions', () => {
    const onClose = vi.fn()
    const onRetry = vi.fn()
    const onViewTrip = vi.fn()
    const { rerender } = render(
      <PlaceDetailsPanel
        details={details}
        error={null}
        isLoading={false}
        onClose={onClose}
        onRetry={onRetry}
        onViewTrip={onViewTrip}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close place details' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'View journey →' })[1]!)

    expect(onClose).toHaveBeenCalledOnce()
    expect(onViewTrip).toHaveBeenCalledWith('legacy')

    rerender(
      <PlaceDetailsPanel
        details={null}
        error="The place could not be loaded."
        isLoading={false}
        onClose={onClose}
        onRetry={onRetry}
        onViewTrip={onViewTrip}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('renders a restrained empty visit state', () => {
    renderPanel({ ...details, visitCount: 0, visits: [] })

    expect(screen.getByText('Visited 0 times')).toBeTruthy()
    expect(screen.getByText('No visits are recorded for this place yet.')).toBeTruthy()
  })
})

function renderPanel(place: PlaceDetails) {
  return render(
    <PlaceDetailsPanel
      details={place}
      error={null}
      isLoading={false}
      onClose={() => undefined}
      onRetry={() => undefined}
      onViewTrip={() => undefined}
    />,
  )
}

function photo(id: string, position: number) {
  return {
    id,
    originalFilename: `${id}.jpg`,
    contentType: 'image/jpeg',
    size: 100 + position,
    position,
    contentUrl: `/photos/${position}`,
  }
}
