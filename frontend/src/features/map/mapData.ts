import type {
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

export interface DisplayMarker
  extends TripMapMarker {
  coordinate: MapCoordinate
  markerLabel: string
  isSelectedTrip: boolean
}

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

export function countryCodesFromOverview(
  overview: TripMapOverview | null,
): string[] {
  return overview
    ? [
        ...new Set(
          overview.visitedCountryCodes,
        ),
      ].sort()
    : []
}

export function markersForMap(
  overview: TripMapOverview | null,
  selectedTripId: string | null,
): DisplayMarker[] {
  return (overview?.markers ?? []).map(
    (marker) => ({
      ...marker,

      coordinate: toMapCoordinate(
        marker.latitude,
        marker.longitude,
      ),

      markerLabel: String(
        marker.position,
      ),

      isSelectedTrip:
        marker.tripId === selectedTripId,
    }),
  )
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
