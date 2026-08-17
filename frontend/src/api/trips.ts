import { request } from './client'
import type {
  AddStopInput,
  StopJournalInput,
  Trip,
  TripDetailsInput,
  TripMapOverview,
  TripStop,
  TripStopPhoto,
  TripSummary,
} from '../types/travel'

export function listTrips(): Promise<TripSummary[]> {
  return request<TripSummary[]>('/api/trips')
}

export function getTrip(tripId: string): Promise<Trip> {
  return request<Trip>(`/api/trips/${tripId}`)
}

export function getMapOverview(): Promise<TripMapOverview> {
  return request<TripMapOverview>('/api/trips/map-overview')
}

export function createTrip(input: TripDetailsInput): Promise<Trip> {
  return request<Trip>('/api/trips', { method: 'POST', body: JSON.stringify(input) })
}

export function updateTrip(tripId: string, input: TripDetailsInput): Promise<Trip> {
  return request<Trip>(`/api/trips/${tripId}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteTrip(tripId: string): Promise<void> {
  return request<void>(`/api/trips/${tripId}`, { method: 'DELETE' })
}

export function addStop(tripId: string, input: AddStopInput): Promise<void> {
  return request<void>(`/api/trips/${tripId}/stops`, { method: 'POST', body: JSON.stringify(input) })
}

export function moveStop(tripId: string, stopId: string, position: number): Promise<void> {
  return request<void>(`/api/trips/${tripId}/stops/${stopId}`, {
    method: 'PATCH',
    body: JSON.stringify({ position }),
  })
}

export function updateStopJournal(tripId: string, stopId: string, input: StopJournalInput): Promise<TripStop> {
  return request<TripStop>(`/api/trips/${tripId}/stops/${stopId}/journal`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteStop(tripId: string, stopId: string): Promise<void> {
  return request<void>(`/api/trips/${tripId}/stops/${stopId}`, { method: 'DELETE' })
}

export function uploadStopPhoto(tripId: string, stopId: string, file: File): Promise<TripStopPhoto> {
  const body = new FormData()
  body.append('file', file)
  return request<TripStopPhoto>(`/api/trips/${tripId}/stops/${stopId}/photos`, {
    method: 'POST',
    body,
  })
}

export function deleteStopPhoto(tripId: string, stopId: string, photoId: string): Promise<void> {
  return request<void>(`/api/trips/${tripId}/stops/${stopId}/photos/${photoId}`, { method: 'DELETE' })
}
