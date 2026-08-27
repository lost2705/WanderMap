import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { TripDetailsInput } from '../types/travel'

interface TripFormProps {
  initialValue?: TripDetailsInput
  submitLabel: string
  isSubmitting: boolean
  onSubmit: (input: TripDetailsInput) => Promise<void>
  onCancel: () => void
}

export function TripForm({ initialValue, submitLabel, isSubmitting, onSubmit, onCancel }: TripFormProps) {
  const [name, setName] = useState(initialValue?.name ?? '')
  const [startDate, setStartDate] = useState(initialValue?.startDate ?? '')
  const [endDate, setEndDate] = useState(initialValue?.endDate ?? '')
  const [description, setDescription] = useState(initialValue?.description ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [isLocallySubmitting, setIsLocallySubmitting] = useState(false)
  const submitInFlightRef = useRef(false)
  const isBusy = isSubmitting || isLocallySubmitting

  useEffect(() => {
    setName(initialValue?.name ?? '')
    setStartDate(initialValue?.startDate ?? '')
    setEndDate(initialValue?.endDate ?? '')
    setDescription(initialValue?.description ?? '')
    setValidationError(null)
    setSubmissionError(null)
  }, [initialValue])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitInFlightRef.current || isSubmitting) {
      return
    }

    const normalizedName = name.trim()
    if (!normalizedName) {
      setValidationError('Journey title is required.')
      return
    }
    if (startDate && endDate && startDate > endDate) {
      setValidationError('End date cannot be before start date.')
      return
    }

    setValidationError(null)
    setSubmissionError(null)
    submitInFlightRef.current = true
    setIsLocallySubmitting(true)
    try {
      await onSubmit({
        name: normalizedName,
        startDate: startDate || null,
        endDate: endDate || null,
        description: description.trim() || null,
      })
    } catch (reason) {
      setSubmissionError(submissionErrorMessage(reason))
    } finally {
      submitInFlightRef.current = false
      setIsLocallySubmitting(false)
    }
  }

  return (
    <form aria-busy={isBusy} className="trip-form" onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Journey title
        <input
          aria-invalid={validationError === 'Journey title is required.'}
          autoFocus
          required
          maxLength={200}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setValidationError(null)
            setSubmissionError(null)
          }}
        />
      </label>
      <div className="date-fields">
        <label>
          Start date
          <input type="date" value={startDate} onChange={(event) => {
            setStartDate(event.target.value)
            setValidationError(null)
            setSubmissionError(null)
          }} />
        </label>
        <label>
          End date
          <input type="date" value={endDate} onChange={(event) => {
            setEndDate(event.target.value)
            setValidationError(null)
            setSubmissionError(null)
          }} />
        </label>
      </div>
      <label>
        Description
        <textarea
          placeholder="A few words about this journey"
          rows={3}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            setSubmissionError(null)
          }}
        />
      </label>
      {validationError ? <p className="form-error" role="alert">{validationError}</p> : null}
      {submissionError ? <p className="form-error" role="alert">{submissionError}</p> : null}
      <div className="form-actions">
        <button className="button button-primary" disabled={isBusy} type="submit">
          {isBusy ? 'Saving…' : submitLabel}
        </button>
        <button className="button button-quiet" disabled={isBusy} type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function submissionErrorMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message
  }
  return 'Couldn’t save this journey. Please try again.'
}
