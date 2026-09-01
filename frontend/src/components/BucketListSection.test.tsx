// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { BucketListItem, CitySearchResult } from '../types/travel'
import { BucketListSection } from './BucketListSection'
import type { SearchCitiesFunction } from './CitySearch'

const kyotoResult: CitySearchResult = {
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

beforeEach(() => vi.useFakeTimers())

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('BucketListSection', () => {
  it('renders a restrained empty state and accessible collapsible controls', () => {
    renderSection()

    expect(screen.getByRole('heading', { name: 'Want to visit' })).toBeTruthy()
    expect(screen.getByText('Save places that are still calling you.')).toBeTruthy()
    const toggle = screen.getByRole('button', { name: /Future placesWant to visit/ })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('Save places that are still calling you.')).toBeNull()
  })

  it('shows loading failure locally without presenting the normal empty state', () => {
    renderSection({ loadError: 'Want to visit is temporarily unavailable.' })

    expect(screen.getByRole('status').textContent).toBe('Want to visit is temporarily unavailable.')
    expect(screen.queryByText('Save places that are still calling you.')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a place to Want to visit' })).toBeTruthy()
  })

  it('searches, saves a canonical result, and focuses the newly saved place', async () => {
    const search = vi.fn<SearchCitiesFunction>().mockResolvedValue([kyotoResult])
    const onAdd = vi.fn().mockResolvedValue(kyotoItem)
    const { rerender } = renderSection({ citySearch: search, onAdd })

    fireEvent.click(screen.getByRole('button', { name: 'Add a place to Want to visit' }))
    const input = screen.getByRole('combobox', { name: 'Where would you like to go?' })
    expect(document.activeElement).toBe(input)
    expect(input.getAttribute('placeholder')).toBe('Search for a city...')
    fireEvent.change(input, { target: { value: 'Kyo' } })
    await advanceSearchDebounce()
    fireEvent.click(screen.getByRole('option'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save place' }))
      await Promise.resolve()
    })

    expect(onAdd).toHaveBeenCalledWith(kyotoResult)
    rerender(sectionProps({ items: [kyotoItem], citySearch: search, onAdd }))
    await act(async () => Promise.resolve())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /KyotoJapanWant to visit/ }))
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('keeps the selected city and shows explicit duplicate feedback', async () => {
    const search = vi.fn<SearchCitiesFunction>().mockResolvedValue([kyotoResult])
    const onAdd = vi.fn().mockRejectedValue(new ApiError(
      409,
      'BUCKET_LIST_DUPLICATE',
      'city is already on the bucket list',
    ))
    renderSection({ citySearch: search, onAdd })

    fireEvent.click(screen.getByRole('button', { name: 'Add a place to Want to visit' }))
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Kyoto' } })
    await advanceSearchDebounce()
    fireEvent.click(screen.getByRole('option'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save place' }))
      await Promise.resolve()
    })

    expect(screen.getByRole('alert').textContent).toBe('This place is already in Want to visit.')
    expect(screen.getByText('Selected city')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save place' }).disabled).toBe(false)
  })

  it('opens exact Place Details identity and distinguishes an already-visited bucket city', () => {
    const onSelectPlace = vi.fn()
    renderSection({ items: [{ ...kyotoItem, visited: true }], onSelectPlace })

    const place = screen.getByRole('button', { name: /KyotoJapanVisited too/ })
    fireEvent.click(place)

    expect(screen.getByText('Visited too')).toBeTruthy()
    expect(onSelectPlace).toHaveBeenCalledWith('city-kyoto')
  })

  it('cancels a draft and restores focus to Add place', async () => {
    renderSection()
    const add = screen.getByRole('button', { name: 'Add a place to Want to visit' })
    fireEvent.click(add)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Kyoto' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await act(async () => vi.runOnlyPendingTimers())

    expect(screen.queryByRole('combobox')).toBeNull()
    expect(document.activeElement).toBe(add)
  })
})

function renderSection(overrides: Partial<React.ComponentProps<typeof BucketListSection>> = {}) {
  return render(sectionProps(overrides))
}

function sectionProps(overrides: Partial<React.ComponentProps<typeof BucketListSection>> = {}) {
  return (
    <BucketListSection
      items={[]}
      isMutating={false}
      onAdd={vi.fn().mockResolvedValue(kyotoItem)}
      onSelectPlace={vi.fn()}
      {...overrides}
    />
  )
}

async function advanceSearchDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300)
    await Promise.resolve()
  })
}
