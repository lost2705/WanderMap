import { request } from './client'

export type TripPlanPace = 'RELAXED' | 'BALANCED' | 'FAST'

export interface TripPlanStop {
  cityName: string
  countryCode: string
  countryName: string
  latitude: number
  longitude: number
  daysAtStop: number
  reason: string
  activities: string[]
  bucketListMatch: boolean
  alreadyVisited: boolean
}

export interface TripPlanDraft {
  title: string
  summary: string
  durationDays: number
  startDate: string | null
  endDate: string | null
  destinationSummary: string
  pace: TripPlanPace
  stops: TripPlanStop[]
  considerations: string[]
  sourcesUsed: string[]
}

export interface TripPlanningResponse {
  runId: string
  plan: TripPlanDraft
  toolsUsed: string[]
}

export function createTripPlan(message: string): Promise<TripPlanningResponse> {
  return request<TripPlanningResponse>('/api/ai/trip-plan', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}
