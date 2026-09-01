import { useState } from 'react'
import { placesForGlobalMap } from '../features/map/mapData'
import type { TripMapOverview } from '../types/travel'

interface WorldPlaceNavigationProps {
  overview: TripMapOverview | null
  onSelectPlace: (cityId: string) => void
}

const PLACE_LIST_ID = 'world-visited-place-list'

export function WorldPlaceNavigation({ overview, onSelectPlace }: WorldPlaceNavigationProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const places = placesForGlobalMap(overview)

  if (places.length === 0) {
    return null
  }

  return (
    <section className="world-place-navigation" aria-label="Visited places">
      <button
        aria-controls={PLACE_LIST_ID}
        aria-expanded={isExpanded}
        aria-label={`Visited places — ${places.length} ${places.length === 1 ? 'place' : 'places'}`}
        className="button button-quiet visited-places-toggle"
        type="button"
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span>Visited places</span>
        <span className="trip-list-item-count">{places.length} {places.length === 1 ? 'place' : 'places'}</span>
        <span aria-hidden="true">{isExpanded ? '−' : '+'}</span>
      </button>
      {isExpanded ? (
        <ul className="visited-place-list" id={PLACE_LIST_ID}>
          {places.map((place) => {
            const visitCount = place.visits.length
            const visitLabel = `${visitCount} ${visitCount === 1 ? 'visit' : 'visits'}`
            return (
              <li key={place.cityId}>
                <button
                  aria-label={`Open ${place.cityName}, ${place.country.name} — ${visitLabel}`}
                  className="trip-list-item visited-place-link"
                  type="button"
                  onClick={() => onSelectPlace(place.cityId)}
                >
                  <span className="visited-place-copy">
                    <strong className="trip-list-item-name">{place.cityName}</strong>
                    <small className="trip-list-item-places">{place.country.name}</small>
                  </span>
                  <span className="trip-list-item-count">{visitLabel}</span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
