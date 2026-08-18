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
  arrivalDate: string | null
  departureDate: string | null
  note: string | null
  city: City
  /** Absent only when hydrating a legacy cached response; current APIs always return an array. */
  photos?: TripStopPhoto[]
}

export interface TripStopPhoto {
  id: string
  originalFilename: string
  contentType: string
  size: number
  position: number
  contentUrl: string
}

export interface Trip {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  description: string | null
  stops: TripStop[]
}

export interface TripSummary {
  id: string
  name: string
  startDate: string | null
  endDate: string | null
  description: string | null
  stopCount: number
}

export interface TripMapMarker {
  tripId: string
  stopId: string
  cityId: string
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

export interface PlaceDetails {
  city: City
  visitCount: number
  visits: PlaceVisit[]
}

export interface PlaceVisit {
  tripId: string
  tripName: string
  tripStartDate: string | null
  tripEndDate: string | null
  tripDescription: string | null
  stopId: string
  position: number
  arrivalDate: string | null
  departureDate: string | null
  note: string | null
  photos: TripStopPhoto[]
}

export interface CitySearchResult {
  name: string
  countryName: string
  regionName: string | null
  countryCode: string
  latitude: number
  longitude: number
}

export interface TripDetailsInput {
  name: string
  startDate: string | null
  endDate: string | null
  description: string | null
}

export interface AddStopInput {
  countryCode: string
  cityName: string
  latitude: number
  longitude: number
  arrivalDate?: string | null
  departureDate?: string | null
  note?: string | null
}

export interface StopJournalInput {
  arrivalDate: string | null
  departureDate: string | null
  note: string | null
}
