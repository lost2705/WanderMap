import { useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { askTravelAssistant } from '../api/assistant'
import type { TravelAssistantResponse } from '../api/assistant'
import { ApiError } from '../api/client'

interface TravelAssistantViewProps {
  backButtonRef?: RefObject<HTMLButtonElement | null>
  onBack: () => void
}

const STARTERS = [
  'Where should I travel next?',
  "Suggest somewhere different from places I've already visited.",
  'Which place from my bucket list should I consider next?',
]

const TOOL_LABELS: Record<string, string> = {
  get_travel_profile: 'Travel Profile',
  get_journeys: 'Journeys',
  get_bucket_list: 'Bucket List',
  get_weather: 'Short-term weather',
}

export function TravelAssistantView({ backButtonRef, onBack }: TravelAssistantViewProps) {
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<TravelAssistantResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const question = message.trim()
    if (!question || isLoading) {
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setResult(await askTravelAssistant(question))
    } catch (reason) {
      setResult(null)
      setError(assistantErrorMessage(reason))
    } finally {
      setIsLoading(false)
    }
  }

  function handleNewQuestion() {
    setMessage('')
    setResult(null)
    setError(null)
  }

  return (
    <section className="travel-assistant-view" aria-labelledby="travel-assistant-title">
      <header className="travel-profile-toolbar">
        <span className="profile-brand" aria-label="WanderMap">
          <span aria-hidden="true" className="brand-mark">W</span>
          <strong>WanderMap</strong>
        </span>
        <button className="button button-quiet profile-back" ref={backButtonRef} type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          Back to map
        </button>
      </header>

      <div className="travel-assistant-scroll">
        <article className="travel-assistant-page">
          <header className="travel-assistant-header">
            <p className="eyebrow">WanderMap 0.5</p>
            <h1 id="travel-assistant-title">Travel Assistant</h1>
            <p>Ask for ideas grounded in your Journeys, Travel Profile, and Bucket List.</p>
          </header>

          {!result ? (
            <form className="assistant-composer" onSubmit={(event) => void handleSubmit(event)}>
              <label htmlFor="travel-assistant-message">What would you like to explore?</label>
              <textarea
                id="travel-assistant-message"
                maxLength={4000}
                placeholder="Ask about your next trip…"
                rows={6}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
              />
              <div className="assistant-starters" aria-label="Suggested questions">
                {STARTERS.map((starter) => (
                  <button key={starter} type="button" onClick={() => setMessage(starter)}>{starter}</button>
                ))}
              </div>
              {error ? <p className="assistant-error" role="alert">{error}</p> : null}
              <button className="button button-primary assistant-send" disabled={!message.trim() || isLoading} type="submit">
                {isLoading ? 'Thinking…' : 'Ask WanderMap'}
              </button>
              {isLoading ? <p className="visually-hidden" role="status">Travel Assistant is thinking</p> : null}
            </form>
          ) : (
            <section className="assistant-answer" aria-live="polite" aria-labelledby="assistant-answer-heading">
              <p className="eyebrow">A personal recommendation</p>
              <h2 id="assistant-answer-heading">WanderMap suggests</h2>
              <p className="assistant-answer-text">{result.answer}</p>
              <div className="assistant-sources">
                <strong>Used WanderMap data</strong>
                {result.toolsUsed.length > 0 ? (
                  <ul>
                    {result.toolsUsed.map((tool) => <li key={tool}>{TOOL_LABELS[tool] ?? tool}</li>)}
                  </ul>
                ) : (
                  <p>No personal tools were needed for this answer.</p>
                )}
              </div>
              <button className="button button-secondary" type="button" onClick={handleNewQuestion}>New question</button>
            </section>
          )}
        </article>
      </div>
    </section>
  )
}

function assistantErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError && reason.code === 'AI_RATE_LIMITED') {
    return 'Travel Assistant is busy right now. Please try again shortly.'
  }
  return 'Travel Assistant is temporarily unavailable. Please try again.'
}
