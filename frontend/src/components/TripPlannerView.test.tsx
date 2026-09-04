// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'

vi.mock('../api/planner', () => ({ createTripPlan: vi.fn(), refineTripPlan: vi.fn() }))

import { createTripPlan, refineTripPlan } from '../api/planner'
import type { TripPlanningResponse } from '../api/planner'
import { TripPlannerView } from './TripPlannerView'

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(createTripPlan).mockReset()
  vi.mocked(refineTripPlan).mockReset()
})

describe('TripPlannerView', () => {
  it('submits a trimmed natural-language request and renders a structured editorial plan', async () => {
    vi.mocked(createTripPlan).mockResolvedValue(planResponse())
    render(<TripPlannerView onBack={vi.fn()} />)
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
    render(<TripPlannerView onBack={vi.fn()} />)
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
    render(<TripPlannerView onBack={vi.fn()} />)
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
    render(<TripPlannerView onBack={vi.fn()} />)
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
    render(<TripPlannerView onBack={vi.fn()} />)
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
    render(<TripPlannerView onBack={vi.fn()} />)
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
    render(<TripPlannerView onBack={vi.fn()} />)
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
    render(<TripPlannerView onBack={vi.fn()} />)
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
    render(<TripPlannerView onBack={vi.fn()} />)
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
