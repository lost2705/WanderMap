// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CitySearchResult, Trip } from '../types/travel'
import type { SearchCitiesFunction } from './CitySearch'
import { Itinerary } from './Itinerary'

const trip: Trip = {
  id: 'trip-id',
  name: 'Tuscany',
  startDate: null,
  endDate: null,
  stops: [],
}

const lucca: CitySearchResult = {
  name: 'Lucca',
  countryName: 'Italy',
  regionName: 'Tuscany',
  countryCode: 'IT',
  latitude: 43.8429,
  longitude: 10.5027,
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Itinerary add stop', () => {
  it('adds the selected city with its country and coordinates, then resets the form', async () => {
    const search = vi.fn<SearchCitiesFunction>().mockResolvedValue([lucca])
    const onAddStop = vi.fn<(city: CitySearchResult) => Promise<void>>().mockResolvedValue()
    renderItinerary(search, onAddStop)

    const input = screen.getByRole('combobox') as HTMLInputElement
    const addButton = screen.getByRole('button', { name: 'Add stop' }) as HTMLButtonElement
    expect(addButton.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'Luc' } })
    await advanceSearchDebounce()
    fireEvent.click(screen.getByRole('option'))
    expect(addButton.disabled).toBe(false)

    await act(async () => {
      fireEvent.click(addButton)
      await Promise.resolve()
    })

    expect(onAddStop).toHaveBeenCalledWith(lucca)
    expect(input.value).toBe('')
    expect(addButton.disabled).toBe(true)
  })

  it('does not add arbitrary text that was never selected', async () => {
    const search = vi.fn<SearchCitiesFunction>().mockResolvedValue([lucca])
    const onAddStop = vi.fn<(city: CitySearchResult) => Promise<void>>().mockResolvedValue()
    renderItinerary(search, onAddStop)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Lucca' } })
    const addButton = screen.getByRole('button', { name: 'Add stop' }) as HTMLButtonElement
    expect(addButton.disabled).toBe(true)
    fireEvent.submit(addButton.closest('form')!)

    expect(onAddStop).not.toHaveBeenCalled()
  })

  it('clears a previous selection when its input text is edited', async () => {
    const search = vi.fn<SearchCitiesFunction>().mockResolvedValue([lucca])
    const onAddStop = vi.fn<(city: CitySearchResult) => Promise<void>>().mockResolvedValue()
    renderItinerary(search, onAddStop)

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Luc' } })
    await advanceSearchDebounce()
    fireEvent.click(screen.getByRole('option'))

    const addButton = screen.getByRole('button', { name: 'Add stop' }) as HTMLButtonElement
    expect(addButton.disabled).toBe(false)
    fireEvent.change(input, { target: { value: 'Lucca, maybe' } })
    expect(addButton.disabled).toBe(true)
    fireEvent.submit(addButton.closest('form')!)

    expect(onAddStop).not.toHaveBeenCalled()
  })
})

function renderItinerary(search: SearchCitiesFunction, onAddStop: (city: CitySearchResult) => Promise<void>) {
  render(
    <Itinerary
      citySearch={search}
      isMutating={false}
      trip={trip}
      onAddStop={onAddStop}
      onDelete={() => Promise.resolve()}
      onMove={() => Promise.resolve()}
    />,
  )
}

async function advanceSearchDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300)
    await Promise.resolve()
  })
}
