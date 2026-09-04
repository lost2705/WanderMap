import { request } from './client'

export interface TravelAssistantResponse {
  runId: string
  answer: string
  toolsUsed: string[]
}

export function askTravelAssistant(message: string): Promise<TravelAssistantResponse> {
  return request<TravelAssistantResponse>('/api/ai/travel-assistant', {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}
