import { useEffect, useState } from 'react'
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

  useEffect(() => {
    setName(initialValue?.name ?? '')
    setStartDate(initialValue?.startDate ?? '')
    setEndDate(initialValue?.endDate ?? '')
  }, [initialValue])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit({ name, startDate: startDate || null, endDate: endDate || null })
  }

  return (
    <form className="trip-form" onSubmit={(event) => void handleSubmit(event)}>
      <label>
        Trip name
        <input autoFocus required maxLength={200} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <div className="date-fields">
        <label>
          Start date
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label>
          End date
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
      </div>
      <div className="form-actions">
        <button className="button button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? 'Saving…' : submitLabel}
        </button>
        <button className="button button-quiet" disabled={isSubmitting} type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
