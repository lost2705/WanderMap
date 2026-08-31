import type {
  Country,
  Trip,
  TripMapMarker,
  TripMapOverview,
} from '../../types/travel'

export const COUNTRY_ISO_ALPHA2_PROPERTY =
  'ISO_A2_EH'

export type MapCoordinate = [
  longitude: number,
  latitude: number,
]

export type MapPixelOffset = [
  x: number,
  y: number,
]

export type CountryFeatureFilter =
  | [
      'match',
      [
        'get',
        typeof COUNTRY_ISO_ALPHA2_PROPERTY,
      ],
      string[],
      true,
      false,
    ]
  | [
      '==',
      [
        'get',
        typeof COUNTRY_ISO_ALPHA2_PROPERTY,
      ],
      '',
    ]

export interface PlaceVisit {
  tripId: string
  stopId: string
  position: number
}

export interface DisplayMarker {
  markerKey: string
  mode: 'global-place' | 'selected-itinerary'
  cityId: string
  cityName: string
  country: Country
  visits: PlaceVisit[]
  coordinate: MapCoordinate
  identityColor: string
  markerLabel: string | null
  collisionOrder: number
  pixelOffset: MapPixelOffset
}

export interface ProjectedMarker {
  markerKey: string
  collisionOrder: number
  screenCoordinate: MapPixelOffset
}

export interface TripVisualIdentity {
  color: string
}

export interface TripRoute {
  tripId: string
  coordinates: MapCoordinate[]
  identityColor: string
  lineOffset: number
  lineWidth: number
  lineOpacity: number
  casingWidth: number
  isSelectedTrip: boolean
}

export interface TripRouteFeatureCollection {
  type: 'FeatureCollection'
  features: TripRouteFeature[]
}

export interface WorldPlaceFeatureCollection {
  type: 'FeatureCollection'
  features: WorldPlaceFeature[]
}

export interface WorldPlaceFeature {
  type: 'Feature'
  properties: {
    cityId: string
    cityName: string
    countryCode: string
    countryName: string
    visitCount: number
  }
  geometry: {
    type: 'Point'
    coordinates: MapCoordinate
  }
}

interface TripRouteFeature {
  type: 'Feature'
  properties: {
    tripId: string
    identityColor: string
    lineOffset: number
    lineWidth: number
    lineOpacity: number
    casingWidth: number
    isSelectedTrip: boolean
  }
  geometry: {
    type: 'LineString'
    coordinates: MapCoordinate[]
  }
}

interface RouteStop {
  stopId: string
  position: number
  latitude: number | null
  longitude: number | null
}

const TRIP_COLORS = [
  '#176b87',
  '#a33f5f',
  '#357a54',
  '#6855a6',
  '#b34f2f',
  '#2b708f',
  '#8b5a24',
  '#4d6673',
] as const

export const MARKER_MINIMUM_SPACING = 38

export type SelectedTripCameraTarget =
  | {
      kind: 'none'
    }
  | {
      kind: 'point'
      tripId: string
      coordinate: MapCoordinate
      zoom: number
    }
  | {
      kind: 'bounds'
      tripId: string
      coordinates: MapCoordinate[]
    }

export function countryCodesForMap(
  overview: TripMapOverview | null,
  selectedTrip: Trip | null,
): string[] {
  if (!selectedTrip) {
    return [...new Set(overview?.visitedCountryCodes ?? [])].sort()
  }

  return [
    ...new Set(selectedTrip.stops.map((stop) => stop.city.country.code)),
  ].sort()
}

export function markersForMap(
  overview: TripMapOverview | null,
  selectedTripId: string | null,
): DisplayMarker[] {
  return selectedTripId === null
    ? placesForGlobalMap(overview)
    : markersForSelectedTrip(overview, selectedTripId)
}

