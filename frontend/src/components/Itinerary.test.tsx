// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CitySearchResult, StopJournalInput, Trip } from '../types/travel'
import type { SearchCitiesFunction } from './CitySearch'
import { Itinerary } from './Itinerary'

const trip: Trip = {
  id: 'trip-id',
  name: 'Tuscany',
  startDate: null,
  endDate: null,
  description: null,
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

const journalTrip: Trip = {
  id: 'japan-trip',
  name: 'Japan 2026',
  startDate: '2026-04-01',
  endDate: '2026-04-12',
  description: 'Cherry blossoms, trains, and quiet mornings.',
  stops: [
    {
      id: 'tokyo-stop',
      position: 1,
      arrivalDate: '2026-04-02',
      departureDate: '2026-04-05',
      note: 'Cherry blossoms in Ueno Park.',
      photos: [
        {
          id: 'tokyo-photo-two',
          originalFilename: 'lanterns.webp',
          contentType: 'image/webp',
          size: 220,
          position: 2,
          contentUrl: '/api/photos/tokyo-photo-two',
        },
        {
          id: 'tokyo-photo-one',
          originalFilename: 'blossoms.jpg',
          contentType: 'image/jpeg',
          size: 110,
          position: 1,
          contentUrl: '/api/photos/tokyo-photo-one',
        },
      ],
      city: {
        id: 'tokyo-city',
        name: 'Tokyo',
        latitude: 35.6762,
        longitude: 139.6503,
        country: { code: 'JP', name: 'Japan' },
      },
    },
    {
      id: 'kyoto-stop',
      position: 2,
      arrivalDate: null,
      departureDate: null,
      note: null,
      photos: [],
      city: {
        id: 'kyoto-city',
        name: 'Kyoto',
        latitude: 35.0116,
        longitude: 135.7681,
        country: { code: 'JP', name: 'Japan' },
      },
    },
  ],
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

describe('Itinerary journal', () => {
  it('renders a trip without journal data without placeholder dates or descriptions', () => {
    renderItinerary(vi.fn(), vi.fn())

    expect(screen.getByRole('heading', { name: 'Tuscany' })).toBeTruthy()
    expect(screen.queryByText(/From |Until |2026/)).toBeNull()
    expect(screen.getByText('Add your first stop to build an itinerary.')).toBeTruthy()
  })

  it('keeps a stop with no photos compact', () => {
    renderItinerary(vi.fn(), vi.fn(), vi.fn(), journalTrip)

    const kyoto = screen.getByText('Kyoto').closest('.stop-item')!
    expect(kyoto.textContent).toContain('No photos yet.')
    expect(screen.getByLabelText('Add photo for Kyoto')).toBeTruthy()
  })

  it('renders trip and stop journal content while leaving empty stop rows compact', () => {
    renderItinerary(vi.fn(), vi.fn(), vi.fn(), journalTrip)

    expect(screen.getByText('Apr 1, 2026 – Apr 12, 2026')).toBeTruthy()
    expect(screen.getByText('12 days')).toBeTruthy()
    expect(screen.getByText('2 places')).toBeTruthy()
    expect(screen.getByText('Cherry blossoms, trains, and quiet mornings.')).toBeTruthy()
    expect(screen.getByText('Apr 2, 2026 – Apr 5, 2026')).toBeTruthy()
    expect(screen.getByText('Cherry blossoms in Ueno Park.')).toBeTruthy()
    expect(screen.getByText('Kyoto').closest('.stop-item')?.querySelector('.stop-date-range')).toBeNull()
    expect(screen.getByText('Kyoto').closest('.stop-item')?.querySelector('.stop-note')).toBeNull()
    expect(screen.queryByLabelText('Arrival')).toBeNull()
    expect(screen.getByLabelText('Stop 1').textContent).toBe('01')
    expect(screen.getByLabelText('Stop 2').textContent).toBe('02')
  })

  it('renders photo thumbnails in deterministic position order', () => {
    renderItinerary(vi.fn(), vi.fn(), vi.fn(), journalTrip)

    const photos = screen.getAllByRole('img') as HTMLImageElement[]
    expect(photos.map((photo) => photo.alt)).toEqual(['Tokyo memory 1', 'Tokyo memory 2'])
    expect(photos.map((photo) => photo.src)).toEqual([
      'http://localhost:3000/api/photos/tokyo-photo-one',
      'http://localhost:3000/api/photos/tokyo-photo-two',
    ])
  })

  it('passes the selected native file to the stop photo upload action', async () => {
    const onUploadPhoto = vi.fn<(stopId: string, file: File) => Promise<void>>().mockResolvedValue()
    renderItinerary(vi.fn(), vi.fn(), vi.fn(), journalTrip, onUploadPhoto)
    const file = new File(['jpeg bytes'], 'Tokyo evening.jpg', { type: 'image/jpeg' })

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add photo for Tokyo'), { target: { files: [file] } })
      await Promise.resolve()
    })

    expect(onUploadPhoto).toHaveBeenCalledWith('tokyo-stop', file)
    expect(screen.getAllByText('Add photo')).toHaveLength(2)
  })

  it('keeps the photo controls usable after an upload failure', async () => {
    const onUploadPhoto = vi.fn<(stopId: string, file: File) => Promise<void>>()
      .mockRejectedValue(new Error('upload failed'))
    renderItinerary(vi.fn(), vi.fn(), vi.fn(), journalTrip, onUploadPhoto)

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add photo for Kyoto'), {
        target: { files: [new File(['bad'], 'bad.jpg', { type: 'image/jpeg' })] },
      })
      await Promise.resolve()
    })

    expect(onUploadPhoto).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText('Add photo for Kyoto') as HTMLInputElement).disabled).toBe(false)
    expect(screen.getByText('No photos yet.')).toBeTruthy()
  })

  it('invokes the delete action for the selected photo', async () => {
    const onDeletePhoto = vi.fn<(stopId: string, photoId: string) => Promise<void>>().mockResolvedValue()
    renderItinerary(vi.fn(), vi.fn(), vi.fn(), journalTrip, undefined, onDeletePhoto)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete blossoms.jpg' }))
      await Promise.resolve()
    })

    expect(onDeletePhoto).toHaveBeenCalledWith('tokyo-stop', 'tokyo-photo-one')
  })

  it('edits stop journal fields without changing the selected city', async () => {
    const onUpdateJournal = vi.fn<(stopId: string, input: StopJournalInput) => Promise<void>>().mockResolvedValue()
    renderItinerary(vi.fn(), vi.fn(), onUpdateJournal, journalTrip)

    fireEvent.click(screen.getByRole('button', { name: 'Edit journal for Tokyo' }))
    expect(screen.getByLabelText<HTMLInputElement>('Arrival').value).toBe('2026-04-02')
    expect(screen.getByLabelText<HTMLInputElement>('Departure').value).toBe('2026-04-05')
    expect(screen.getByLabelText<HTMLTextAreaElement>('Note').value).toBe('Cherry blossoms in Ueno Park.')

    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: '2026-04-03' } })
    fireEvent.change(screen.getByLabelText('Departure'), { target: { value: '2026-04-06' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Tsukiji breakfast.' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Save journal' }).closest('form')!)
      await Promise.resolve()
    })

    expect(onUpdateJournal).toHaveBeenCalledWith('tokyo-stop', {
      arrivalDate: '2026-04-03',
      departureDate: '2026-04-06',
      note: 'Tsukiji breakfast.',
    })
    expect(screen.queryByLabelText('Arrival')).toBeNull()
    expect(screen.getByText('Tokyo')).toBeTruthy()
  })

  it('cancels a journal edit without saving', () => {
    const onUpdateJournal = vi.fn()
    renderItinerary(vi.fn(), vi.fn(), onUpdateJournal, journalTrip)

    fireEvent.click(screen.getByRole('button', { name: 'Edit journal for Kyoto' }))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Do not save' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onUpdateJournal).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Note')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Edit journal for Kyoto' }))
    expect(screen.getByLabelText<HTMLTextAreaElement>('Note').value).toBe('')
  })

  it('shows validation feedback before submitting invalid stop dates', async () => {
    const onUpdateJournal = vi.fn()
    renderItinerary(vi.fn(), vi.fn(), onUpdateJournal, journalTrip)

    fireEvent.click(screen.getByRole('button', { name: 'Edit journal for Tokyo' }))
    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: '2026-04-08' } })
    fireEvent.change(screen.getByLabelText('Departure'), { target: { value: '2026-04-07' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Save journal' }).closest('form')!)
    })

    expect(screen.getByRole('alert').textContent).toBe('Departure date cannot be before arrival date.')
    expect(onUpdateJournal).not.toHaveBeenCalled()
  })
})

function renderItinerary(
  search: SearchCitiesFunction,
  onAddStop: (city: CitySearchResult) => Promise<void>,
  onUpdateJournal: (stopId: string, input: StopJournalInput) => Promise<void> = () => Promise.resolve(),
  selectedTrip: Trip = trip,
  onUploadPhoto: (stopId: string, file: File) => Promise<void> = () => Promise.resolve(),
  onDeletePhoto: (stopId: string, photoId: string) => Promise<void> = () => Promise.resolve(),
) {
  render(
    <Itinerary
      citySearch={search}
      isMutating={false}
      trip={selectedTrip}
      onAddStop={onAddStop}
      onDelete={() => Promise.resolve()}
      onMove={() => Promise.resolve()}
      onUpdateJournal={onUpdateJournal}
      onUploadPhoto={onUploadPhoto}
      onDeletePhoto={onDeletePhoto}
    />,
  )
}

async function advanceSearchDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(300)
    await Promise.resolve()
  })
}
