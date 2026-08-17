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
        submitLabel="Create trip"
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Japan 2026' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-01' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-12' } })
    fireEvent.change(screen.getByLabelText('Description'), {
      target: { value: 'Cherry blossoms and quiet mornings.' },
    })

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create trip' }).closest('form')!)
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
        submitLabel="Create trip"
        onCancel={() => undefined}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Invalid trip' } })
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-04-12' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-04-01' } })
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: 'Create trip' }).closest('form')!)
    })

    expect(screen.getByRole('alert').textContent).toBe('End date cannot be before start date.')
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