export function placesForGlobalMap(overview: TripMapOverview | null): DisplayMarker[] {
  const places = new Map<string, DisplayMarker>()
  const markers = [...(overview?.markers ?? [])]
    .filter(hasRenderableLocation)
    .sort(comparePlaceSourceMarkers)

  for (const marker of markers) {
    const visit: PlaceVisit = {
      tripId: marker.tripId,
      stopId: marker.stopId,
      position: marker.position,
    }
    const existingPlace = places.get(marker.cityId)
    if (existingPlace) {
      existingPlace.visits.push(visit)
      continue
    }

    places.set(marker.cityId, {
      markerKey: `place:${marker.cityId}`,
      mode: 'global-place',
      cityId: marker.cityId,
      cityName: marker.cityName,
      country: marker.country,
      visits: [visit],
      coordinate: toMapCoordinate(marker.latitude, marker.longitude),
      identityColor: tripVisualIdentity(marker.tripId).color,
      markerLabel: null,
      collisionOrder: 0,
      pixelOffset: [0, 0],
    })
  }

  return [...places.values()]
}

function hasRenderableLocation(marker: TripMapOverview['markers'][number]): boolean {
  return Number.isFinite(marker.latitude)
    && Number.isFinite(marker.longitude)
    && marker.latitude >= -90
    && marker.latitude <= 90
    && marker.longitude >= -180
    && marker.longitude <= 180
}

export function worldPlaceFeatureCollection(overview: TripMapOverview | null): WorldPlaceFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: placesForGlobalMap(overview).map((place) => ({
      type: 'Feature',
      properties: {
        cityId: place.cityId,
        cityName: place.cityName,
        countryCode: place.country.code,
        countryName: place.country.name,
        visitCount: place.visits.length,
      },
      geometry: {
        type: 'Point',
        coordinates: place.coordinate,
      },
    })),
  }
}

export function markersForSelectedTrip(
  overview: TripMapOverview | null,
  selectedTripId: string,
): DisplayMarker[] {
  return (overview?.markers ?? [])
    .filter((marker) => marker.tripId === selectedTripId)
    .sort((first, second) => first.position - second.position || first.stopId.localeCompare(second.stopId))
    .map((marker): DisplayMarker => ({
      markerKey: `itinerary:${marker.tripId}:${marker.stopId}`,
      mode: 'selected-itinerary',
      cityId: marker.cityId,
      cityName: marker.cityName,
      country: marker.country,
      visits: [{ tripId: marker.tripId, stopId: marker.stopId, position: marker.position }],
      coordinate: toMapCoordinate(marker.latitude, marker.longitude),
      identityColor: tripVisualIdentity(marker.tripId).color,
      markerLabel: String(marker.position),
      collisionOrder: marker.position,
      pixelOffset: [0, 0],
    }))
}

export function markerScreenKey(marker: Pick<ProjectedMarker, 'markerKey'>): string {
  return marker.markerKey
}

/**
 * Separates connected screen-space collision groups around their shared centroid. Every returned
 * value is an absolute offset from the marker's projected geographic point, so recomputing after a
 * pan, zoom, or selection transition cannot accumulate earlier displacement.
 */
export function markerOffsetsForScreenCollisions(
  markers: ProjectedMarker[],
  minimumSpacing = MARKER_MINIMUM_SPACING,
): Map<string, MapPixelOffset> {
  const sortedMarkers = [...markers].sort(compareProjectedMarkers)
  const collisionGroups = connectedCollisionGroups(sortedMarkers, minimumSpacing)
  const offsets = new Map<string, MapPixelOffset>()

  for (const group of collisionGroups) {
    if (group.length === 1) {
      const marker = group[0]
      if (marker) {
        offsets.set(markerScreenKey(marker), [0, 0])
      }
      continue
    }

    const center: MapPixelOffset = [
      group.reduce((sum, marker) => sum + marker.screenCoordinate[0], 0) / group.length,
      group.reduce((sum, marker) => sum + marker.screenCoordinate[1], 0) / group.length,
    ]
    const radius = minimumSpacing / (2 * Math.sin(Math.PI / group.length)) + 1

    group.forEach((marker, index) => {
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / group.length
      const target: MapPixelOffset = [
        center[0] + Math.cos(angle) * radius,
        center[1] + Math.sin(angle) * radius,
      ]
      offsets.set(markerScreenKey(marker), [
        target[0] - marker.screenCoordinate[0],
        target[1] - marker.screenCoordinate[1],
      ])
    })
  }

  return offsets
}

