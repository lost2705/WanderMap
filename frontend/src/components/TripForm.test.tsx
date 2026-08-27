// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TripForm } from './TripForm'

afterEach(cleanup)

describe('TripForm journal fields', () => {
  it('submits optional dates and description as calendar-date strings', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <TripForm
        isSubmitting={false}
        submitLabel="Create journey"
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Journey title'), { target: { value: 'Japan 2026' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-12' } })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Cherry blossoms and quiet mornings.' },
    })

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create journey' }).closest('form')!)
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Japan 2026',
      startDate: '2026-04-01',
      endDate: '2026-04-12',
      description: 'Cherry blossoms and quiet mornings.',
    })
  })

  it('loads existing values for editing and submits cleared optional fields as null', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <TripForm
        initialValue={{
          name: 'Japan 2026',
          startDate: '2026-04-01',
          endDate: '2026-04-12',
          description: 'Original journal summary',
        }}
        isSubmitting={false}
        submitLabel="Save changes"
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    expect(screen.getByLabelText<HTMLInputElement>('Start date').value).toBe('2026-04-01')
    expect(screen.getByLabelText<HTMLTextAreaElement>('Description').value).toBe('Original journal summary')
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: '' } })

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Save changes' }).closest('form')!)
      await Promise.resolve()
    })

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Japan 2026',
      startDate: null,
      endDate: null,
      description: null,
    })
  })

  it('shows understandable feedback for an invalid trip date range', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <TripForm
        isSubmitting={false}
        submitLabel="Create journey"
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Journey title'), { target: { value: 'Invalid trip' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-12' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-01' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create journey' }).closest('form')!)
    })

    expect(screen.getByRole('alert').textContent).toBe('End date cannot be before start date.')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('rejects a whitespace-only title with inline feedback', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(
      <TripForm
        isSubmitting={false}
        submitLabel="Create journey"
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Journey title'), { target: { value: '   ' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create journey' }).closest('form')!)
    })

    expect(screen.getByRole('alert').textContent).toBe('Journey title is required.')
    expect(screen.getByLabelText('Journey title').getAttribute('aria-invalid')).toBe('true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('preserves the draft and allows retry after a creation failure', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Journey service is unavailable.'))
    render(
      <TripForm
        isSubmitting={false}
        submitLabel="Create journey"
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Journey title'), { target: { value: 'Spain 2027' } })
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'A Mediterranean spring.' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create journey' }).closest('form')!)
      await Promise.resolve()
    })

    expect(screen.getByRole('alert').textContent).toBe('Journey service is unavailable.')
    expect(screen.getByLabelText<HTMLInputElement>('Journey title').value).toBe('Spain 2027')
    expect(screen.getByLabelText<HTMLTextAreaElement>('Description').value).toBe('A Mediterranean spring.')
    expect((screen.getByRole('button', { name: 'Create journey' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('prevents a second submit while creation is pending', async () => {
    const pending = deferred<void>()
    const onSubmit = vi.fn().mockReturnValue(pending.promise)
    render(
      <TripForm
        isSubmitting={false}
        submitLabel="Create journey"
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Journey title'), { target: { value: 'Spain 2027' } })
    const form = screen.getByRole('button', { name: 'Create journey' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true)

    await act(async () => {
      pending.resolve()
      await pending.promise
    })
    expect(screen.getByRole('button', { name: 'Create journey' })).toBeTruthy()
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve
  })
  return { promise, resolve }
}
