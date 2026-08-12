import type { TripSummary } from '../types/travel'

interface TripListProps {
  trips: TripSummary[]
  selectedTripId: string | null
  isLoading: boolean
  onSelect: (tripId: string) => void
  onCreate: () => void
}

export function TripList({ trips, selectedTripId, isLoading, onSelect, onCreate }: TripListProps) {
  return (
    <section className="trip-list-section" aria-labelledby="trips-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your journeys</p>
          <h2 id="trips-heading">Trips</h2>
        </div>
        <button className="button button-primary button-compact" type="button" onClick={onCreate}>
          + New trip
        </button>
      </div>
      {isLoading ? <p className="status-text">Loading trips…</p> : null}
      {!isLoading && trips.length === 0 ? (
        <p className="empty-text">Your map is waiting for its first trip.</p>
      ) : null}
      <div className="trip-list" role="list">
        {trips.map((trip) => (
          <button
            aria-pressed={trip.id === selectedTripId}
            className={`trip-list-item${trip.id === selectedTripId ? ' is-selected' : ''}`}
            key={trip.id}
            type="button"
            onClick={() => onSelect(trip.id)}
          >
            <span className="trip-list-item-name">{trip.name}</span>
            <span className="trip-list-item-meta">
              {trip.stopCount} {trip.stopCount === 1 ? 'stop' : 'stops'}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
