import { useEffect, useState } from 'react'
import type { Ref } from 'react'
import type { BucketListItem, PlaceDetails, PlaceVisit } from '../types/travel'
import { formatCalendarDateRange, formatStopDateRange } from '../utils/calendarDate'
import { hasMemoryContent, orderedMemoryPhotos } from './memoryPresentation'

interface PlaceDetailsPanelProps {
  closeButtonRef?: Ref<HTMLButtonElement>
  bucketListItem?: BucketListItem | null
  details: PlaceDetails | null
  error: string | null
  isBucketListMutating?: boolean
  isLoading: boolean
  onClose: () => void
  onRemoveFromBucketList?: (itemId: string) => Promise<void>
  onViewMemory: (visit: PlaceVisit) => void
  onRetry: () => void
  onViewTrip: (tripId: string) => void
}

const MAX_VISIBLE_PHOTOS = 3

export function PlaceDetailsPanel({
  closeButtonRef,
  bucketListItem = null,
  details,
  error,
  isLoading,
  isBucketListMutating = false,
  onClose,
  onRemoveFromBucketList,
  onViewMemory,
  onRetry,
  onViewTrip,
}: PlaceDetailsPanelProps) {
  const [bucketActionError, setBucketActionError] = useState<string | null>(null)

  useEffect(() => {
    setBucketActionError(null)
  }, [bucketListItem?.id, details?.city.id])

  async function removeFromBucketList() {
    if (!bucketListItem || !onRemoveFromBucketList) {
      return
    }
    setBucketActionError(null)
    try {
      await onRemoveFromBucketList(bucketListItem.id)
    } catch (reason) {
      setBucketActionError(reason instanceof Error && reason.message
        ? reason.message
        : 'Couldn’t remove this place. Please try again.')
    }
  }

  return (
    <section className="place-details-panel" aria-label="Place details">
      <button ref={closeButtonRef} className="place-details-close" aria-label="Close place details" type="button" onClick={onClose}>
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
            <div className="place-details-states">
              <span>{visitCountLabel(details.visitCount)}</span>
              {bucketListItem ? <span>Want to visit</span> : null}
            </div>
            {bucketListItem && onRemoveFromBucketList ? (
              <button
                className="place-bucket-remove"
                disabled={isBucketListMutating}
                type="button"
                onClick={() => void removeFromBucketList()}
              >
                {isBucketListMutating ? 'Removing…' : 'Remove from Want to visit'}
              </button>
            ) : null}
            {bucketActionError ? <p className="form-error" role="alert">{bucketActionError}</p> : null}
          </header>
          {details.visits.length > 0 ? (
            <ol className="place-visit-list">
              {details.visits.map((visit) => (
                <PlaceVisitCard
                  cityName={details.city.name}
                  key={visit.stopId}
                  visit={visit}
                  onViewMemory={onViewMemory}
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
  onViewMemory,
  onViewTrip,
}: {
  cityName: string
  visit: PlaceVisit
  onViewMemory: (visit: PlaceVisit) => void
  onViewTrip: (tripId: string) => void
}) {
  const visitDates = formatStopDateRange(visit.arrivalDate, visit.departureDate)
    ?? formatCalendarDateRange(visit.tripStartDate, visit.tripEndDate)
  const photos = orderedMemoryPhotos(visit.photos)
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
      <div className="place-visit-actions">
        {hasMemoryContent(visit) ? (
          <button
            className="place-view-memory"
            type="button"
            onClick={() => onViewMemory(visit)}
          >
            View memory →
          </button>
        ) : null}
        <button
          className="place-view-trip"
          type="button"
          onClick={() => onViewTrip(visit.tripId)}
        >
          View journey →
        </button>
      </div>
    </li>
  )
}

function visitCountLabel(visitCount: number): string {
  return visitCount === 0
    ? 'Not visited yet'
    : `Visited ${visitCount} ${visitCount === 1 ? 'time' : 'times'}`
}
