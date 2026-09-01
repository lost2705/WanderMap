import type { ReactNode } from 'react'
import type { TripMapOverview, TripSummary } from '../types/travel'
import { formatCalendarDateRange } from '../utils/calendarDate'

interface TripListProps {
  children?: ReactNode
  trips: TripSummary[]
  overview: TripMapOverview | null
  selectedTripId: string | null
  isLoading: boolean
  onSelect: (tripId: string) => void
  onCreate: () => void
}

export function TripList({ children, trips, overview, selectedTripId, isLoading, onSelect, onCreate }: TripListProps) {
  const isGlobalOverview = selectedTripId === null

  return (
    <section className={`trip-list-section${isGlobalOverview ? ' is-global' : ''}`} aria-labelledby="trips-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your journeys</p>
          <h2 id="trips-heading">Journeys</h2>
        </div>
        <button aria-label="Create a new journey" className="button button-quiet button-compact journey-create" type="button" onClick={onCreate}>
          <span aria-hidden="true">＋</span>
          <span>New journey</span>
        </button>
      </div>
      {isLoading ? <p className="status-text">Loading trips…</p> : null}
      {!isLoading && trips.length === 0 ? (
        <p className="empty-text">Your atlas is waiting for its first journey.</p>
      ) : null}
      <ul className="trip-list">
        {trips.map((trip) => {
          const dateRange = formatCalendarDateRange(trip.startDate, trip.endDate)
          const places = placeNamesForTrip(overview, trip.id)
          return (
            <li key={trip.id}>
              <button
                aria-label={`${trip.name}, ${trip.stopCount} ${trip.stopCount === 1 ? 'place' : 'places'}`}
                aria-pressed={trip.id === selectedTripId}
                className={`trip-list-item${trip.id === selectedTripId ? ' is-selected' : ''}`}
                type="button"
                onClick={() => onSelect(trip.id)}
              >
                <span className="trip-list-item-heading">
                  <strong className="trip-list-item-name">{trip.name}</strong>
                  <span className="trip-list-item-count">
                    {trip.stopCount} {trip.stopCount === 1 ? 'place' : 'places'}
                  </span>
                </span>
                {dateRange ? <span className="trip-list-item-dates">{dateRange}</span> : null}
                {places.length > 0 ? <span className="trip-list-item-places">{places.join(' · ')}</span> : null}
                {trip.description ? <span className="trip-list-item-description">{trip.description}</span> : null}
              </button>
            </li>
          )
        })}
      </ul>
      {!isLoading && isGlobalOverview && trips.length > 0 ? (
        <p className="journey-selection-hint">Select a journey to open its travel timeline.</p>
      ) : null}
      {!isLoading && isGlobalOverview ? children : null}
    </section>
  )
}

function placeNamesForTrip(overview: TripMapOverview | null, tripId: string): string[] {
  const uniquePlaces = new Map<string, TripMapOverview['markers'][number]>()

  const tripMarkers = (overview?.markers ?? [])
    .filter((marker) => marker.tripId === tripId)
    .sort((left, right) => left.position - right.position)
  tripMarkers.forEach((marker) => {
    if (!uniquePlaces.has(marker.cityId)) {
      uniquePlaces.set(marker.cityId, marker)
    }
  })

  const previewPlaces = [...uniquePlaces.values()].slice(0, 4)
  const cityNameCounts = new Map<string, number>()
  previewPlaces.forEach((marker) => {
    cityNameCounts.set(marker.cityName, (cityNameCounts.get(marker.cityName) ?? 0) + 1)
  })

  return previewPlaces.map((marker) => cityNameCounts.get(marker.cityName)! > 1
    ? `${marker.cityName}, ${marker.country.name}`
    : marker.cityName)
}
