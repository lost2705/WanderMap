import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { CitySearchResult, StopJournalInput, Trip, TripStop } from '../types/travel'
import { formatCalendarDateRange, formatStopDateRange } from '../utils/calendarDate'
import { CitySearch } from './CitySearch'
import type { SearchCitiesFunction } from './CitySearch'

interface ItineraryProps {
  trip: Trip
  isMutating: boolean
  citySearch?: SearchCitiesFunction
  onMove: (stopId: string, position: number) => Promise<void>
  onDelete: (stopId: string) => Promise<void>
  onAddStop: (city: CitySearchResult) => Promise<void>
  onUpdateJournal: (stopId: string, input: StopJournalInput) => Promise<void>
  onUploadPhoto: (stopId: string, file: File) => Promise<void>
  onDeletePhoto: (stopId: string, photoId: string) => Promise<void>
}

export function Itinerary({
  trip,
  isMutating,
  citySearch,
  onMove,
  onDelete,
  onAddStop,
  onUpdateJournal,
  onUploadPhoto,
  onDeletePhoto,
}: ItineraryProps) {
  const [cityQuery, setCityQuery] = useState('')
  const [selectedCity, setSelectedCity] = useState<CitySearchResult | null>(null)
  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const [arrivalDate, setArrivalDate] = useState('')
  const [departureDate, setDepartureDate] = useState('')
  const [note, setNote] = useState('')
  const [journalValidationError, setJournalValidationError] = useState<string | null>(null)
  const [photoMutation, setPhotoMutation] = useState<{ stopId: string; action: 'upload' | 'delete' } | null>(null)

  const tripDateRange = formatCalendarDateRange(trip.startDate, trip.endDate)
  const tripDuration = tripDurationLabel(trip.startDate, trip.endDate)

  async function handleAddStop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedCity) {
      return
    }
    try {
      await onAddStop(selectedCity)
      setCityQuery('')
      setSelectedCity(null)
    } catch {
      // App owns the visible mutation error; preserve the selection so the user can retry.
    }
  }

  async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>, stopId: string) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) {
      return
    }
    setPhotoMutation({ stopId, action: 'upload' })
    try {
      await onUploadPhoto(stopId, file)
    } catch {
      // App owns the visible mutation error.
    } finally {
      input.value = ''
      setPhotoMutation(null)
    }
  }

  async function handlePhotoDelete(stopId: string, photoId: string) {
    setPhotoMutation({ stopId, action: 'delete' })
    try {
      await onDeletePhoto(stopId, photoId)
    } catch {
      // App owns the visible mutation error and the existing thumbnail remains available.
    } finally {
      setPhotoMutation(null)
    }
  }

  function beginJournalEdit(stop: TripStop) {
    setEditingStopId(stop.id)
    setArrivalDate(stop.arrivalDate ?? '')
    setDepartureDate(stop.departureDate ?? '')
    setNote(stop.note ?? '')
    setJournalValidationError(null)
  }

  async function handleJournalSubmit(event: FormEvent<HTMLFormElement>, stopId: string) {
    event.preventDefault()
    const validationError = validateJournalDates(trip, arrivalDate, departureDate)
    if (validationError) {
      setJournalValidationError(validationError)
      return
    }
    setJournalValidationError(null)
    try {
      await onUpdateJournal(stopId, {
        arrivalDate: arrivalDate || null,
        departureDate: departureDate || null,
        note: note || null,
      })
      setEditingStopId(null)
    } catch {
      // App owns the visible mutation error; keep the editor open so the user can correct or retry.
    }
  }

  return (
    <section className="itinerary" aria-labelledby="itinerary-heading">
      <header className="journey-summary">
        <div>
          <p className="eyebrow">Journey</p>
          <h2 id="itinerary-heading">{trip.name}</h2>
          <div className="journey-summary-meta">
            {tripDateRange ? <span className="trip-date-range">{tripDateRange}</span> : null}
            {tripDuration ? <span>{tripDuration}</span> : null}
            <span>{trip.stops.length} {trip.stops.length === 1 ? 'place' : 'places'}</span>
          </div>
          {trip.description ? <p className="trip-description">{trip.description}</p> : null}
        </div>
      </header>
      {trip.stops.length === 0 ? <p className="empty-text">Add your first stop to build an itinerary.</p> : null}
      <ol className="stop-list">
        {trip.stops.map((stop, index) => {
          const stopDateRange = formatStopDateRange(stop.arrivalDate, stop.departureDate)
          const isEditing = editingStopId === stop.id
          return (
            <li className={`stop-item${isEditing ? ' is-editing' : ''}`} key={stop.id}>
              <span aria-label={`Stop ${stop.position}`} className="stop-position">
                {String(stop.position).padStart(2, '0')}
              </span>
              <div className="stop-details">
                <strong>{stop.city.name}</strong>
                <span>{stop.city.country.name}</span>
                {stopDateRange ? <span className="stop-date-range">{stopDateRange}</span> : null}
                {stop.note ? <p className="stop-note">{stop.note}</p> : null}
                {stop.city.latitude === null ? <small>Location not available yet</small> : null}
              </div>
              <div className="stop-actions" aria-label={`Actions for ${stop.city.name}`}>
                <button
                  aria-label={`Edit journal for ${stop.city.name}`}
                  className="icon-button"
                  disabled={isMutating}
                  type="button"
                  onClick={() => beginJournalEdit(stop)}
                >
                  ✎
                </button>
                <button
                  aria-label={`Move ${stop.city.name} up`}
                  className="icon-button"
                  disabled={isMutating || index === 0}
                  type="button"
                  onClick={() => void onMove(stop.id, stop.position - 1)}
                >
                  ↑
                </button>
                <button
                  aria-label={`Move ${stop.city.name} down`}
                  className="icon-button"
                  disabled={isMutating || index === trip.stops.length - 1}
                  type="button"
                  onClick={() => void onMove(stop.id, stop.position + 1)}
                >
                  ↓
                </button>
                <button
                  aria-label={`Remove ${stop.city.name}`}
                  className="icon-button icon-button-danger"
                  disabled={isMutating}
                  type="button"
                  onClick={() => void onDelete(stop.id)}
                >
                  ×
                </button>
              </div>
              <div className="stop-photos" aria-label={`Photos for ${stop.city.name}`}>
                {(stop.photos?.length ?? 0) > 0 ? (
                  <ul className="photo-list">
                    {[...(stop.photos ?? [])].sort((left, right) => left.position - right.position).map((photo) => (
                      <li key={photo.id}>
                        <img
                          alt={`${stop.city.name} memory ${photo.position}`}
                          loading="lazy"
                          src={photo.contentUrl}
                        />
                        <button
                          aria-label={`Delete ${photo.originalFilename}`}
                          className="photo-delete"
                          disabled={isMutating}
                          type="button"
                          onClick={() => void handlePhotoDelete(stop.id, photo.id)}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <span className="photo-empty">No photos yet.</span>}
                <label className={`photo-upload${isMutating ? ' is-disabled' : ''}`}>
                  <span>{photoMutation?.stopId === stop.id && photoMutation.action === 'upload' ? 'Uploading…' : 'Add photo'}</span>
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    aria-label={`Add photo for ${stop.city.name}`}
                    disabled={isMutating}
                    type="file"
                    onChange={(event) => void handlePhotoUpload(event, stop.id)}
                  />
                </label>
              </div>
              {isEditing ? (
                <form className="stop-journal-form" onSubmit={(event) => void handleJournalSubmit(event, stop.id)}>
                  <div className="date-fields">
                    <label>
                      Arrival
                      <input
                        type="date"
                        value={arrivalDate}
                        onChange={(event) => {
                          setArrivalDate(event.target.value)
                          setJournalValidationError(null)
                        }}
                      />
                    </label>
                    <label>
                      Departure
                      <input
                        type="date"
                        value={departureDate}
                        onChange={(event) => {
                          setDepartureDate(event.target.value)
                          setJournalValidationError(null)
                        }}
                      />
                    </label>
                  </div>
                  <label>
                    Note
                    <textarea
                      placeholder="What made this stop memorable?"
                      rows={3}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  {journalValidationError ? (
                    <p className="form-error" role="alert">{journalValidationError}</p>
                  ) : null}
                  <div className="form-actions">
                    <button className="button button-primary button-compact" disabled={isMutating} type="submit">
                      {isMutating ? 'Saving…' : 'Save journal'}
                    </button>
                    <button
                      className="button button-quiet button-compact"
                      disabled={isMutating}
                      type="button"
                      onClick={() => {
                        setEditingStopId(null)
                        setJournalValidationError(null)
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </li>
          )
        })}
      </ol>
      <form className="add-stop-form" onSubmit={(event) => void handleAddStop(event)}>
        <h3>Add a stop</h3>
        <CitySearch
          disabled={isMutating}
          query={cityQuery}
          search={citySearch}
          selectedResult={selectedCity}
          onQueryChange={(query) => {
            setCityQuery(query)
            setSelectedCity(null)
          }}
          onSelect={(result) => {
            setCityQuery(result.name)
            setSelectedCity(result)
          }}
        />
        <button className="button button-secondary" disabled={isMutating || !selectedCity} type="submit">
          {isMutating ? 'Adding…' : 'Add stop'}
        </button>
      </form>
    </section>
  )
}

function validateJournalDates(trip: Trip, arrivalDate: string, departureDate: string): string | null {
  if (arrivalDate && departureDate && arrivalDate > departureDate) {
    return 'Departure date cannot be before arrival date.'
  }
  if (trip.startDate && arrivalDate && arrivalDate < trip.startDate) {
    return 'Arrival date cannot be before trip start date.'
  }
  if (trip.endDate && departureDate && departureDate > trip.endDate) {
    return 'Departure date cannot be after trip end date.'
  }
  return null
}

function tripDurationLabel(startDate: string | null, endDate: string | null): string | null {
  if (!startDate || !endDate) {
    return null
  }
  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null
  }
  const days = Math.floor((end - start) / 86_400_000) + 1
  return `${days} ${days === 1 ? 'day' : 'days'}`
}
