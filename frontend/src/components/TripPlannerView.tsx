import { useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { createTripPlan, refineTripPlan } from '../api/planner'
import type { TripPlanningResponse } from '../api/planner'
import { ApiError } from '../api/client'

interface TripPlannerViewProps {
  backButtonRef?: RefObject<HTMLButtonElement | null>
  onBack: () => void
}

const STARTERS = [
  'Plan 7 relaxed days in Italy focused on food and architecture.',
  "Suggest a 5-day trip somewhere I haven't visited yet.",
  'Plan a week using places from my Bucket List.',
]

const REFINEMENT_STARTERS = [
  'Make it more relaxed.',
  'Use fewer cities.',
  'Add a place from my Bucket List.',
  "Avoid places I've visited.",
]

export function TripPlannerView({ backButtonRef, onBack }: TripPlannerViewProps) {
  const [message, setMessage] = useState('')
  const [refinementMessage, setRefinementMessage] = useState('')
  const [result, setResult] = useState<TripPlanningResponse | null>(null)
  const [pendingAction, setPendingAction] = useState<'create' | 'refine' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refinementError, setRefinementError] = useState<string | null>(null)
  const [wasRefined, setWasRefined] = useState(false)
  const isLoading = pendingAction !== null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const request = message.trim()
    if (!request || isLoading) {
      return
    }
    setPendingAction('create')
    setError(null)
    try {
      setResult(await createTripPlan(request))
      setWasRefined(false)
    } catch (reason) {
      setResult(null)
      setError(plannerErrorMessage(reason))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleRefinement(event: FormEvent) {
    event.preventDefault()
    const request = refinementMessage.trim()
    if (!result || !request || isLoading) {
      return
    }
    setPendingAction('refine')
    setRefinementError(null)
    setWasRefined(false)
    try {
      const refined = await refineTripPlan(result.plan, request)
      setResult(refined)
      setRefinementMessage('')
      setWasRefined(true)
    } catch (reason) {
      setRefinementError(plannerErrorMessage(reason))
    } finally {
      setPendingAction(null)
    }
  }

  function handleNewPlan() {
    setMessage('')
    setRefinementMessage('')
    setResult(null)
    setError(null)
    setRefinementError(null)
    setWasRefined(false)
  }

  return (
    <section className="travel-assistant-view trip-planner-view" aria-labelledby="trip-planner-title">
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
        <article className="travel-assistant-page trip-planner-page">
          {!result ? (
            <>
              <header className="travel-assistant-header">
                <p className="eyebrow">WanderMap 0.6</p>
                <h1 id="trip-planner-title">Plan a trip</h1>
                <p>Describe the trip you want to take. WanderMap will create a read-only draft grounded in resolved places.</p>
              </header>
              <form className="assistant-composer" onSubmit={(event) => void handleSubmit(event)}>
                <label htmlFor="trip-planner-message">What kind of trip are you imagining?</label>
                <textarea
                  id="trip-planner-message"
                  maxLength={4000}
                  placeholder="Seven relaxed days in Italy in October…"
                  rows={7}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
                <div className="assistant-starters" aria-label="Starter trip ideas">
                  {STARTERS.map((starter) => (
                    <button key={starter} type="button" onClick={() => setMessage(starter)}>{starter}</button>
                  ))}
                </div>
                {error ? <p className="assistant-error" role="alert">{error}</p> : null}
                <button className="button button-primary assistant-send" disabled={!message.trim() || isLoading} type="submit">
                  {isLoading ? 'Creating draft…' : 'Create draft'}
                </button>
                {isLoading ? <p className="visually-hidden" role="status">WanderMap is creating your trip draft</p> : null}
              </form>
            </>
          ) : (
            <section className="trip-plan-result" aria-busy={pendingAction === 'refine'} aria-live="polite">
              <header className="trip-plan-heading">
                <p className="eyebrow">Read-only trip draft</p>
                <h1 id="trip-planner-title">{result.plan.title}</h1>
                <p className="trip-plan-meta">
                  <span>{result.plan.durationDays} {result.plan.durationDays === 1 ? 'day' : 'days'}</span>
                  <span>{paceLabel(result.plan.pace)}</span>
                  {result.plan.startDate && result.plan.endDate ? (
                    <span>{result.plan.startDate} – {result.plan.endDate}</span>
                  ) : null}
                </p>
                <p className="trip-plan-summary">{result.plan.summary}</p>
              </header>

              <ol className="trip-plan-stops" aria-label="Draft itinerary">
                {result.plan.stops.map((stop, index) => (
                  <li key={`${stop.countryCode}:${stop.cityName}:${index}`}>
                    <div className="trip-plan-stop-index" aria-hidden="true">{index + 1}</div>
                    <div className="trip-plan-stop-copy">
                      <header>
                        <div>
                          <h2>{stop.cityName}</h2>
                          <p>{stop.countryName}</p>
                        </div>
                        <strong>{stop.daysAtStop} {stop.daysAtStop === 1 ? 'day' : 'days'}</strong>
                      </header>
                      <p><strong>Why:</strong> {stop.reason}</p>
                      {stop.activities.length > 0 ? (
                        <ul aria-label={`Activities in ${stop.cityName}`}>
                          {stop.activities.map((activity) => <li key={activity}>{activity}</li>)}
                        </ul>
                      ) : null}
                      {stop.bucketListMatch || stop.alreadyVisited ? (
                        <div className="trip-plan-place-flags">
                          {stop.bucketListMatch ? <span>From your Bucket List</span> : null}
                          {stop.alreadyVisited ? <span>Previously visited</span> : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>

              {result.plan.considerations.length > 0 ? (
                <section className="trip-plan-considerations">
                  <h2>Considerations</h2>
                  <ul>
                    {result.plan.considerations.map((consideration) => <li key={consideration}>{consideration}</li>)}
                  </ul>
                </section>
              ) : null}

              <section className="assistant-sources">
                <strong>Sources used</strong>
                {result.plan.sourcesUsed.length > 0 ? (
                  <ul>{result.plan.sourcesUsed.map((source) => <li key={source}>{source}</li>)}</ul>
                ) : (
                  <p>No personal data sources were needed for this draft.</p>
                )}
              </section>
              <form className="trip-plan-refinement" onSubmit={(event) => void handleRefinement(event)}>
                <div>
                  <p className="eyebrow">Refine this draft</p>
                  <h2 id="trip-plan-refinement-title">Want to adjust this plan?</h2>
                  <p>Describe the change and WanderMap will replace this draft only after validating the full itinerary.</p>
                </div>
                <label htmlFor="trip-plan-refinement-message">How should this plan change?</label>
                <textarea
                  id="trip-plan-refinement-message"
                  maxLength={4000}
                  placeholder="Remove Bologna and add another day in Florence…"
                  rows={4}
                  value={refinementMessage}
                  onChange={(event) => setRefinementMessage(event.target.value)}
                />
                <div className="assistant-starters" aria-label="Suggested plan adjustments">
                  {REFINEMENT_STARTERS.map((starter) => (
                    <button
                      key={starter}
                      disabled={isLoading}
                      type="button"
                      onClick={() => setRefinementMessage(starter)}
                    >
                      {starter}
                    </button>
                  ))}
                </div>
                {refinementError ? <p className="assistant-error" role="alert">{refinementError}</p> : null}
                <button
                  className="button button-primary assistant-send"
                  disabled={!refinementMessage.trim() || isLoading}
                  type="submit"
                >
                  {pendingAction === 'refine' ? 'Updating plan…' : 'Update plan'}
                </button>
                {pendingAction === 'refine' ? (
                  <p className="trip-plan-refinement-status" role="status">
                    WanderMap is refining your draft. The current plan will stay visible until the update is ready.
                  </p>
                ) : null}
                {wasRefined ? <p className="trip-plan-refinement-status" role="status">Plan updated.</p> : null}
              </form>
              <div className="trip-plan-actions">
                <button
                  className="button button-secondary"
                  disabled={isLoading}
                  type="button"
                  onClick={handleNewPlan}
                >
                  New plan
                </button>
              </div>
            </section>
          )}
        </article>
      </div>
    </section>
  )
}

function paceLabel(pace: TripPlanningResponse['plan']['pace']): string {
  return pace.charAt(0) + pace.slice(1).toLowerCase()
}

function plannerErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError && reason.code === 'AI_INVALID_PLAN') {
    return 'WanderMap could not create a consistent draft. Adjust the request and try again.'
  }
  if (reason instanceof ApiError && reason.code === 'AI_RATE_LIMITED') {
    return 'Trip Planner is busy right now. Please try again shortly.'
  }
  return 'Trip Planner is temporarily unavailable. Please try again.'
}
