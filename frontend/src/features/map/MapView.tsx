import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { LngLatBounds, Marker, Popup } from 'maplibre-gl'
import type { Trip, TripMapOverview } from '../../types/travel'
import {
  countryCodesFromOverview,
  countryFeatureFilter,
  markersForMap,
  selectedTripCameraTarget,
  selectedTripCameraTargetKey,
} from './mapData'

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const COUNTRY_BOUNDARIES_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'
const WORLD_OVERVIEW_BOUNDS: [[number, number], [number, number]] = [[-180, -60], [180, 85]]
const WORLD_OVERVIEW_PADDING = 28
const COUNTRY_FILL = '#f2a620'
const COUNTRY_LINE = '#8b3d0b'

interface MapViewProps {
  overview: TripMapOverview | null
  selectedTrip: Trip | null
}

interface CountryBoundaryData {
  type: 'FeatureCollection'
  features: CountryBoundaryFeature[]
}

interface CountryBoundaryFeature {
  type: 'Feature'
  properties: Record<string, unknown> | null
  geometry: CountryGeometry
}

type CountryGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

export function MapView({ overview, selectedTrip }: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<Marker[]>([])
  const selectedTripRef = useRef(selectedTrip)
  const [readyMap, setReadyMap] = useState<maplibregl.Map | null>(null)
  const [countryBoundaryData, setCountryBoundaryData] = useState<CountryBoundaryData | null>(null)
  const [countryOverlayPaths, setCountryOverlayPaths] = useState<string[]>([])
  const visitedCountryCodes = countryCodesFromOverview(overview)
  const visitedCountryCodesKey = visitedCountryCodes.join(',')
  const cameraTarget = selectedTripCameraTarget(selectedTrip)
  const cameraTargetKey = selectedTripCameraTargetKey(cameraTarget)

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
        markerRefs.current.forEach((marker) => marker.remove())
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

    const renderCountryOverlay = () => {
      setCountryOverlayPaths(countryPathsForMap(map, countryBoundaryData, visitedCountryCodes))
    }

    renderCountryOverlay()
    map.on('move', renderCountryOverlay)
    map.on('resize', renderCountryOverlay)

    return () => {
      map.off('move', renderCountryOverlay)
      map.off('resize', renderCountryOverlay)
    }
  }, [readyMap, countryBoundaryData, visitedCountryCodesKey])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    markerRefs.current.forEach((marker) => marker.remove())
    const markers = markersForMap(overview, selectedTrip?.id ?? null)
      .map((marker) => createMarker(marker).addTo(map))
    markerRefs.current = markers

    return () => {
      markers.forEach((marker) => marker.remove())
      if (markerRefs.current === markers) {
        markerRefs.current = []
      }
    }
  }, [readyMap, overview, selectedTrip?.id])

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
      <div className="map-caption">
        <div>
          <p className="eyebrow">A visual travel journal</p>
          <h1>See where your stories take you.</h1>
        </div>
        <p>{visitedCountryCodes.length} countries visited</p>
      </div>
      <div className="map-canvas" ref={mapElementRef} />
      <svg aria-hidden="true" className="country-overlay">
        {countryOverlayPaths.map((path) => (
          <path
            d={path}
            fill={COUNTRY_FILL}
            fillOpacity={0.52}
            fillRule="evenodd"
            key={path}
            stroke={COUNTRY_LINE}
            strokeWidth={1.75}
          />
        ))}
      </svg>
      {!selectedTrip && overview && overview.markers.length > 0 ? (
        <p className="map-hint">Select a trip to focus its itinerary on the map.</p>
      ) : null}
    </section>
  )
}

function activeReadyMap(readyMap: maplibregl.Map | null, currentMap: maplibregl.Map | null): maplibregl.Map | null {
  return readyMap === currentMap ? readyMap : null
}

function countryPathsForMap(map: maplibregl.Map, countryBoundaryData: CountryBoundaryData, countryCodes: string[]): string[] {
  const filter = countryFeatureFilter(countryCodes)
  return countryBoundaryData.features
    .filter((feature) => matchesCountryFilter(feature, filter))
    .flatMap((feature) => geometryPaths(map, feature.geometry))
}

function matchesCountryFilter(
  feature: CountryBoundaryFeature,
  filter: ReturnType<typeof countryFeatureFilter>,
): boolean {
  if (filter[0] === '==') {
    return false
  }

  return filter[2].includes(String(feature.properties?.ISO_A2_EH ?? ''))
}

function geometryPaths(map: maplibregl.Map, geometry: CountryGeometry): string[] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.map((polygon) => polygonPath(map, polygon))
}

function polygonPath(map: maplibregl.Map, polygon: number[][][]): string {
  return polygon.map((ring) => ringPath(map, ring)).join(' ')
}

function ringPath(map: maplibregl.Map, ring: number[][]): string {
  return ring.map(([longitude, latitude], index) => {
    const point = map.project([longitude, latitude])
    return `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`
  }).join(' ') + 'Z'
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

function isCountryBoundaryData(data: unknown): data is CountryBoundaryData {
  return typeof data === 'object'
    && data !== null
    && (data as { type?: unknown }).type === 'FeatureCollection'
    && Array.isArray((data as { features?: unknown }).features)
    && (data as { features: unknown[] }).features.every(isCountryBoundaryFeature)
}

function isCountryBoundaryFeature(feature: unknown): feature is CountryBoundaryFeature {
  return typeof feature === 'object'
    && feature !== null
    && (feature as { type?: unknown }).type === 'Feature'
    && isCountryGeometry((feature as { geometry?: unknown }).geometry)
    && ((feature as { properties?: unknown }).properties === null
      || typeof (feature as { properties?: unknown }).properties === 'object')
}

function isCountryGeometry(geometry: unknown): geometry is CountryGeometry {
  return typeof geometry === 'object'
    && geometry !== null
    && ((geometry as { type?: unknown }).type === 'Polygon' || (geometry as { type?: unknown }).type === 'MultiPolygon')
    && Array.isArray((geometry as { coordinates?: unknown }).coordinates)
}

function createMarker(marker: ReturnType<typeof markersForMap>[number]): Marker {
  const element = document.createElement('button')
  element.className = `map-marker${marker.isSelectedTrip ? ' is-selected' : ''}`
  element.type = 'button'
  element.setAttribute('aria-label', `${marker.cityName}, ${marker.country.name}`)
  element.textContent = marker.markerLabel

  const popupContent = document.createElement('div')
  const city = document.createElement('strong')
  city.textContent = marker.cityName
  const country = document.createElement('span')
  country.textContent = marker.country.name
  popupContent.append(city, country)

  return new Marker({ element, anchor: 'center' })
    .setLngLat(marker.coordinate)
    .setPopup(new Popup({ offset: 16 }).setDOMContent(popupContent))
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
