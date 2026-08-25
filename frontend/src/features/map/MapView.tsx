import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { LngLatBounds, Marker, Popup } from 'maplibre-gl'
import type { Trip, TripMapOverview, TripSummary } from '../../types/travel'
import {
  ensureCountryHighlightLayer,
  isCountryBoundaryData,
  removeCountryHighlightLayer,
  updateCountryHighlightColor,
  updateCountryHighlightFilter,
} from './countryHighlightLayers'
import type { CountryBoundaryData } from './countryHighlightLayers'
import {
  countryCodesForMap,
  markerOffsetsForScreenCollisions,
  markerScreenKey,
  markersForMap,
  routeFeatureCollection,
  routesForMap,
  selectedTripCameraTarget,
  selectedTripCameraTargetKey,
} from './mapData'
import { ensureTripRouteLayers, removeTripRouteLayers, updateTripRouteData } from './routeLayers'

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const COUNTRY_BOUNDARIES_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson'
const WORLD_OVERVIEW_BOUNDS: [[number, number], [number, number]] = [[-180, -60], [180, 85]]
const WORLD_OVERVIEW_PADDING = 28
const DEFAULT_COUNTRY_FILL = '#df8a5f'

interface MapViewProps {
  overview: TripMapOverview | null
  selectedTrip: Trip | null
  trips: TripSummary[]
  onSelectPlace: (cityId: string) => void
}

interface MapMarkerReference {
  data: ReturnType<typeof markersForMap>[number]
  marker: Marker
}

