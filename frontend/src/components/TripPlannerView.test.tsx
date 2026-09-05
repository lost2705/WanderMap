// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'

vi.mock('../api/planner', () => ({ createTripPlan: vi.fn(), refineTripPlan: vi.fn(), applyTripPlan: vi.fn() }))

import { applyTripPlan, createTripPlan, refineTripPlan } from '../api/planner'
import type { Trip } from '../types/travel'
import type { TripPlanningResponse } from '../api/planner'
import { TripPlannerView } from './TripPlannerView'

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(createTripPlan).mockReset()
  vi.mocked(refineTripPlan).mockReset()
  vi.mocked(applyTripPlan).mockReset()
})

describe('TripPlannerView', () => {
  it('requires an explicit create action, keeps the review visible and submits only once while pending', async () => {
    let complete!: (trip: Trip) => void
    const onCreated = vi.fn()
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    vi.mocked(applyTripPlan).mockReturnValue(new Promise((resolve) => { complete = resolve }))
    render(<TripPlannerView onBack={vi.fn()} onCreated={onCreated} />)
    expect(screen.queryByRole('button', { name: 'Create Journey' })).toBeNull()
    await createDraft()
    expect(applyTripPlan).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Create Journey' }))
    fireEvent.click(screen.getByRole('button', { name: 'Creating Journey…' }))
    expect(applyTripPlan).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('heading', { name: 'Italy in October' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Creating Journey')
    expect((screen.getByLabelText('How should this plan change?') as HTMLTextAreaElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'New plan' }) as HTMLButtonElement).disabled).toBe(true)
    const trip = createdJourney()
    await act(async () => complete(trip))
    expect(onCreated).toHaveBeenCalledExactlyOnceWith(trip)
  })

  it.each([new Error('network'), new ApiError(503, 'APPLY_UNAVAILABLE')])(
    'preserves the draft and adjustment input on %s and retries the same idempotency key', async (error) => {
      vi.mocked(createTripPlan).mockResolvedValue(planResponse())
      vi.mocked(applyTripPlan).mockRejectedValueOnce(error).mockResolvedValue(createdJourney())
      const onCreated = vi.fn()
      render(<TripPlannerView onBack={vi.fn()} onCreated={onCreated} />)
      await createDraft()
      fireEvent.change(screen.getByLabelText('How should this plan change?'), { target: { value: 'Keep my ideas' } })
      fireEvent.click(screen.getByRole('button', { name: 'Create Journey' }))
      expect((await screen.findByRole('alert')).textContent).toContain('Retry to safely check the same request')
      expect(screen.getByRole('heading', { name: 'Italy in October' })).toBeTruthy()
      expect((screen.getByLabelText('How should this plan change?') as HTMLTextAreaElement).value).toBe('Keep my ideas')
      fireEvent.click(screen.getByRole('button', { name: 'Adjust plan' }))
      expect(document.activeElement).toBe(screen.getByLabelText('How should this plan change?'))
      fireEvent.click(screen.getByRole('button', { name: 'Create Journey' }))
      await act(async () => {})
      expect(onCreated).toHaveBeenCalledTimes(1)
      const [first, retry] = vi.mocked(applyTripPlan).mock.calls
      expect(retry).toEqual(first)
      expect(first?.[1]).toMatch(/^[0-9a-f-]{36}$/)
    },
  )

  it.each(['refine', 'new'])('stops retrying a conflicted key until an explicit %s draft replaces it', async (replacement) => {
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    vi.mocked(refineTripPlan).mockResolvedValue(planResponse('Adjusted Italy'))
    vi.mocked(applyTripPlan).mockRejectedValueOnce(new ApiError(409, 'CONFLICT')).mockResolvedValue(createdJourney())
    const onCreated = vi.fn()
    render(<TripPlannerView onBack={vi.fn()} onCreated={onCreated} />)
    await createDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Create Journey' }))
    expect((await screen.findByRole('alert')).textContent).toContain('Check your Journeys')
    const create = screen.getByRole('button', { name: 'Create Journey' }) as HTMLButtonElement
    expect(create.disabled).toBe(true)
    fireEvent.click(create)
    expect(applyTripPlan).toHaveBeenCalledTimes(1)
    if (replacement === 'refine') {
      fireEvent.click(screen.getByRole('button', { name: 'Use fewer cities.' }))
      fireEvent.click(screen.getByRole('button', { name: 'Update plan' }))
      await screen.findByRole('heading', { name: 'Adjusted Italy' })
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'New plan' }))
      await createDraft()
    }
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Create Journey' }))
    await act(async () => {})
    expect(onCreated).toHaveBeenCalledTimes(1)
    const [first, next] = vi.mocked(applyTripPlan).mock.calls
    expect(next?.[1]).not.toBe(first?.[1])
  })

  it('uses a new request key after refinement and New plan while never applying automatically', async () => {
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    vi.mocked(applyTripPlan).mockRejectedValue(new ApiError(400, 'PLACE_UNRESOLVED'))
    vi.mocked(refineTripPlan).mockResolvedValue(planResponse('Adjusted Italy'))
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    await createDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Create Journey' }))
    await screen.findByRole('alert')
    fireEvent.change(screen.getByLabelText('How should this plan change?'), { target: { value: 'Resolve again' } })
    fireEvent.keyDown(screen.getByLabelText('How should this plan change?'), { key: 'Enter' })
    expect(applyTripPlan).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Update plan' }))
    await screen.findByRole('heading', { name: 'Adjusted Italy' })
    expect(applyTripPlan).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Create Journey' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'New plan' }))
    expect(screen.queryByRole('button', { name: 'Create Journey' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    await createDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Create Journey' }))
    await screen.findByRole('alert')
    expect(new Set(vi.mocked(applyTripPlan).mock.calls.map((call) => call[1])).size).toBe(3)
  })

  it('ignores an apply response after the planner unmounts', async () => {
    let complete!: (trip: Trip) => void
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    vi.mocked(applyTripPlan).mockReturnValue(new Promise((resolve) => { complete = resolve }))
    const onCreated = vi.fn()
    const view = render(<TripPlannerView onBack={vi.fn()} onCreated={onCreated} />)
    await createDraft()
    fireEvent.click(screen.getByRole('button', { name: 'Create Journey' }))
    view.unmount()
    await act(async () => complete(createdJourney()))
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('submits a trimmed natural-language request and renders a structured editorial plan', async () => {
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    const submit = screen.getByRole('button', { name: 'Create draft' })

    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), {
      target: { value: '  Seven relaxed days in Italy  ' },
    })
    fireEvent.click(submit)

    await screen.findByRole('heading', { name: 'Italy in October' })
    expect(createTripPlan).toHaveBeenCalledWith('Seven relaxed days in Italy')
    expect(screen.getByText('7 days')).toBeTruthy()
    expect(screen.getByText('Relaxed')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Rome' })).toBeTruthy()
    expect(screen.getByText('Historic centre')).toBeTruthy()
    expect(screen.getByText('Exact October weather is not available yet.')).toBeTruthy()
    expect(screen.getByText('Bucket List')).toBeTruthy()
    expect(screen.getByText('Place Search')).toBeTruthy()
    expect((screen.getByLabelText('How should this plan change?') as HTMLTextAreaElement).maxLength).toBe(4000)
    expect((screen.getByRole('button', { name: 'Update plan' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a loading state while the draft is being created', () => {
    vi.mocked(createTripPlan).mockReturnValue(new Promise(() => {}))
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), {
      target: { value: 'Plan Italy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))

    expect(screen.getByRole('status').textContent).toContain('creating your trip draft')
    expect(screen.getByRole('button', { name: 'Creating draft…' })).toBeTruthy()
  })

  it('uses a preset as a normal refinement instruction and replaces the plan on success', async () => {
    const initial = planResponse()
    const refined = planResponse('A calmer Italy')
    refined.plan.pace = 'RELAXED'
    refined.plan.stops = [refined.plan.stops[0]!]
    refined.plan.durationDays = 4
    vi.mocked(createTripPlan).mockResolvedValue(initial)
    vi.mocked(refineTripPlan).mockResolvedValue(refined)
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), {
      target: { value: 'Plan Italy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    await screen.findByRole('heading', { name: 'Italy in October' })

    fireEvent.click(screen.getByRole('button', { name: 'Make it more relaxed.' }))
    expect((screen.getByLabelText('How should this plan change?') as HTMLTextAreaElement).value)
      .toBe('Make it more relaxed.')
    fireEvent.click(screen.getByRole('button', { name: 'Update plan' }))

    await screen.findByRole('heading', { name: 'A calmer Italy' })
    expect(refineTripPlan).toHaveBeenCalledWith(initial.plan, 'Make it more relaxed.')
    expect(screen.queryByRole('heading', { name: 'Florence' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('Plan updated')
  })

  it('keeps the current plan visible and prevents duplicate submissions while refining', async () => {
    let resolveRefinement!: (value: TripPlanningResponse) => void
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    vi.mocked(refineTripPlan).mockReturnValue(new Promise((resolve) => { resolveRefinement = resolve }))
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), {
      target: { value: 'Plan Italy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    await screen.findByRole('heading', { name: 'Italy in October' })
    fireEvent.change(screen.getByLabelText('How should this plan change?'), {
      target: { value: 'Use fewer cities' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update plan' }))

    expect(screen.getByRole('heading', { name: 'Italy in October' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Florence' })).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Updating plan…' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('status').textContent).toContain('current plan will stay visible')
    fireEvent.click(screen.getByRole('button', { name: 'Updating plan…' }))
    expect(refineTripPlan).toHaveBeenCalledTimes(1)

    await act(async () => resolveRefinement(planResponse('Updated Italy')))
    await screen.findByRole('heading', { name: 'Updated Italy' })
  })

  it('keeps the old plan and instruction after an error so refinement can be retried', async () => {
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    vi.mocked(refineTripPlan)
      .mockRejectedValueOnce(new ApiError(502, 'AI_INVALID_PLAN'))
      .mockResolvedValueOnce(planResponse('Retried Italy'))
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), {
      target: { value: 'Plan Italy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    await screen.findByRole('heading', { name: 'Italy in October' })
    fireEvent.change(screen.getByLabelText('How should this plan change?'), {
      target: { value: 'Shorten to five days' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update plan' }))

    expect((await screen.findByRole('alert')).textContent).toContain('consistent draft')
    expect(screen.getByRole('heading', { name: 'Italy in October' })).toBeTruthy()
    expect((screen.getByLabelText('How should this plan change?') as HTMLTextAreaElement).value)
      .toBe('Shorten to five days')

    fireEvent.click(screen.getByRole('button', { name: 'Update plan' }))
    await screen.findByRole('heading', { name: 'Retried Italy' })
    expect(refineTripPlan).toHaveBeenCalledTimes(2)
  })

  it('starts a new plan without persisting the previous result', async () => {
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', {
      name: 'Plan 7 relaxed days in Italy focused on food and architecture.',
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    await screen.findByRole('heading', { name: 'Italy in October' })

    fireEvent.click(screen.getByRole('button', { name: 'New plan' }))

    expect(screen.queryByRole('heading', { name: 'Italy in October' })).toBeNull()
    expect((screen.getByLabelText('What kind of trip are you imagining?') as HTMLTextAreaElement).value).toBe('')
    expect(screen.queryByLabelText('How should this plan change?')).toBeNull()
  })

  it('shows controlled recoverable errors', async () => {
    vi.mocked(createTripPlan).mockRejectedValue(new ApiError(502, 'AI_INVALID_PLAN'))
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), {
      target: { value: 'Conflicting request' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))

    expect((await screen.findByRole('alert')).textContent).toContain('consistent draft')
    expect(screen.getByRole('button', { name: 'Create draft' })).toBeTruthy()
  })

  it('renders strings as text and never exposes raw structured payload fields', async () => {
    const response = planResponse()
    response.plan.summary = '<img src=x onerror=alert(1)>A safe summary'
    vi.mocked(createTripPlan).mockResolvedValue(response)
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), {
      target: { value: 'Safe plan' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))

    await screen.findByText('<img src=x onerror=alert(1)>A safe summary')
    expect(document.querySelector('.trip-plan-summary img')).toBeNull()
    expect(screen.queryByText('41.9028')).toBeNull()
    expect(screen.queryByText('run-planner-1')).toBeNull()
  })

  it('renders refined content as text without exposing raw coordinates or run metadata', async () => {
    const refined = planResponse('<script>alert(1)</script>Refined Italy')
    refined.plan.summary = '<img src=x onerror=alert(1)>Still safe'
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    vi.mocked(refineTripPlan).mockResolvedValue(refined)
    render(<TripPlannerView onBack={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), {
      target: { value: 'Plan Italy' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
    await screen.findByRole('heading', { name: 'Italy in October' })
    fireEvent.change(screen.getByLabelText('How should this plan change?'), {
      target: { value: 'Refine safely' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Update plan' }))

    await screen.findByRole('heading', { name: '<script>alert(1)</script>Refined Italy' })
    expect(document.querySelector('.trip-plan-heading script')).toBeNull()
    expect(document.querySelector('.trip-plan-summary img')).toBeNull()
    expect(screen.queryByText('41.9028')).toBeNull()
    expect(screen.queryByText('run-planner-1')).toBeNull()
  })
})

function planResponse(title = 'Italy in October'): TripPlanningResponse {
  return {
    runId: 'run-planner-1',
    toolsUsed: ['get_bucket_list', 'search_places'],
    plan: {
      title,
      summary: 'A relaxed trip focused on food and architecture.',
      durationDays: 7,
      startDate: null,
      endDate: null,
      destinationSummary: 'Italy in October',
      pace: 'RELAXED',
      stops: [
        {
          cityName: 'Rome',
          countryCode: 'IT',
          countryName: 'Italy',
          latitude: 41.9028,
          longitude: 12.4964,
          daysAtStop: 4,
          reason: 'Architecture and food fit the request.',
          activities: ['Historic centre', 'Roman architecture'],
          bucketListMatch: true,
          alreadyVisited: false,
        },
        {
          cityName: 'Florence',
          countryCode: 'IT',
          countryName: 'Italy',
          latitude: 43.7696,
          longitude: 11.2558,
          daysAtStop: 3,
          reason: 'A slower second base keeps the pace relaxed.',
          activities: ['Renaissance art'],
          bucketListMatch: false,
          alreadyVisited: false,
        },
      ],
      considerations: ['Exact October weather is not available yet.'],
      sourcesUsed: ['Bucket List', 'Place Search'],
    },
  }
}

async function createDraft() {
  fireEvent.change(screen.getByLabelText('What kind of trip are you imagining?'), { target: { value: 'Plan Italy' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create draft' }))
  await screen.findByRole('heading', { name: 'Italy in October' })
}

function createdJourney(): Trip {
  return { id: 'created', name: 'Italy in October', startDate: null, endDate: null, description: null, stops: [] }
}
