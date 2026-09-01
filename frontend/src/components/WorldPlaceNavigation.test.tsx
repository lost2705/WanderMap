// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TripMapOverview } from '../types/travel'
import { WorldPlaceNavigation } from './WorldPlaceNavigation'

const overview: TripMapOverview = {
  visitedCountryCodes: ['IT', 'JP'],
  memoryCount: 3,
  markers: [
    placeMarker('trip-b', 'rome-return', 'city-rome', 3, 'Rome', 'IT', 'Italy', 41.9028, 12.4964),
    placeMarker('trip-a', 'tokyo', 'city-tokyo', 1, 'Tokyo', 'JP', 'Japan', 35.6762, 139.6503),
    placeMarker('trip-a', 'rome-first', 'city-rome', 1, 'Rome', 'IT', 'Italy', 41.9028, 12.4964),
  ],
}

afterEach(cleanup)

describe('WorldPlaceNavigation', () => {
  it('discloses one native control per unique cityId with country and visit context', () => {
    render(<WorldPlaceNavigation overview={overview} onSelectPlace={() => undefined} />)
    const region = screen.getByRole('region', { name: 'Visited places' })
    const toggle = within(region).getByRole('button', { name: 'Visited places — 2 places' })

    expect(toggle.tagName).toBe('BUTTON')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(region).queryByRole('button', { name: /Open Rome/ })).toBeNull()

    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(within(region).getAllByRole('button', { name: /^Open / })).toHaveLength(2)
    expect(within(region).getByRole('button', { name: 'Open Rome, Italy — 2 visits' })).toBeTruthy()
    expect(within(region).getByRole('button', { name: 'Open Tokyo, Japan — 1 visit' })).toBeTruthy()
    expect(within(region).queryByRole('button', { name: /rome-return/ })).toBeNull()
  })

  it('uses native keyboard-focusable activation and keeps identity across rerenders', () => {
    const onSelectPlace = vi.fn()
    const view = render(<WorldPlaceNavigation overview={overview} onSelectPlace={onSelectPlace} />)
    fireEvent.click(screen.getByRole('button', { name: 'Visited places — 2 places' }))
    const rome = screen.getByRole('button', { name: 'Open Rome, Italy — 2 visits' })

    rome.focus()
    expect(document.activeElement).toBe(rome)
    expect(rome.tabIndex).toBe(0)
    rome.click()
    expect(onSelectPlace).toHaveBeenCalledWith('city-rome')

    view.rerender(<WorldPlaceNavigation overview={{ ...overview }} onSelectPlace={onSelectPlace} />)
    expect(screen.getByRole('button', { name: 'Visited places — 2 places' }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('button', { name: /^Open / })).toHaveLength(2)
  })

  it('does not render meaningless navigation for an empty World', () => {
    render(<WorldPlaceNavigation overview={null} onSelectPlace={() => undefined} />)
    expect(screen.queryByRole('region', { name: 'Visited places' })).toBeNull()
  })
})

function placeMarker(
  tripId: string,
  stopId: string,
  cityId: string,
  position: number,
  cityName: string,
  countryCode: string,
  countryName: string,
  latitude: number,
  longitude: number,
): TripMapOverview['markers'][number] {
  return {
    tripId,
    stopId,
    cityId,
    position,
    cityName,
    latitude,
    longitude,
    country: { code: countryCode, name: countryName },
  }
}
