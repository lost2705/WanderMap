import { request } from './client'
import type { AddStopInput, Trip, TripDetailsInput, TripMapOverview, TripSummary } from '../types/travel'

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

export function deleteStop(tripId: string, stopId: string): Promise<void> {
  return request<void>(`/api/trips/${tripId}/stops/${stopId}`, { method: 'DELETE' })
}
