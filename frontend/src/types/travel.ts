export interface Country {
  code: string
  name: string
}

export interface City {
  id: string
  name: string
  latitude: number | null
  longitude: number | null
  country: Country
}

export interface TripStop {
  id: string
  position: number
  city: City
}

export interface Trip {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  stops: TripStop[]
}

export interface TripSummary {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  stopCount: number
}

export interface TripMapMarker {
  tripId: string
  stopId: string
  position: number
  cityName: string
  latitude: number
  longitude: number
  country: Country
}

export interface TripMapOverview {
  visitedCountryCodes: string[]
  markers: TripMapMarker[]
}

export interface TripDetailsInput {
  name: string
  startDate: string | null
  endDate: string | null
}

export interface AddStopInput {
  countryCode: string
  cityName: string
}