export function MapView({ overview, selectedTrip, trips, onSelectPlace }: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<MapMarkerReference[]>([])
  const selectedTripRef = useRef(selectedTrip)
  const [readyMap, setReadyMap] = useState<maplibregl.Map | null>(null)
  const [countryBoundaryData, setCountryBoundaryData] = useState<CountryBoundaryData | null>(null)
  const visitedCountryCodes = countryCodesForMap(overview, selectedTrip)
  const visitedCountryCodesKey = visitedCountryCodes.join(',')
  const displayMarkers = markersForMap(overview, selectedTrip?.id ?? null)
  const routeData = routeFeatureCollection(routesForMap(overview, selectedTrip))
  const routeDataKey = JSON.stringify(routeData)
  const cameraTarget = selectedTripCameraTarget(selectedTrip)
  const cameraTargetKey = selectedTripCameraTargetKey(cameraTarget)
  const tripNamesKey = JSON.stringify(trips.map((trip) => [trip.id, trip.name]))

  useEffect(() => {
    selectedTripRef.current = selectedTrip
  }, [selectedTrip])

  useEffect(() => {
    const controller = new AbortController()

    void fetchCountryBoundaries(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) {
          setCountryBoundaryData(data)
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && import.meta.env.DEV) {
          console.warn('Could not load country boundaries; continuing without the country overlay.', error)
        }
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!mapElementRef.current) {
      return
    }

    const map = new maplibregl.Map({
      container: mapElementRef.current,
      style: MAP_STYLE_URL,
      center: [0, 18],
      zoom: -1,
      minZoom: -2,
      renderWorldCopies: false,
    })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')

    const isActiveMap = () => mapRef.current === map
    let isReady = false
    const resetDefaultViewport = () => {
      if (isActiveMap()) {
        updateWorldViewport(map, selectedTripRef.current === null)
      }
    }
    const markMapReady = () => {
      if (!isActiveMap() || isReady) {
        return
      }

      isReady = true
      resetDefaultViewport()
      setReadyMap(map)
    }

    map.once('style.load', markMapReady)
    map.on('resize', resetDefaultViewport)
    if (map.isStyleLoaded()) {
      markMapReady()
    }

    return () => {
      map.off('style.load', markMapReady)
      map.off('resize', resetDefaultViewport)
      if (mapRef.current === map) {
        markerRefs.current.forEach(({ marker }) => marker.remove())
        markerRefs.current = []
        mapRef.current = null
      }
      setReadyMap((currentMap) => (currentMap === map ? null : currentMap))
      map.remove()
    }
  }, [])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map || !countryBoundaryData) {
      return
    }

    ensureCountryHighlightLayer(map, countryBoundaryData, visitedCountryCodes, countryFillColor())

    return () => {
      if (mapRef.current === map) {
        removeCountryHighlightLayer(map)
      }
    }
  }, [readyMap, countryBoundaryData])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    updateCountryHighlightFilter(map, visitedCountryCodes)
  }, [readyMap, visitedCountryCodesKey])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map || !countryBoundaryData) {
      return
    }

    const applyThemeColor = () => updateCountryHighlightColor(map, countryFillColor())
    applyThemeColor()
    const observer = new MutationObserver(applyThemeColor)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => observer.disconnect()
  }, [readyMap, countryBoundaryData])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    ensureTripRouteLayers(map)

    return () => {
      if (mapRef.current !== map) {
        return
      }
      removeTripRouteLayers(map)
    }
  }, [readyMap])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    updateTripRouteData(map, routeData)
  }, [readyMap, routeDataKey])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    markerRefs.current.forEach(({ marker }) => marker.remove())
    const tripNames = new Map(trips.map((trip) => [trip.id, trip.name]))
    const markers = displayMarkers
      .map((data): MapMarkerReference => ({
        data,
        marker: createMarker(data, tripNames, onSelectPlace).addTo(map),
      }))
    const updateMarkerOffsets = () => {
      const offsets = markerOffsetsForScreenCollisions(markers.map(({ data }) => {
        const point = map.project(data.coordinate)
        return {
          markerKey: data.markerKey,
          collisionOrder: data.collisionOrder,
          screenCoordinate: [point.x, point.y],
        }
      }))

      markers.forEach(({ data, marker }) => {
        marker.setOffset(offsets.get(markerScreenKey(data)) ?? [0, 0])
      })
    }

    updateMarkerOffsets()
    map.on('move', updateMarkerOffsets)
    map.on('resize', updateMarkerOffsets)
    markerRefs.current = markers

    return () => {
      map.off('move', updateMarkerOffsets)
      map.off('resize', updateMarkerOffsets)
      markers.forEach(({ marker }) => marker.remove())
      if (markerRefs.current === markers) {
        markerRefs.current = []
      }
    }
  }, [readyMap, overview, selectedTrip?.id, tripNamesKey, onSelectPlace])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    if (cameraTarget.kind === 'none') {
      updateWorldViewport(map, true)
      return
    }

    if (cameraTarget.kind === 'point') {
      map.flyTo({ center: cameraTarget.coordinate, zoom: cameraTarget.zoom, essential: true })
      return
    }

    const bounds = cameraTarget.coordinates.reduce(
      (currentBounds, coordinate) => currentBounds.extend(coordinate),
      new LngLatBounds(),
    )
    map.fitBounds(bounds, { padding: 90, maxZoom: 6, duration: 700 })
  }, [readyMap, cameraTargetKey])

  return (
    <section className="map-panel" aria-label="Interactive travel map">
      <div className={`map-caption${selectedTrip ? ' is-journey' : ' is-global'}`}>
        <div>
          <p className="eyebrow">{selectedTrip ? 'Journey map' : 'A visual travel journal'}</p>
          <h1>{selectedTrip ? selectedTrip.name : (
            <>See where your <span>stories take you.</span></>
          )}</h1>
        </div>
        <p>{selectedTrip
          ? `${displayMarkers.length} ${displayMarkers.length === 1 ? 'place' : 'places'} · ${visitedCountryCodes.length} ${visitedCountryCodes.length === 1 ? 'country' : 'countries'}`
          : `${displayMarkers.length} ${displayMarkers.length === 1 ? 'place' : 'places'} visited`}</p>
      </div>
      <div className="map-canvas" ref={mapElementRef} />
      {!selectedTrip && overview && overview.markers.length > 0 ? (
        <p className="map-hint">Choose a journey to trace its story across the map.</p>
      ) : null}
    </section>
  )
}

