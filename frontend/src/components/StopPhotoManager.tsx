import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { TripStopPhoto } from '../types/travel'
import { orderedMemoryPhotos } from './memoryPresentation'

interface StopPhotoManagerProps {
  cityName: string
  photos: TripStopPhoto[] | undefined
  isMutating: boolean
  variant: 'compact' | 'memory'
  onDelete: (photoId: string) => Promise<void>
  onUpload: (file: File) => Promise<void>
}

export function StopPhotoManager({
  cityName,
  photos,
  isMutating,
  variant,
  onDelete,
  onUpload,
}: StopPhotoManagerProps) {
  const [photoMutation, setPhotoMutation] = useState<'upload' | 'delete' | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const mutationRef = useRef(false)
  const orderedPhotos = orderedMemoryPhotos(photos)
  const isDisabled = isMutating || photoMutation !== null

  async function handlePhotoUpload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file || mutationRef.current || isMutating) {
      return
    }

    mutationRef.current = true
    setPhotoMutation('upload')
    setPhotoError(null)
    try {
      await onUpload(file)
    } catch {
      setPhotoError('Couldn’t upload this photo. Please try again.')
    } finally {
      input.value = ''
      mutationRef.current = false
      setPhotoMutation(null)
    }
  }

  async function handlePhotoDelete(photoId: string) {
    if (mutationRef.current || isMutating) {
      return
    }

    mutationRef.current = true
    setPhotoMutation('delete')
    setPhotoError(null)
    try {
      await onDelete(photoId)
    } catch {
      setPhotoError('Couldn’t remove this photo. It is still part of the memory.')
    } finally {
      mutationRef.current = false
      setPhotoMutation(null)
    }
  }

  if (variant === 'compact') {
    return (
      <div className="stop-photos" aria-label={`Photos for ${cityName}`}>
        {orderedPhotos.length > 0 ? (
          <ul className="photo-list">
            {orderedPhotos.map((photo) => (
              <li key={photo.id}>
                <img alt={`${cityName} memory ${photo.position}`} loading="lazy" src={photo.contentUrl} />
                <button
                  aria-label={`Delete ${photo.originalFilename}`}
                  className="photo-delete"
                  disabled={isDisabled}
                  type="button"
                  onClick={() => void handlePhotoDelete(photo.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : <span className="photo-empty">No photos yet.</span>}
        <PhotoUploadControl
          cityName={cityName}
          className="photo-upload"
          isDisabled={isDisabled}
          isUploading={photoMutation === 'upload'}
          onChange={handlePhotoUpload}
        />
        {photoError ? <p aria-live="polite" className="photo-mutation-error">{photoError}</p> : null}
      </div>
    )
  }

  return (
    <div className="memory-photo-manager">
      {orderedPhotos.length > 0 ? (
        <div className={`memory-gallery is-editing ${gallerySizeClass(orderedPhotos.length)}`}>
          {orderedPhotos.map((photo, index) => (
            <figure key={photo.id}>
              <img
                alt={`${cityName} memory, photo ${photo.position}`}
                decoding="async"
                loading={index === 0 ? 'eager' : 'lazy'}
                src={photo.contentUrl}
              />
              <button
                aria-label={`Delete ${photo.originalFilename}`}
                className="memory-photo-delete"
                disabled={isDisabled}
                type="button"
                onClick={() => void handlePhotoDelete(photo.id)}
              >
                ×
              </button>
            </figure>
          ))}
        </div>
      ) : (
        <div className="memory-photo-empty">
          <span aria-hidden="true">✦</span>
          <p>No photos were added to this visit.</p>
        </div>
      )}
      <div className="memory-photo-editor-actions">
        <PhotoUploadControl
          cityName={cityName}
          className="photo-upload memory-photo-upload"
          isDisabled={isDisabled}
          isUploading={photoMutation === 'upload'}
          onChange={handlePhotoUpload}
        />
        <small>Uploads and removals are saved immediately.</small>
      </div>
      {photoError ? <p aria-live="polite" className="photo-mutation-error">{photoError}</p> : null}
    </div>
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

function PhotoUploadControl({
  cityName,
  className,
  isDisabled,
  isUploading,
  onChange,
}: {
  cityName: string
  className: string
  isDisabled: boolean
  isUploading: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <label className={`${className}${isDisabled ? ' is-disabled' : ''}`}>
      <span>{isUploading ? 'Uploading…' : 'Add photo'}</span>
      <input
        accept="image/jpeg,image/png,image/webp"
        aria-label={`Add photo for ${cityName}`}
        disabled={isDisabled}
        type="file"
        onChange={(event) => void onChange(event)}
      />
    </label>
  )
}
