// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { City, PlaceVisit } from '../types/travel'
import { MemoryView } from './MemoryView'

const tokyo: City = {
  id: 'city-tokyo',
  name: 'Tokyo',
  latitude: 35.6762,
  longitude: 139.6503,
  country: { code: 'JP', name: 'Japan' },
}

const visit: PlaceVisit = {
  tripId: 'japan-2026',
  tripName: 'Japan 2026',
  tripStartDate: '2026-04-01',
  tripEndDate: '2026-04-14',
  tripDescription: 'Spring through Japan.',
  stopId: 'tokyo-first-visit',
  position: 1,
  arrivalDate: '2026-04-05',
  departureDate: '2026-04-09',
  note: 'Morning light in Shinjuku.\nSenso-ji before the crowds.',
  photos: [photo('third', 3), photo('first', 1), photo('second', 2)],
}

afterEach(cleanup)

describe('MemoryView', () => {
  it('renders stored journal content and photos in deterministic position order', () => {
    renderMemory(visit)

    expect(screen.getByRole('heading', { name: 'Tokyo' })).toBeTruthy()
    expect(screen.getByText('Japan', { selector: '.memory-country' })).toBeTruthy()
    expect(screen.getByText('Apr 5, 2026 – Apr 9, 2026')).toBeTruthy()
    expect(screen.getByText('4 nights')).toBeTruthy()
    expect(screen.getByText(/Morning light in Shinjuku/)).toBeTruthy()
    expect(screen.getAllByRole('img').map((image) => image.getAttribute('src')))
      .toEqual(['/photos/1', '/photos/2', '/photos/3'])
    expect(screen.getByRole('region', { name: 'Memory view' }).getAttribute('data-memory-id'))
      .toBe('tokyo-first-visit')
  })

  it('keeps two visits to the same city distinct by stop id', () => {
    const { rerender } = renderMemory(visit)
    const secondVisit = {
      ...visit,
      tripId: 'japan-return',
      tripName: 'Japan Return',
      stopId: 'tokyo-second-visit',
      note: 'A different Tokyo visit.',
      photos: [],
    }

    rerender(memoryElement(secondVisit))

    expect(screen.getByRole('heading', { name: 'Tokyo' })).toBeTruthy()
    expect(screen.getByText('A different Tokyo visit.')).toBeTruthy()
    expect(screen.queryByText(/Morning light in Shinjuku/)).toBeNull()
    expect(screen.getByRole('region', { name: 'Memory view' }).getAttribute('data-memory-id'))
      .toBe('tokyo-second-visit')
  })

  it('renders notes-only, photos-only and missing-date memories without invented content', () => {
    const notesOnly = {
      ...visit,
      arrivalDate: null,
      departureDate: null,
      tripStartDate: null,
      tripEndDate: null,
      tripDescription: null,
      photos: [],
    }
    const { rerender } = renderMemory(notesOnly)

    expect(screen.getByText(/Morning light in Shinjuku/)).toBeTruthy()
    expect(screen.getByText('No photos were added to this visit.')).toBeTruthy()
    expect(screen.queryByLabelText('Visit dates')).toBeNull()
    expect(screen.queryByText('Spring through Japan.')).toBeNull()

    const photosOnly = { ...notesOnly, stopId: 'tokyo-photo-visit', note: null, photos: [photo('only', 1)] }
    rerender(memoryElement(photosOnly))

    expect(screen.getByRole('img', { name: 'Tokyo memory, photo 1' })).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Journal entry' })).toBeNull()
    expect(screen.queryByText('This visit does not have journal notes or photos yet.')).toBeNull()
  })

  it('uses intentional gallery layouts for one, two and many photos', () => {
    const { rerender } = renderMemory({ ...visit, photos: [photo('only', 1)] })
    expect(document.querySelector('.memory-gallery')?.classList.contains('is-single')).toBe(true)

    rerender(memoryElement({ ...visit, photos: [photo('first', 1), photo('second', 2)] }))
    expect(document.querySelector('.memory-gallery')?.classList.contains('is-pair')).toBe(true)

    rerender(memoryElement(visit))
    expect(document.querySelector('.memory-gallery')?.classList.contains('is-collection')).toBe(true)
  })

  it('uses the existing navigation callbacks for place, journey, world and back', () => {
    const actions = {
      onBack: vi.fn(),
      onJourney: vi.fn(),
      onPlace: vi.fn(),
      onWorld: vi.fn(),
    }
    render(memoryElement(visit, actions))

    fireEvent.click(screen.getByRole('button', { name: /Back to Tokyo/ }))
    fireEvent.click(screen.getByRole('button', { name: 'World' }))
    fireEvent.click(screen.getAllByRole('button', { name: 'Japan 2026' })[0]!)
    fireEvent.click(screen.getAllByRole('button', { name: 'Tokyo' })[0]!)

    expect(actions.onBack).toHaveBeenCalledOnce()
    expect(actions.onWorld).toHaveBeenCalledOnce()
    expect(actions.onJourney).toHaveBeenCalledOnce()
    expect(actions.onPlace).toHaveBeenCalledOnce()
  })

  it('opens the editor with the stored dates and note, then saves through the visit identity', async () => {
    const onUpdateJournal = vi.fn().mockResolvedValue(undefined)
    render(memoryElement(visit, { onUpdateJournal }))

    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))

    expect(screen.getByText(/Dates and journal changes stay as a draft until you save/)).toBeTruthy()
    expect(screen.getByText(/Photo changes are saved immediately/)).toBeTruthy()

    expect((screen.getByLabelText('Arrival') as HTMLInputElement).value).toBe('2026-04-05')
    expect((screen.getByLabelText('Departure') as HTMLInputElement).value).toBe('2026-04-09')
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value)
      .toBe('Morning light in Shinjuku.\nSenso-ji before the crowds.')

    fireEvent.change(screen.getByLabelText('Arrival'), { target: { value: '2026-04-06' } })
    fireEvent.change(screen.getByLabelText('Departure'), { target: { value: '2026-04-10' } })
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'An edited Tokyo memory.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }))

    await waitFor(() => expect(onUpdateJournal).toHaveBeenCalledWith({
      arrivalDate: '2026-04-06',
      departureDate: '2026-04-10',
      note: 'An edited Tokyo memory.',
    }))
    expect(screen.queryByRole('form', { name: 'Edit memory for Tokyo' })).toBeNull()
    expect(screen.getByRole('region', { name: 'Memory view' }).getAttribute('data-memory-id'))
      .toBe('tokyo-first-visit')
  })

  it('cancels a draft without saving it', () => {
    const onUpdateJournal = vi.fn().mockResolvedValue(undefined)
    render(memoryElement(visit, { onUpdateJournal }))
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Discard this draft.' } })

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onUpdateJournal).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('Discard this draft.')).toBeNull()
    expect(screen.getByText(/Morning light in Shinjuku/)).toBeTruthy()
  })

  it('keeps a failed save and its draft open for retry', async () => {
    const onUpdateJournal = vi.fn().mockRejectedValue(new Error('offline'))
    render(memoryElement(visit, { onUpdateJournal }))
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Keep this draft.' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }))

    expect(await screen.findByText('Couldn’t save this memory. Your draft is still here.')).toBeTruthy()
    expect((screen.getByLabelText('Note') as HTMLTextAreaElement).value).toBe('Keep this draft.')
    expect(screen.getByRole('form', { name: 'Edit memory for Tokyo' })).toBeTruthy()
  })

  it('prevents duplicate journal submissions while a save is pending', async () => {
    const request = deferred<void>()
    const onUpdateJournal = vi.fn().mockReturnValue(request.promise)
    render(memoryElement(visit, { onUpdateJournal }))
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    const form = screen.getByRole('form', { name: 'Edit memory for Tokyo' })

    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(onUpdateJournal).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeTruthy()
    await act(async () => request.resolve())
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Edit memory for Tokyo' })).toBeNull())
  })

  it('uploads and deletes photos from edit mode in deterministic position order', async () => {
    const onDeletePhoto = vi.fn().mockResolvedValue(undefined)
    const onUploadPhoto = vi.fn().mockResolvedValue(undefined)
    render(memoryElement(visit, { onDeletePhoto, onUploadPhoto }))
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))

    expect(screen.getAllByRole('img').map((image) => image.getAttribute('src')))
      .toEqual(['/photos/1', '/photos/2', '/photos/3'])
    const file = new File(['photo'], 'new-memory.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Add photo for Tokyo'), { target: { files: [file] } })
    await waitFor(() => expect(onUploadPhoto).toHaveBeenCalledWith(file))

    fireEvent.click(screen.getByRole('button', { name: 'Delete first.jpg' }))
    await waitFor(() => expect(onDeletePhoto).toHaveBeenCalledWith('first'))
  })

  it('shows photo loading and failure states without dropping persisted photos', async () => {
    const uploadRequest = deferred<void>()
    const onUploadPhoto = vi.fn().mockReturnValueOnce(uploadRequest.promise)
    const onDeletePhoto = vi.fn().mockRejectedValueOnce(new Error('delete failed'))
    render(memoryElement(visit, { onDeletePhoto, onUploadPhoto }))
    fireEvent.click(screen.getByRole('button', { name: /Edit/ }))
    const file = new File(['photo'], 'pending.jpg', { type: 'image/jpeg' })

    fireEvent.change(screen.getByLabelText('Add photo for Tokyo'), { target: { files: [file] } })
    expect(screen.getByText('Uploading…')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Delete first.jpg' }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => uploadRequest.reject(new Error('upload failed')))
    expect(await screen.findByText('Couldn’t upload this photo. Please try again.')).toBeTruthy()
    expect(screen.getAllByRole('img')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: 'Delete first.jpg' }))
    expect(await screen.findByText('Couldn’t remove this photo. It is still part of the memory.')).toBeTruthy()
    expect(screen.getByRole('img', { name: 'Tokyo memory, photo 1' })).toBeTruthy()
  })
})

function renderMemory(memory: PlaceVisit) {
  return render(memoryElement(memory))
}

function memoryElement(
  memory: PlaceVisit,
  actions: Partial<MemoryActions> = {},
) {
  const defaults: MemoryActions = {
    onBack: () => undefined,
    onDeletePhoto: () => Promise.resolve(),
    onJourney: () => undefined,
    onPlace: () => undefined,
    onUpdateJournal: () => Promise.resolve(),
    onUploadPhoto: () => Promise.resolve(),
    onWorld: () => undefined,
  }
  return (
    <MemoryView
      city={tokyo}
      isMutating={false}
      origin="place"
      visit={memory}
      {...defaults}
      {...actions}
    />
  )
}

interface MemoryActions {
  onBack: () => void
  onDeletePhoto: (photoId: string) => Promise<void>
  onJourney: () => void
  onPlace: () => void
  onUpdateJournal: (input: {
    arrivalDate: string | null
    departureDate: string | null
    note: string | null
  }) => Promise<void>
  onUploadPhoto: (file: File) => Promise<void>
  onWorld: () => void
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
