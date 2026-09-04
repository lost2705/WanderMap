// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'

vi.mock('../api/assistant', () => ({ askTravelAssistant: vi.fn() }))

import { askTravelAssistant } from '../api/assistant'
import { TravelAssistantView } from './TravelAssistantView'

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(askTravelAssistant).mockReset()
})

describe('TravelAssistantView', () => {
  it('rejects an empty question and sends a trimmed prompt', async () => {
    vi.mocked(askTravelAssistant).mockResolvedValue({
      runId: 'run-1',
      answer: 'Try Porto.',
      toolsUsed: [],
    })
    render(<TravelAssistantView onBack={vi.fn()} />)
    const send = screen.getByRole('button', { name: 'Ask WanderMap' })

    expect((send as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('What would you like to explore?'), {
      target: { value: '  Where next?  ' },
    })
    fireEvent.click(send)

    await screen.findByText('Try Porto.')
    expect(askTravelAssistant).toHaveBeenCalledWith('Where next?')
  })

  it('shows loading, the final answer, and tools used', async () => {
    let resolve!: (value: { runId: string; answer: string; toolsUsed: string[] }) => void
    vi.mocked(askTravelAssistant).mockReturnValue(new Promise((done) => { resolve = done }))
    render(<TravelAssistantView onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What would you like to explore?'), {
      target: { value: 'Use my map' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask WanderMap' }))

    expect(screen.getByRole('status').textContent).toContain('thinking')
    expect(screen.getByRole('button', { name: 'Thinking…' })).toBeTruthy()
    resolve({
      runId: 'run-2',
      answer: 'Because you revisit Italy, consider nearby Slovenia.',
      toolsUsed: ['get_travel_profile', 'get_journeys', 'get_weather'],
    })

    await screen.findByText('Because you revisit Italy, consider nearby Slovenia.')
    expect(screen.getByText('Travel Profile')).toBeTruthy()
    expect(screen.getByText('Journeys')).toBeTruthy()
    expect(screen.getByText('Short-term weather')).toBeTruthy()
  })

  it('starts a new question without persistent conversation history', async () => {
    vi.mocked(askTravelAssistant).mockResolvedValue({
      runId: 'run-3',
      answer: 'Try Kyoto.',
      toolsUsed: ['get_bucket_list'],
    })
    render(<TravelAssistantView onBack={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Which place from my bucket list should I consider next?' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask WanderMap' }))
    await screen.findByText('Try Kyoto.')

    fireEvent.click(screen.getByRole('button', { name: 'New question' }))

    expect(screen.queryByText('Try Kyoto.')).toBeNull()
    expect((screen.getByLabelText('What would you like to explore?') as HTMLTextAreaElement).value).toBe('')
  })

  it('shows a recoverable provider error', async () => {
    vi.mocked(askTravelAssistant).mockRejectedValue(new ApiError(503, 'AI_UNAVAILABLE'))
    render(<TravelAssistantView onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What would you like to explore?'), {
      target: { value: 'Where next?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask WanderMap' }))

    expect((await screen.findByRole('alert')).textContent).toContain('temporarily unavailable')
    expect(screen.getByRole('button', { name: 'Ask WanderMap' })).toBeTruthy()
  })

  it('renders model output as plain text without interpreting unsafe HTML', async () => {
    vi.mocked(askTravelAssistant).mockResolvedValue({
      runId: 'run-4',
      answer: '<img src=x onerror=alert(1)>Visit Rome',
      toolsUsed: [],
    })
    render(<TravelAssistantView onBack={vi.fn()} />)
    fireEvent.change(screen.getByLabelText('What would you like to explore?'), {
      target: { value: 'Unsafe answer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ask WanderMap' }))

    await screen.findByText('<img src=x onerror=alert(1)>Visit Rome')
    expect(document.querySelector('.assistant-answer-text img')).toBeNull()
  })
})