function activeReadyMap(readyMap: maplibregl.Map | null, currentMap: maplibregl.Map | null): maplibregl.Map | null {
  return readyMap === currentMap ? readyMap : null
}

async function fetchCountryBoundaries(signal: AbortSignal): Promise<CountryBoundaryData> {
  const response = await fetch(COUNTRY_BOUNDARIES_URL, { signal })
  if (!response.ok) {
    throw new Error(`Country boundary request failed with ${response.status}`)
  }

  const data: unknown = await response.json()
  if (!isCountryBoundaryData(data)) {
    throw new Error('Country boundary response was not a feature collection')
  }
  return data
}

function createMarker(
  marker: ReturnType<typeof markersForMap>[number],
  tripNames: Map<string, string>,
  onSelectPlace: (cityId: string) => void,
): Marker {
  const element = document.createElement('button')
  element.className = marker.mode === 'global-place'
    ? 'map-marker is-place'
    : 'map-marker is-itinerary is-selected'
  element.type = 'button'
  element.style.setProperty('--trip-color', marker.color)
  element.setAttribute('aria-label', markerAriaLabel(marker, tripNames))
  element.textContent = marker.markerLabel ?? ''

  const mapMarker = new Marker({ element, anchor: 'center', offset: marker.pixelOffset })
    .setLngLat(marker.coordinate)

  if (marker.mode === 'global-place') {
    element.addEventListener('click', () => onSelectPlace(marker.cityId))
    return mapMarker
  }

  const popupContent = document.createElement('div')
  const city = document.createElement('strong')
  city.textContent = marker.cityName
  const country = document.createElement('span')
  country.textContent = marker.country.name
  popupContent.append(city, country)

  const visit = marker.visits[0]
  const tripName = visit ? tripNames.get(visit.tripId) : undefined
  if (tripName) {
    popupContent.append(popupLine(`Trip: ${tripName}`))
  }
  if (visit) {
    popupContent.append(popupLine(`Stop ${visit.position}`))
  }

  return mapMarker.setPopup(new Popup({ offset: 16 }).setDOMContent(popupContent))
}

function markerAriaLabel(
  marker: ReturnType<typeof markersForMap>[number],
  tripNames: Map<string, string>,
): string {
  const place = `${marker.cityName}, ${marker.country.name}`
  if (marker.mode === 'selected-itinerary') {
    const visit = marker.visits[0]
    const tripName = visit ? tripNames.get(visit.tripId) : undefined
    return `${place}${tripName ? ` — ${tripName}` : ''}${visit ? `, stop ${visit.position}` : ''}`
  }

  const names = uniqueTripNames(marker.visits, tripNames)
  return `${place} — visited in ${names.join(', ')}`
}

function uniqueTripNames(
  visits: ReturnType<typeof markersForMap>[number]['visits'],
  tripNames: Map<string, string>,
): string[] {
  return [...new Set(visits.map((visit) => tripNames.get(visit.tripId) ?? visit.tripId))]
}

function popupLine(text: string): HTMLSpanElement {
  const line = document.createElement('span')
  line.textContent = text
  return line
}

function countryFillColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-map-country-fill').trim()
    || DEFAULT_COUNTRY_FILL
}

function updateWorldViewport(map: maplibregl.Map, moveCamera: boolean) {
  const camera = map.cameraForBounds(WORLD_OVERVIEW_BOUNDS, { padding: WORLD_OVERVIEW_PADDING })
  if (!camera) {
    return
  }

  map.setMinZoom(camera.zoom)
  if (moveCamera) {
    map.jumpTo(camera)
  }
}
