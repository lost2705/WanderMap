import type { PlaceDetails, PlaceVisit } from '../types/travel'
import { formatCalendarDateRange, formatStopDateRange } from '../utils/calendarDate'

interface PlaceDetailsPanelProps {
  details: PlaceDetails | null
  error: string | null
  isLoading: boolean
  onClose: () => void
  onRetry: () => void
  onViewTrip: (tripId: string) => void
}

const MAX_VISIBLE_PHOTOS = 3

export function PlaceDetailsPanel({
  details,
  error,
  isLoading,
  onClose,
  onRetry,
  onViewTrip,
}: PlaceDetailsPanelProps) {
  return (
    <section className="place-details-panel" aria-label="Place details">
      <button className="place-details-close" aria-label="Close place details" type="button" onClick={onClose}>
        ×
      </button>
      {isLoading ? (
        <div className="place-details-status" role="status">
          <p className="eyebrow">Place memories</p>
          <p>Gathering your visits…</p>
        </div>
      ) : null}
      {!isLoading && error ? (
        <div className="place-details-status" role="alert">
          <p className="eyebrow">Place memories</p>
          <strong>Couldn’t load this place.</strong>
          <p>{error}</p>
          <button className="button button-quiet button-compact" type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      ) : null}
      {!isLoading && !error && details ? (
        <>
          <header className="place-details-header">
            <p className="eyebrow">Place memories</p>
            <h2>{details.city.name}</h2>
            <p>{details.city.country.name}</p>
            <span>{visitCountLabel(details.visitCount)}</span>
          </header>
          {details.visits.length > 0 ? (
            <ol className="place-visit-list">
              {details.visits.map((visit) => (
                <PlaceVisitCard
                  cityName={details.city.name}
                  key={visit.stopId}
                  visit={visit}
                  onViewTrip={onViewTrip}
                />
              ))}
            </ol>
          ) : <p className="empty-text">No visits are recorded for this place yet.</p>}
        </>
      ) : null}
    </section>
  )
}

function PlaceVisitCard({
  cityName,
  visit,
  onViewTrip,
}: {
  cityName: string
  visit: PlaceVisit
  onViewTrip: (tripId: string) => void
}) {
  const visitDates = formatStopDateRange(visit.arrivalDate, visit.departureDate)
    ?? formatCalendarDateRange(visit.tripStartDate, visit.tripEndDate)
  const photos = [...visit.photos].sort((left, right) => left.position - right.position)
  const visiblePhotos = photos.slice(0, MAX_VISIBLE_PHOTOS)

  return (
    <li className="place-visit-card">
      <div className="place-visit-heading">
        <div>
          <h3>{visit.tripName}</h3>
          {visitDates ? <p>{visitDates}</p> : null}
        </div>
        <span>Visit {visit.position}</span>
      </div>
      {visit.tripDescription ? <p className="place-trip-description">{visit.tripDescription}</p> : null}
      {visit.note ? <p className="place-visit-note">{visit.note}</p> : null}
      {visiblePhotos.length > 0 ? (
        <div className="place-photo-preview" aria-label={`Photos from ${visit.tripName}`}>
          {visiblePhotos.map((photo) => (
            <img
              alt={`${cityName} memory from ${visit.tripName}, photo ${photo.position}`}
              key={photo.id}
              loading="lazy"
              src={photo.contentUrl}
            />
          ))}
          {photos.length > visiblePhotos.length ? (
            <span>+{photos.length - visiblePhotos.length}</span>
          ) : null}
        </div>
      ) : null}
      <button
        className="place-view-trip"
        type="button"
        onClick={() => onViewTrip(visit.tripId)}
      >
        View journey →
      </button>
    </li>
  )
}

function visitCountLabel(visitCount: number): string {
  return `Visited ${visitCount} ${visitCount === 1 ? 'time' : 'times'}`
}