/**
 * Routes follow itinerary position after omitting stops without a complete location. The remaining
 * located stops are connected as neighbors, so a missing legacy stop never invents a coordinate or
 * changes the order of the stops that can be drawn.
 */
export function routesForMap(
  overview: TripMapOverview | null,
  selectedTrip: Trip | null,
  showGlobalRoutes = false,
): TripRoute[] {
  return selectedTrip
    ? routesForSelectedTrip(selectedTrip)
    : showGlobalRoutes
      ? routesForOverview(overview)
      : []
}

export function routesForOverview(overview: TripMapOverview | null): TripRoute[] {
  const markersByTrip = new Map<string, TripMapMarker[]>()
  for (const marker of overview?.markers ?? []) {
    const tripMarkers = markersByTrip.get(marker.tripId) ?? []
    tripMarkers.push(marker)
    markersByTrip.set(marker.tripId, tripMarkers)
  }

  return [...markersByTrip.entries()]
    .sort(([firstTripId], [secondTripId]) => firstTripId.localeCompare(secondTripId))
    .flatMap(([tripId, markers]) => {
      const route = routeForStops(tripId, markers.map((marker) => ({
        stopId: marker.stopId,
        position: marker.position,
        latitude: marker.latitude,
        longitude: marker.longitude,
      })), false)
      return route ? [route] : []
    })
}

export function routesForSelectedTrip(selectedTrip: Trip | null): TripRoute[] {
  if (!selectedTrip) {
    return []
  }

  const route = routeForStops(
    selectedTrip.id,
    selectedTrip.stops.map((stop) => ({
      stopId: stop.id,
      position: stop.position,
      latitude: stop.city.latitude,
      longitude: stop.city.longitude,
    })),
    true,
  )
  return route ? [route] : []
}

export function routeFeatureCollection(routes: TripRoute[]): TripRouteFeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => ({
      type: 'Feature',
      properties: {
        tripId: route.tripId,
        identityColor: route.identityColor,
        lineOffset: route.lineOffset,
        lineWidth: route.lineWidth,
        lineOpacity: route.lineOpacity,
        casingWidth: route.casingWidth,
        isSelectedTrip: route.isSelectedTrip,
      },
      geometry: {
        type: 'LineString',
        coordinates: route.coordinates,
      },
    })),
  }
}

