// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import type { CitySearchResult } from '../types/travel'
import { CitySearch } from './CitySearch'
import type { SearchCitiesFunction } from './CitySearch'

const florenceItaly: CitySearchResult = {
  name: 'Florence',
  countryName: 'Italy',
  regionName: 'Tuscany',
  countryCode: 'IT',
  latitude: 43.7696,
  longitude: 11.2558,
}

const florenceUsa: CitySearchResult = {
  name: 'Florence',
  countryName: 'United States',
  regionName: 'Alabama',
  countryCode: 'US',
  latitude: 34.7998,
  longitude: -87.6773,
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CitySearch', () => {
  it('does not search empty, whitespace-only, or one-character input', async () => {
    const search = vi.fn<SearchCitiesFunction>().mockResolvedValue([])
    render(<Harness search={search} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '   ' } })
    await advanceSearchDebounce()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'F' } })
    await advanceSearchDebounce()

    expect(search).not.toHaveBeenCalled()
    expect(screen.getByText('Type at least 2 characters to search.')).toBeTruthy()
  })

  it('debounces requests, renders ambiguous results, and selects the full city result', async () => {
    const search = vi.fn<SearchCitiesFunction>().mockResolvedValue([florenceItaly, florenceUsa])
    const onSelected = vi.fn()
    render(<Harness search={search} onSelected={onSelected} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Flo' } })
    await act(async () => {
      vi.advanceTimersByTime(299)
    })
    expect(search).not.toHaveBeenCalled()

    await act(async () => {
      vi.advanceTimersByTime(1)
      await Promise.resolve()
    })

    expect(search).toHaveBeenCalledTimes(1)
    expect(search.mock.calls[0]?.[0]).toBe('Flo')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(screen.getByText('Italy · Tuscany')).toBeTruthy()
    expect(screen.getByText('United States · Alabama')).toBeTruthy()

    fireEvent.click(screen.getAllByRole('option')[0]!)

    expect(onSelected).toHaveBeenCalledWith(florenceItaly)
    expect(screen.getByText('Selected city')).toBeTruthy()
    expect(screen.getByText('Italy · Tuscany')).toBeTruthy()
  })

  it('prevents an older response from replacing newer results', async () => {
    const flo = deferred<CitySearchResult[]>()
    const flor = deferred<CitySearchResult[]>()
    const search = vi.fn<SearchCitiesFunction>()
      .mockImplementationOnce(() => flo.promise)
      .mockImplementationOnce(() => flor.promise)
    render(<Harness search={search} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Flo' } })
    await advanceSearchDebounce()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Flor' } })
    await advanceSearchDebounce()

    await act(async () => {
      flor.resolve([florenceItaly])
      await Promise.resolve()
    })
    expect(screen.getByText('Italy · Tuscany')).toBeTruthy()

    await act(async () => {
      flo.resolve([florenceUsa])
      await Promise.resolve()
    })
    expect(screen.queryByText('United States · Alabama')).toBeNull()
    expect(screen.getByText('Italy · Tuscany')).toBeTruthy()
  })

  it('shows no-results and API-error states', async () => {
    const search = vi.fn<SearchCitiesFunction>()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new ApiError(503, 'GEOCODING_UNAVAILABLE', 'City search is temporarily unavailable'))
    render(<Harness search={search} />)

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Noresults' } })
    await advanceSearchDebounce()
    expect(screen.getByText('No matching cities found.')).toBeTruthy()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Failure' } })
    await advanceSearchDebounce()
    expect(screen.getByRole('alert').textContent).toBe('City search is temporarily unavailable')
  })

  it('dismisses the dropdown with Escape', async () => {
    const search = vi.fn<SearchCitiesFunction>().mockResolvedValue([florenceItaly])
    render(<Harness search={search} />)
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: 'Flo' } })
    await advanceSearchDebounce()
    expect(screen.getByRole('option')).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('option')).toBeNull()
  })
})

function Harness({ search, onSelected = () => undefined }: {
  search: SearchCitiesFunction
  onSelected?: (result: CitySearchResult) => void
}) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<CitySearchResult | null>(null)

  return (
    <CitySearch
      query={query}
      search={search}
      selectedResult={selected}
      onQueryChange={(nextQuery) => {
        setQuery(nextQuery)
        setSelected(null)
      }}
      onSelect={(result) => {
        setQuery(result.name)
        setSelected(result)
        onSelected(result)
      }}
    />
  )
}

async function advanceSearchDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300)
    await Promise.resolve()
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}
