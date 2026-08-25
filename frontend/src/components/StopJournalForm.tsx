import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { StopJournalInput } from '../types/travel'

interface StopJournalFormProps {
  ariaLabel: string
  className: string
  initialValue: StopJournalInput
  isMutating: boolean
  tripStartDate: string | null
  tripEndDate: string | null
  submitLabel: string
  failureMessage: string
  onCancel: () => void
  onSubmit: (input: StopJournalInput) => Promise<void>
}

export function StopJournalForm({
  ariaLabel,
  className,
  initialValue,
  isMutating,
  tripStartDate,
  tripEndDate,
  submitLabel,
  failureMessage,
  onCancel,
  onSubmit,
}: StopJournalFormProps) {
  const [arrivalDate, setArrivalDate] = useState(initialValue.arrivalDate ?? '')
  const [departureDate, setDepartureDate] = useState(initialValue.departureDate ?? '')
  const [note, setNote] = useState(initialValue.note ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const submittingRef = useRef(false)
  const isDisabled = isMutating || isSaving

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current || isMutating) {
      return
    }

    const nextValidationError = validateStopJournalDates(
      tripStartDate,
      tripEndDate,
      arrivalDate,
      departureDate,
    )
    if (nextValidationError) {
      setValidationError(nextValidationError)
      return
    }

    submittingRef.current = true
    setIsSaving(true)
    setValidationError(null)
    setSubmissionError(null)
    try {
      await onSubmit({
        arrivalDate: arrivalDate || null,
        departureDate: departureDate || null,
        note: note || null,
      })
    } catch {
      setSubmissionError(failureMessage)
    } finally {
      submittingRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <form aria-label={ariaLabel} className={className} onSubmit={(event) => void handleSubmit(event)}>
      <div className="date-fields">
        <label>
          Arrival
          <input
            disabled={isDisabled}
            type="date"
            value={arrivalDate}
            onChange={(event) => {
              setArrivalDate(event.target.value)
              setValidationError(null)
              setSubmissionError(null)
            }}
          />
        </label>
        <label>
          Departure
          <input
            disabled={isDisabled}
            type="date"
            value={departureDate}
            onChange={(event) => {
              setDepartureDate(event.target.value)
              setValidationError(null)
              setSubmissionError(null)
            }}
          />
        </label>
      </div>
      <label>
        Note
        <textarea
          disabled={isDisabled}
          placeholder="What made this stop memorable?"
          rows={5}
          value={note}
          onChange={(event) => {
            setNote(event.target.value)
            setSubmissionError(null)
          }}
        />
      </label>
      {validationError ? <p className="form-error" role="alert">{validationError}</p> : null}
      {submissionError ? <p aria-live="polite" className="form-error">{submissionError}</p> : null}
      <div className="form-actions">
        <button className="button button-primary button-compact" disabled={isDisabled} type="submit">
          {isSaving ? 'Saving…' : submitLabel}
        </button>
        <button
          className="button button-quiet button-compact"
          disabled={isDisabled}
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export function validateStopJournalDates(
  tripStartDate: string | null,
  tripEndDate: string | null,
  arrivalDate: string,
  departureDate: string,
): string | null {
  if (arrivalDate && departureDate && arrivalDate > departureDate) {
    return 'Departure date cannot be before arrival date.'
  }
  if (tripStartDate && arrivalDate && arrivalDate < tripStartDate) {
    return 'Arrival date cannot be before trip start date.'
  }
  if (tripEndDate && departureDate && departureDate > tripEndDate) {
    return 'Departure date cannot be after trip end date.'
  }
  return null
}
