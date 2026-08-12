import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Country, Trip } from '../types/travel'

interface ItineraryProps {
  trip: Trip
  countries: Country[]
  isMutating: boolean
  onMove: (stopId: string, position: number) => Promise<void>
  onDelete: (stopId: string) => Promise<void>
  onAddStop: (countryCode: string, cityName: string) => Promise<void>
}

export function Itinerary({ trip, countries, isMutating, onMove, onDelete, onAddStop }: ItineraryProps) {
  const [countryCode, setCountryCode] = useState('')
  const [cityName, setCityName] = useState('')

  async function handleAddStop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onAddStop(countryCode, cityName)
    setCityName('')
  }

  return (
    <section className="itinerary" aria-labelledby="itinerary-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Selected trip</p>
          <h2 id="itinerary-heading">{trip.name}</h2>
        </div>
      </div>
      {trip.stops.length === 0 ? <p className="empty-text">Add your first stop to build an itinerary.</p> : null}
      <ol className="stop-list">
        {trip.stops.map((stop, index) => (
          <li className="stop-item" key={stop.id}>
            <span className="stop-position">{stop.position}</span>
            <div className="stop-details">
              <strong>{stop.city.name}</strong>
              <span>{stop.city.country.name}</span>
              {stop.city.latitude === null ? <small>Location not available yet</small> : null}
            </div>
            <div className="stop-actions" aria-label={`Actions for ${stop.city.name}`}>
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
          </li>
        ))}
      </ol>
      <form className="add-stop-form" onSubmit={(event) => void handleAddStop(event)}>
        <h3>Add a stop</h3>
        <label>
          Country
          <select required value={countryCode} onChange={(event) => setCountryCode(event.target.value)}>
            <option value="">Choose a country</option>
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          City
          <input
            required
            maxLength={160}
            placeholder="e.g. Rome"
            value={cityName}
            onChange={(event) => setCityName(event.target.value)}
          />
        </label>
        <button className="button button-secondary" disabled={isMutating} type="submit">
          {isMutating ? 'Adding…' : 'Add stop'}
        </button>
      </form>
    </section>
  )
}
