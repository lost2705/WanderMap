import { useState } from 'react'
import type { City, PlaceVisit, StopJournalInput } from '../types/travel'
import {
  hasMemoryContent,
  memoryDateRange,
  memoryNightsLabel,
  orderedMemoryPhotos,
} from './memoryPresentation'
import { StopJournalForm } from './StopJournalForm'
import { StopPhotoManager } from './StopPhotoManager'

interface MemoryViewProps {
  city: City
  origin: 'place' | 'journey'
  visit: PlaceVisit
  isMutating: boolean
  onBack: () => void
  onDeletePhoto: (photoId: string) => Promise<void>
  onPlace: () => void
  onJourney: () => void
  onUpdateJournal: (input: StopJournalInput) => Promise<void>
  onUploadPhoto: (file: File) => Promise<void>
  onWorld: () => void
}

export function MemoryView({
  city,
  origin,
  visit,
  isMutating,
  onBack,
  onDeletePhoto,
  onPlace,
  onJourney,
  onUpdateJournal,
  onUploadPhoto,
  onWorld,
}: MemoryViewProps) {
  const [isEditing, setIsEditing] = useState(false)
  const photos = orderedMemoryPhotos(visit.photos)
  const dateRange = memoryDateRange(visit)
  const nights = memoryNightsLabel(visit)
  const isMemory = hasMemoryContent(visit)

  return (
    <section
      aria-label="Memory view"
      className="memory-view"
      data-memory-id={visit.stopId}
    >
      <header className="memory-toolbar">
        <button className="memory-back" type="button" onClick={onBack}>
          ← Back to {origin === 'place' ? city.name : visit.tripName}
        </button>
        <div className="memory-toolbar-end">
          {!isEditing ? (
            <button
              className="button button-quiet button-compact memory-edit"
              disabled={isMutating}
              type="button"
              onClick={() => setIsEditing(true)}
            >
              ✎ Edit
            </button>
          ) : <span className="memory-editing-label">Editing memory</span>}
          <nav aria-label="Memory breadcrumb" className="memory-breadcrumb">
            <button type="button" onClick={onWorld}>World</button>
            <span aria-hidden="true">›</span>
            <button type="button" onClick={onJourney}>{visit.tripName}</button>
            <span aria-hidden="true">›</span>
            <button type="button" onClick={onPlace}>{city.name}</button>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{isEditing ? 'Edit' : (isMemory ? 'Memory' : 'Visit')}</span>
          </nav>
        </div>
      </header>

      <article className={`memory-story${isEditing ? ' is-editing' : ''}`}>
        <div className="memory-copy">
          <p className="eyebrow">{visit.tripName}</p>
          <h1>{city.name}</h1>
          <p className="memory-country">{city.country.name}</p>

          {!isEditing && (dateRange || nights) ? (
            <div className="memory-meta" aria-label="Visit dates">
              {dateRange ? <span>{dateRange}</span> : null}
              {nights ? <span>{nights}</span> : null}
            </div>
          ) : null}

          {visit.tripDescription ? (
            <p className="memory-journey-description">{visit.tripDescription}</p>
          ) : null}

          {!isEditing && visit.note ? (
            <section className="memory-journal" aria-label="Journal entry">
              <p className="eyebrow">Journal entry</p>
              <p>{visit.note}</p>
            </section>
          ) : null}

          {!isEditing && !isMemory ? (
            <p className="memory-partial-state">This visit does not have journal notes or photos yet.</p>
          ) : null}

          {isEditing ? (
            <div className="memory-editor">
              <p className="memory-editor-guidance">
                Dates and journal changes stay as a draft until you save. Photo changes are saved immediately.
              </p>
              <StopJournalForm
                ariaLabel={`Edit memory for ${city.name}`}
                className="memory-editor-form"
                failureMessage="Couldn’t save this memory. Your draft is still here."
                initialValue={{
                  arrivalDate: visit.arrivalDate,
                  departureDate: visit.departureDate,
                  note: visit.note,
                }}
                isMutating={isMutating}
                submitLabel="Save memory"
                tripEndDate={visit.tripEndDate}
                tripStartDate={visit.tripStartDate}
                onCancel={() => setIsEditing(false)}
                onSubmit={async (input) => {
                  await onUpdateJournal(input)
                  setIsEditing(false)
                }}
              />
            </div>
          ) : (
            <div className="memory-navigation-actions" aria-label="Memory navigation">
              <button className="button button-primary" type="button" onClick={onJourney}>
                View journey
              </button>
              <button className="button button-quiet" type="button" onClick={onPlace}>
                View place
              </button>
            </div>
          )}
        </div>

        <section className="memory-photos" aria-label={`Photos from ${city.name}`}>
          {isEditing ? (
            <StopPhotoManager
              cityName={city.name}
              isMutating={isMutating}
              photos={photos}
              variant="memory"
              onDelete={onDeletePhoto}
              onUpload={onUploadPhoto}
            />
          ) : photos.length > 0 ? (
            <div className={`memory-gallery ${gallerySizeClass(photos.length)}`}>
              {photos.map((photo, index) => (
                <figure key={photo.id}>
                  <img
                    alt={`${city.name} memory, photo ${photo.position}`}
                    decoding="async"
                    loading={index === 0 ? 'eager' : 'lazy'}
                    src={photo.contentUrl}
                  />
                </figure>
              ))}
            </div>
          ) : (
            <div className="memory-photo-empty">
              <span aria-hidden="true">✦</span>
              <p>No photos were added to this visit.</p>
            </div>
          )}
        </section>
      </article>
    </section>
  )
}

function gallerySizeClass(photoCount: number): string {
  if (photoCount === 1) {
    return 'is-single'
  }
  if (photoCount === 2) {
    return 'is-pair'
  }
  return 'is-collection'
}
