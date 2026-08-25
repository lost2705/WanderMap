import { useState } from 'react'
import type { FormEvent } from 'react'
import type { CitySearchResult, StopJournalInput, Trip, TripStop } from '../types/travel'
import { formatCalendarDateRange, formatStopDateRange } from '../utils/calendarDate'
import { CitySearch } from './CitySearch'
import type { SearchCitiesFunction } from './CitySearch'
import { hasMemoryContent } from './memoryPresentation'
import { StopJournalForm } from './StopJournalForm'
import { StopPhotoManager } from './StopPhotoManager'

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
  onOpenMemory: (stopId: string) => void
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
  onOpenMemory,
}: ItineraryProps) {
  const [cityQuery, setCityQuery] = useState('')
  const [selectedCity, setSelectedCity] = useState<CitySearchResult | null>(null)
  const [editingStopId, setEditingStopId] = useState<string | null>(null)

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

  function beginJournalEdit(stop: TripStop) {
    setEditingStopId(stop.id)
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
                {hasMemoryContent(stop) ? (
                  <button
                    className="stop-memory-link"
                    type="button"
                    onClick={() => onOpenMemory(stop.id)}
                  >
                    Open memory →
                  </button>
                ) : null}
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
              <StopPhotoManager
                cityName={stop.city.name}
                isMutating={isMutating}
                photos={stop.photos}
                variant="compact"
                onDelete={(photoId) => onDeletePhoto(stop.id, photoId)}
                onUpload={(file) => onUploadPhoto(stop.id, file)}
              />
              {isEditing ? (
                <StopJournalForm
                  ariaLabel={`Edit journal for ${stop.city.name}`}
                  className="stop-journal-form"
                  failureMessage="Couldn’t save this journal. Your draft is still here."
                  initialValue={{
                    arrivalDate: stop.arrivalDate,
                    departureDate: stop.departureDate,
                    note: stop.note,
                  }}
                  isMutating={isMutating}
                  submitLabel="Save journal"
                  tripEndDate={trip.endDate}
                  tripStartDate={trip.startDate}
                  onCancel={() => setEditingStopId(null)}
                  onSubmit={async (input) => {
                    await onUpdateJournal(stop.id, input)
                    setEditingStopId((current) => current === stop.id ? null : current)
                  }}
                />
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
