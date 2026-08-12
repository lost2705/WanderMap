import type { Trip, TripMapMarker, TripMapOverview } from '../../types/travel'

export interface DisplayMarker extends TripMapMarker {
  isSelectedTrip: boolean
}

export function countryCodesFromOverview(overview: TripMapOverview | null): string[] {
  return overview ? [...new Set(overview.visitedCountryCodes)].sort() : []
}

export function markersForMap(overview: TripMapOverview | null, selectedTripId: string | null): DisplayMarker[] {
  return (overview?.markers ?? []).map((marker) => ({
    ...marker,
    isSelectedTrip: marker.tripId === selectedTripId,
  }))
}

export function markersForTrip(trip: Trip | null): TripMapMarker[] {
  return (trip?.stops ?? [])
    .filter((stop) => stop.city.latitude !== null && stop.city.longitude !== null)
    .map((stop) => ({
      tripId: trip?.id ?? '',
      stopId: stop.id,
      position: stop.position,
      cityName: stop.city.name,
      latitude: stop.city.latitude as number,
      longitude: stop.city.longitude as number,
      country: stop.city.country,
    }))
}
