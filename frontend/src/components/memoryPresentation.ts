import type { PlaceVisit, Trip, TripStop, TripStopPhoto } from '../types/travel'
import { formatCalendarDateRange, formatStopDateRange } from '../utils/calendarDate'

type MemoryContent = Pick<PlaceVisit, 'note' | 'photos'> | Pick<TripStop, 'note' | 'photos'>

export function hasMemoryContent(memory: MemoryContent): boolean {
  return Boolean(memory.note?.trim()) || (memory.photos?.length ?? 0) > 0
}

export function orderedMemoryPhotos(photos: TripStopPhoto[] | undefined): TripStopPhoto[] {
  return [...(photos ?? [])].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
}

export function memoryDateRange(visit: PlaceVisit): string | null {
  return formatStopDateRange(visit.arrivalDate, visit.departureDate)
    ?? formatCalendarDateRange(visit.tripStartDate, visit.tripEndDate)
}

export function memoryNightsLabel(visit: PlaceVisit): string | null {
  if (!visit.arrivalDate || !visit.departureDate) {
    return null
  }

  const arrival = Date.parse(`${visit.arrivalDate}T00:00:00Z`)
  const departure = Date.parse(`${visit.departureDate}T00:00:00Z`)
  if (!Number.isFinite(arrival) || !Number.isFinite(departure) || departure < arrival) {
    return null
  }

  const nights = Math.floor((departure - arrival) / 86_400_000)
  return `${nights} ${nights === 1 ? 'night' : 'nights'}`
}

export function visitForTripStop(trip: Trip, stop: TripStop): PlaceVisit {
  return {
    tripId: trip.id,
    tripName: trip.name,
    tripStartDate: trip.startDate,
    tripEndDate: trip.endDate,
    tripDescription: trip.description,
    stopId: stop.id,
    position: stop.position,
    arrivalDate: stop.arrivalDate,
    departureDate: stop.departureDate,
    note: stop.note,
    photos: orderedMemoryPhotos(stop.photos),
  }
}
