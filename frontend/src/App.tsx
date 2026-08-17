import { useEffect, useState } from 'react'
import { ApiError } from './api/client'
import {
  addStop,
  createTrip,
  deleteStop,
  deleteStopPhoto,
  deleteTrip,
  getMapOverview,
  getTrip,
  listTrips,
  moveStop,
  updateStopJournal,
  updateTrip,
  uploadStopPhoto,
} from './api/trips'
import { Itinerary } from './components/Itinerary'
import { TripForm } from './components/TripForm'
import { TripList } from './components/TripList'
import { MapView } from './features/map/MapView'
import type {
  CitySearchResult,
  StopJournalInput,
  Trip,
  TripDetailsInput,
  TripMapOverview,
  TripStop,
  TripStopPhoto,
  TripSummary,
} from './types/travel'

type TripFormMode = 'create' | 'edit' | null

export default function App() {
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [overview, setOverview] = useState<TripMapOverview | null>(null)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [formMode, setFormMode] = useState<TripFormMode>(null)
  const [error, setError] = useState<string | null>(null)
  const activeSelectedTrip = selectedTripId !== null && selectedTrip?.id === selectedTripId
    ? selectedTrip
    : null

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
      const [nextTrips, nextOverview] = await Promise.all([listTrips(), getMapOverview()])
      setTrips(nextTrips)
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

  async function performMutation<T>(action: () => Promise<T>): Promise<T> {
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
    setTrips((currentTrips) => currentTrips.map((trip) => trip.id === updatedTrip.id
      ? {
          ...trip,
          name: updatedTrip.name,
          startDate: updatedTrip.startDate,
          endDate: updatedTrip.endDate,
          description: updatedTrip.description,
        }
      : trip))
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

  async function handleAddStop(city: CitySearchResult) {
    if (!selectedTrip) {
      return
    }
    await performMutation(() => addStop(selectedTrip.id, {
      countryCode: city.countryCode,
      cityName: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
    }))
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

  async function handleUpdateStopJournal(stopId: string, input: StopJournalInput) {
    if (!selectedTrip) {
      return
    }
    const updatedStop = await performMutation(() => updateStopJournal(selectedTrip.id, stopId, input))
    setSelectedTrip((currentTrip) => currentTrip?.id === selectedTrip.id
      ? {
          ...currentTrip,
          stops: replaceStop(currentTrip.stops, updatedStop),
        }
      : currentTrip)
  }

  async function handleUploadPhoto(stopId: string, file: File) {
    if (!selectedTrip) {
      return
    }
    const tripId = selectedTrip.id
    const createdPhoto = await performMutation(() => uploadStopPhoto(tripId, stopId, file))
    setSelectedTrip((currentTrip) => currentTrip?.id === tripId
      ? {
          ...currentTrip,
          stops: updateStopPhotos(currentTrip.stops, stopId, (photos) => [...photos, createdPhoto]),
        }
      : currentTrip)
  }

  async function handleDeletePhoto(stopId: string, photoId: string) {
    if (!selectedTrip) {
      return
    }
    const tripId = selectedTrip.id
    await performMutation(() => deleteStopPhoto(tripId, stopId, photoId))
    setSelectedTrip((currentTrip) => currentTrip?.id === tripId
      ? {
          ...currentTrip,
          stops: updateStopPhotos(
            currentTrip.stops,
            stopId,
            (photos) => photos
              .filter((photo) => photo.id !== photoId)
              .map((photo, index) => ({ ...photo, position: index + 1 })),
          ),
        }
      : currentTrip)
  }

  function handleSelectTrip(tripId: string) {
    const nextTripId = selectedTripId === tripId ? null : tripId
    setError(null)
    setFormMode(null)
    setSelectedTrip(null)
    setSelectedTripId(nextTripId)
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
          onSelect={handleSelectTrip}
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
        {formMode === 'edit' && activeSelectedTrip ? (
          <section className="editor-panel" aria-label="Edit selected trip">
            <p className="eyebrow">Trip details</p>
            <h2>Edit trip</h2>
            <TripForm
              initialValue={activeSelectedTrip}
              isSubmitting={isMutating}
              submitLabel="Save changes"
              onCancel={() => setFormMode(null)}
              onSubmit={handleUpdate}
            />
          </section>
        ) : null}
        {!formMode && activeSelectedTrip ? (
          <>
            <Itinerary
              key={activeSelectedTrip.id}
              isMutating={isMutating}
              trip={activeSelectedTrip}
              onAddStop={handleAddStop}
              onDelete={handleDeleteStop}
              onMove={handleMoveStop}
              onUpdateJournal={handleUpdateStopJournal}
              onUploadPhoto={handleUploadPhoto}
              onDeletePhoto={handleDeletePhoto}
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
        {!formMode && !isLoading && selectedTripId === null ? (
          <section className="itinerary" aria-label="No selected trip">
            <p className="empty-text">Select a trip to view its itinerary.</p>
          </section>
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
        <MapView overview={overview} selectedTrip={activeSelectedTrip} trips={trips} />
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

function replaceStop(stops: TripStop[], updatedStop: TripStop): TripStop[] {
  return stops.map((stop) => stop.id === updatedStop.id ? updatedStop : stop)
}

function updateStopPhotos(
  stops: TripStop[],
  stopId: string,
  update: (photos: TripStopPhoto[]) => TripStopPhoto[],
): TripStop[] {
  return stops.map((stop) => stop.id === stopId
    ? { ...stop, photos: update(stop.photos ?? []).sort((left, right) => left.position - right.position) }
    : stop)
}