export function tripVisualIdentity(tripId: string): TripVisualIdentity {
  let hash = 2166136261
  for (let index = 0; index < tripId.length; index += 1) {
    hash ^= tripId.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return {
    color: TRIP_COLORS[(hash >>> 0) % TRIP_COLORS.length] ?? TRIP_COLORS[0],
  }
}

export function markersForTrip(
  trip: Trip | null,
): TripMapMarker[] {
  return (trip?.stops ?? [])
    .filter(
      (stop) =>
        stop.city.latitude !== null &&
        stop.city.longitude !== null,
    )
    .map((stop) => ({
      tripId: trip?.id ?? '',
      stopId: stop.id,
      cityId: stop.city.id,
      position: stop.position,
      cityName: stop.city.name,

      latitude:
        stop.city.latitude as number,

      longitude:
        stop.city.longitude as number,

      country: stop.city.country,
    }))
}

export function toMapCoordinate(
  latitude: number,
  longitude: number,
): MapCoordinate {
  return [
    longitude,
    latitude,
  ]
}

export function countryFeatureFilter(
  countryCodes: string[],
): CountryFeatureFilter {
  return countryCodes.length > 0
    ? [
        'match',
        [
          'get',
          COUNTRY_ISO_ALPHA2_PROPERTY,
        ],
        countryCodes,
        true,
        false,
      ]
    : [
        '==',
        [
          'get',
          COUNTRY_ISO_ALPHA2_PROPERTY,
        ],
        '',
      ]
}

export function selectedTripCameraTarget(
  trip: Trip | null,
): SelectedTripCameraTarget {
  const markers =
    markersForTrip(trip)

  if (
    markers.length === 0 ||
    trip === null
  ) {
    return {
      kind: 'none',
    }
  }

  const coordinates =
    markers.map((marker) =>
      toMapCoordinate(
        marker.latitude,
        marker.longitude,
      ),
    )

  if (coordinates.length === 1) {
    return {
      kind: 'point',
      tripId: trip.id,
      coordinate: coordinates[0],
      zoom: 6,
    }
  }

  return {
    kind: 'bounds',
    tripId: trip.id,
    coordinates,
  }
}

export function selectedTripCameraTargetKey(
  target: SelectedTripCameraTarget,
): string {
  if (target.kind === 'none') {
    return 'none'
  }

  if (target.kind === 'point') {
    return `point:${target.tripId}:${target.coordinate.join(',')}`
  }

  return `bounds:${target.tripId}:${target.coordinates
    .map((coordinate) =>
      coordinate.join(','),
    )
    .join('|')}`
}

function routeForStops(
  tripId: string,
  stops: RouteStop[],
  isSelectedTrip: boolean,
): TripRoute | null {
  const coordinates = [...stops]
    .sort(compareRouteStops)
    .flatMap((stop) => stop.latitude === null || stop.longitude === null
      ? []
      : [toMapCoordinate(stop.latitude, stop.longitude)])

  if (coordinates.length < 2) {
    return null
  }

  return {
    tripId,
    coordinates,
    identityColor: tripVisualIdentity(tripId).color,
    lineOffset: 0,
    lineWidth: isSelectedTrip ? 5 : 3.5,
    lineOpacity: isSelectedTrip ? 0.96 : 0.76,
    casingWidth: isSelectedTrip ? 8 : 6.5,
    isSelectedTrip,
  }
}

function compareRouteStops(first: RouteStop, second: RouteStop): number {
  return first.position - second.position || first.stopId.localeCompare(second.stopId)
}

function compareProjectedMarkers(first: ProjectedMarker, second: ProjectedMarker): number {
  return first.collisionOrder - second.collisionOrder
    || first.markerKey.localeCompare(second.markerKey)
}

function comparePlaceSourceMarkers(first: TripMapMarker, second: TripMapMarker): number {
  return first.cityId.localeCompare(second.cityId)
    || first.tripId.localeCompare(second.tripId)
    || first.position - second.position
    || first.stopId.localeCompare(second.stopId)
}

function connectedCollisionGroups(markers: ProjectedMarker[], minimumSpacing: number): ProjectedMarker[][] {
  const groups: ProjectedMarker[][] = []
  const ungrouped = new Set(markers)

  for (const firstMarker of markers) {
    if (!ungrouped.delete(firstMarker)) {
      continue
    }

    const group = [firstMarker]
    for (let index = 0; index < group.length; index += 1) {
      const currentMarker = group[index]
      if (!currentMarker) {
        continue
      }

      for (const candidate of [...ungrouped]) {
        if (screenDistance(currentMarker.screenCoordinate, candidate.screenCoordinate) < minimumSpacing) {
          ungrouped.delete(candidate)
          group.push(candidate)
        }
      }
    }

    groups.push(group.sort(compareProjectedMarkers))
  }

  return groups
}

function screenDistance(first: MapPixelOffset, second: MapPixelOffset): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1])
}
