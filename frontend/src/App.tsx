import { useEffect, useState } from 'react'
import { listCountries } from './api/countries'
import { ApiError } from './api/client'
import {
  addStop,
  createTrip,
  deleteStop,
  deleteTrip,
  getMapOverview,
  getTrip,
  listTrips,
  moveStop,
  updateTrip,
} from './api/trips'
import { Itinerary } from './components/Itinerary'
import { TripForm } from './components/TripForm'
import { TripList } from './components/TripList'
import { MapView } from './features/map/MapView'
import type { Country, Trip, TripDetailsInput, TripMapOverview, TripSummary } from './types/travel'

type TripFormMode = 'create' | 'edit' | null

export default function App() {
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [countries, setCountries] = useState<Country[]>([])
  const [overview, setOverview] = useState<TripMapOverview | null>(null)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [formMode, setFormMode] = useState<TripFormMode>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadApplication()
  }, [])

  useEffect(() => {
    if (!selectedTripId) {
      setSelectedTrip(null)
      return
    }

    let cancelled = false
    setSelectedTrip(null)
    getTrip(selectedTripId)
      .then((trip) => {
        if (!cancelled) {
          setSelectedTrip(trip)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(toErrorMessage(reason))
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedTripId])

  async function loadApplication(preferredTripId?: string) {
    setIsLoading(true)
    try {
      const [nextTrips, nextCountries, nextOverview] = await Promise.all([listTrips(), listCountries(), getMapOverview()])
      setTrips(nextTrips)
      setCountries(nextCountries)
      setOverview(nextOverview)
      setSelectedTripId((current) => {
        const candidate = preferredTripId ?? current
        return candidate && nextTrips.some((trip) => trip.id === candidate) ? candidate : (nextTrips[0]?.id ?? null)
      })
    } catch (reason) {
      setError(toErrorMessage(reason))
    } finally {
      setIsLoading(false)
    }
  }

  async function refreshSelectedTrip(tripId: string) {
    const [trip] = await Promise.all([getTrip(tripId), loadApplication(tripId)])
    setSelectedTrip(trip)
  }

  async function performMutation(action: () => Promise<void | Trip>) {
    setIsMutating(true)
    setError(null)
    try {
      return await action()
    } catch (reason) {
      setError(toErrorMessage(reason))
      throw reason
    } finally {
      setIsMutating(false)
    }
  }

  async function handleCreate(input: TripDetailsInput) {
    const createdTrip = await performMutation(() => createTrip(input))
    if (!createdTrip) {
      return
    }
    setFormMode(null)
    setSelectedTrip(createdTrip)
    await loadApplication(createdTrip.id)
  }

  async function handleUpdate(input: TripDetailsInput) {
    if (!selectedTrip) {
      return
    }
    const updatedTrip = await performMutation(() => updateTrip(selectedTrip.id, input))
    if (!updatedTrip) {
      return
    }
    setFormMode(null)
    setSelectedTrip(updatedTrip)
    await loadApplication(updatedTrip.id)
  }

  async function handleDeleteTrip() {
    if (!selectedTrip || !window.confirm(`Delete “${selectedTrip.name}”? This cannot be undone.`)) {
      return
    }
    await performMutation(() => deleteTrip(selectedTrip.id))
    setFormMode(null)
    setSelectedTrip(null)
    await loadApplication()
  }

  async function handleAddStop(countryCode: string, cityName: string) {
    if (!selectedTrip) {
      return
    }
    await performMutation(() => addStop(selectedTrip.id, { countryCode, cityName }))
    await refreshSelectedTrip(selectedTrip.id)
  }

  async function handleMoveStop(stopId: string, position: number) {
    if (!selectedTrip) {
      return
    }
    await performMutation(() => moveStop(selectedTrip.id, stopId, position))
    await refreshSelectedTrip(selectedTrip.id)
  }

  async function handleDeleteStop(stopId: string) {
    if (!selectedTrip) {
      return
    }
    await performMutation(() => deleteStop(selectedTrip.id, stopId))
    await refreshSelectedTrip(selectedTrip.id)
  }

  return (
    <main className="application-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="WanderMap home">
          <span className="brand-mark">W</span>
          <span>WanderMap</span>
        </a>
        <TripList
          isLoading={isLoading}
          selectedTripId={selectedTripId}
          trips={trips}
          onCreate={() => setFormMode('create')}
          onSelect={(tripId) => {
            setError(null)
            setFormMode(null)
            setSelectedTripId(tripId)
          }}
        />
        {formMode === 'create' ? (
          <section className="editor-panel" aria-label="Create a trip">
            <p className="eyebrow">Start a new story</p>
            <h2>New trip</h2>
            <TripForm
              isSubmitting={isMutating}
              submitLabel="Create trip"
              onCancel={() => setFormMode(null)}
              onSubmit={handleCreate}
            />
          </section>
        ) : null}
        {formMode === 'edit' && selectedTrip ? (
          <section className="editor-panel" aria-label="Edit selected trip">
            <p className="eyebrow">Trip details</p>
            <h2>Edit trip</h2>
            <TripForm
              initialValue={selectedTrip}
              isSubmitting={isMutating}
              submitLabel="Save changes"
              onCancel={() => setFormMode(null)}
              onSubmit={handleUpdate}
            />
          </section>
        ) : null}
        {!formMode && selectedTrip ? (
          <>
            <Itinerary
              key={selectedTrip.id}
              countries={countries}
              isMutating={isMutating}
              trip={selectedTrip}
              onAddStop={handleAddStop}
              onDelete={handleDeleteStop}
              onMove={handleMoveStop}
            />
            <div className="trip-management-actions">
              <button className="button button-quiet" disabled={isMutating} type="button" onClick={() => setFormMode('edit')}>
                Edit trip
              </button>
              <button className="button button-danger" disabled={isMutating} type="button" onClick={() => void handleDeleteTrip()}>
                Delete trip
              </button>
            </div>
          </>
        ) : null}
      </aside>
      <div className="content-area">
        {error ? (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" type="button" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        ) : null}
        <MapView overview={overview} selectedTrip={selectedTrip} />
      </div>
    </main>
  )
}

function toErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError) {
    return reason.code ? `${reason.message} (${reason.code})` : reason.message
  }
  return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'
}
