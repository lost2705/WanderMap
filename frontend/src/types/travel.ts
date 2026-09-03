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
  memoryCount: number
}

export interface TravelProfile {
  journeyCount: number
  visitCount: number
  uniqueCityCount: number
  countryCount: number
  travelDayCount: number
  memoryCount: number
  photoCount: number
  revisitedCityCount: number
  revisitedCountryCount: number
  highlights: TravelHighlights
  achievements: Achievement[]
}

export interface TravelHighlights {
  mostVisitedCity: CityHighlight | null
  mostVisitedCountry: CountryHighlight | null
  longestJourney: JourneyDurationHighlight | null
  mostRecentJourney: JourneyDateHighlight | null
  mostMemoryRichJourney: JourneyMemoryHighlight | null
}

export interface CityHighlight {
  cityId: string
  cityName: string
  countryCode: string
  countryName: string
  visitCount: number
}

export interface CountryHighlight {
  countryCode: string
  countryName: string
  visitCount: number
}

export interface JourneyDurationHighlight {
  journeyId: string
  journeyName: string
  dayCount: number
}

export interface JourneyDateHighlight {
  journeyId: string
  journeyName: string
  startDate: string
}

export interface JourneyMemoryHighlight {
  journeyId: string
  journeyName: string
  memoryCount: number
}

export interface Achievement {
  code: string
  title: string
  description: string
  category: 'journeys' | 'exploration' | 'memories' | 'time'
  unlocked: boolean
  currentValue: number
  targetValue: number
  progressPercent: number
}

export interface BucketListItem {
  id: string
  city: City
  createdAt: string
  visited: boolean
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

export interface AddBucketListItemInput {
  countryCode: string
  cityName: string
  latitude: number
  longitude: number
}

export interface StopJournalInput {
  arrivalDate: string | null
  departureDate: string | null
  note: string | null
}
