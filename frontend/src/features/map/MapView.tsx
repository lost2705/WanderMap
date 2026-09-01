import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { LngLatBounds, Marker, Popup } from 'maplibre-gl'
import type { Trip, TripMapOverview, TripSummary } from '../../types/travel'
import {
  JOURNEY_COUNTRY_HIGHLIGHT_OPACITY,
  WORLD_COUNTRY_HIGHLIGHT_OPACITY,
  ensureCountryHighlightLayer,
  isCountryBoundaryData,
  removeCountryHighlightLayer,
  updateCountryHighlightColor,
  updateCountryHighlightFilter,
  updateCountryHighlightOpacity,
} from './countryHighlightLayers'
import type { CountryBoundaryData } from './countryHighlightLayers'
import {
  applyBasemapPalette,
  configureBasemapHierarchy,
  discoverBasemapLayers,
} from './basemapStyle'
import type { BasemapLayerIndex } from './basemapStyle'
import {
  configureFlatMapInteractions,
  constrainAtlasCamera,
  FLAT_MAP_INTERACTION_OPTIONS,
  flatCameraOptions,
  worldOverviewCamera,
  WORLD_ATLAS_LONGITUDE,
} from './mapCamera'
import {
  countryCodesForMap,
  markerOffsetsForScreenCollisions,
  markerScreenKey,
  markersForSelectedTrip,
  placesForGlobalMap,
  routeFeatureCollection,
  routesForMap,
  selectedTripCameraTarget,
  selectedTripCameraTargetKey,
  worldPlaceFeatureCollection,
} from './mapData'
import type { DisplayMarker } from './mapData'
import { mapThemeColors } from './mapTheme'
import {
  ensureTripRouteLayers,
  removeTripRouteLayers,
  updateTripRouteColor,
  updateTripRouteData,
} from './routeLayers'
import {
  bindWorldPlaceInteractions,
  ensureWorldPlaceLayers,
  removeWorldPlaceLayers,
  updateWorldPlaceColors,
  updateWorldPlaceData,
  updateWorldPlaceVisibility,
} from './worldPlaceLayers'

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const COUNTRY_BOUNDARIES_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson'

interface MapViewProps {
  overview: TripMapOverview | null
  selectedTrip: Trip | null
  trips: TripSummary[]
  onSelectPlace: (cityId: string) => void
  worldResetKey?: number
}

interface MapMarkerReference {
  data: DisplayMarker
  marker: Marker
}

export function MapView({ overview, selectedTrip, trips, onSelectPlace, worldResetKey = 0 }: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<MapMarkerReference[]>([])
  const basemapLayersRef = useRef<BasemapLayerIndex | null>(null)
  const [readyMap, setReadyMap] = useState<maplibregl.Map | null>(null)
  const [countryBoundaryData, setCountryBoundaryData] = useState<CountryBoundaryData | null>(null)
  const [showGlobalRoutes, setShowGlobalRoutes] = useState(false)
  const visitedCountryCodes = countryCodesForMap(overview, selectedTrip)
  const visitedCountryCodesKey = visitedCountryCodes.join(',')
  const worldPlaces = placesForGlobalMap(overview)
  const worldPlaceData = worldPlaceFeatureCollection(overview)
  const worldPlaceDataKey = JSON.stringify(worldPlaceData)
  const selectedMarkers = selectedTrip ? markersForSelectedTrip(overview, selectedTrip.id) : []
  const globalRoutesAvailable = routesForMap(overview, null, true).length > 0
  const routeData = routeFeatureCollection(routesForMap(overview, selectedTrip, showGlobalRoutes))
  const routeDataKey = JSON.stringify(routeData)
  const cameraTarget = selectedTripCameraTarget(selectedTrip)
  const cameraTargetKey = selectedTripCameraTargetKey(cameraTarget)
  const tripNamesKey = JSON.stringify(trips.map((trip) => [trip.id, trip.name]))

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

    let viewportWidth = mapElementRef.current.clientWidth
    let viewportHeight = mapElementRef.current.clientHeight
    const initialCamera = worldOverviewCamera(viewportWidth, viewportHeight)
    const map = new maplibregl.Map({
      container: mapElementRef.current,
      style: MAP_STYLE_URL,
      center: [WORLD_ATLAS_LONGITUDE, 18],
      zoom: -1,
      minZoom: initialCamera?.zoom ?? -2,
      ...initialCamera,
      renderWorldCopies: false,
      ...FLAT_MAP_INTERACTION_OPTIONS,
      transformCameraUpdate: (next) => {
        const { center, ...camera } = constrainAtlasCamera(next, viewportWidth, viewportHeight)
        return center
          ? { ...camera, center: new maplibregl.LngLat(...center) }
          : camera
      },
    })
    mapRef.current = map
    configureFlatMapInteractions(map)
    map.addControl(new maplibregl.NavigationControl({ showCompass: false, showZoom: true }), 'top-right')

    const isActiveMap = () => mapRef.current === map
    let isReady = false
    const updateViewportLimit = () => {
      if (isActiveMap()) {
        viewportWidth = map.getContainer().clientWidth
        viewportHeight = map.getContainer().clientHeight
        // Both modes need the same safe far-zoom limit; this does not refit.
        updateWorldViewport(map, false)
      }
    }
    const markMapReady = () => {
      if (!isActiveMap() || isReady) {
        return
      }

      isReady = true
      const basemapLayers = discoverBasemapLayers(map.getStyle()?.layers ?? [])
      basemapLayersRef.current = basemapLayers
      configureBasemapHierarchy(map, basemapLayers)
      applyBasemapPalette(map, basemapLayers, mapThemeColors().basemap)
      setReadyMap(map)
    }

    map.once('style.load', markMapReady)
    map.on('resize', updateViewportLimit)
    if (map.isStyleLoaded()) {
      markMapReady()
    }

    return () => {
      map.off('style.load', markMapReady)
      map.off('resize', updateViewportLimit)
      if (mapRef.current === map) {
        markerRefs.current.forEach(({ marker }) => marker.remove())
        markerRefs.current = []
        basemapLayersRef.current = null
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

    ensureCountryHighlightLayer(
      map,
      countryBoundaryData,
      visitedCountryCodes,
      mapThemeColors().countryFill,
      WORLD_COUNTRY_HIGHLIGHT_OPACITY,
    )

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
    updateCountryHighlightOpacity(
      map,
      selectedTrip ? JOURNEY_COUNTRY_HIGHLIGHT_OPACITY : WORLD_COUNTRY_HIGHLIGHT_OPACITY,
    )
  }, [readyMap, countryBoundaryData, visitedCountryCodesKey, selectedTrip])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    ensureWorldPlaceLayers(map, worldPlaceData, mapThemeColors().worldPlaces, selectedTrip === null)

    return () => {
      if (mapRef.current === map) {
        removeWorldPlaceLayers(map)
      }
    }
  }, [readyMap])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    return bindWorldPlaceInteractions(map, onSelectPlace)
  }, [readyMap, onSelectPlace])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    updateWorldPlaceData(map, worldPlaceData)
  }, [readyMap, worldPlaceDataKey])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    updateWorldPlaceVisibility(map, selectedTrip === null)
  }, [readyMap, selectedTrip])

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

    const applyThemeColors = () => {
      const colors = mapThemeColors()
      updateCountryHighlightColor(map, colors.countryFill)
      updateTripRouteColor(map, selectedTrip ? colors.selectedRoute : null)
      updateWorldPlaceColors(map, colors.worldPlaces)
      if (basemapLayersRef.current) {
        applyBasemapPalette(map, basemapLayersRef.current, colors.basemap)
      }
    }
    applyThemeColors()
    const observer = new MutationObserver(applyThemeColors)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => observer.disconnect()
  }, [readyMap, selectedTrip])

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
    const markers = selectedMarkers
      .map((data): MapMarkerReference => ({
        data,
        marker: createSelectedMarker(data, tripNames).addTo(map),
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
  }, [readyMap, overview, selectedTrip?.id, tripNamesKey])

  useEffect(() => {
    const map = activeReadyMap(readyMap, mapRef.current)
    if (!map) {
      return
    }

    if (cameraTarget.kind === 'none') {
      updateWorldViewport(map, true)
      return
    }

    // Preserve the Journey target, while keeping manual zoom-out inside the atlas.
    updateWorldViewport(map, false)

    if (cameraTarget.kind === 'point') {
      map.flyTo(flatCameraOptions({ center: cameraTarget.coordinate, zoom: cameraTarget.zoom, essential: true }))
      return
    }

    const bounds = cameraTarget.coordinates.reduce(
      (currentBounds, coordinate) => currentBounds.extend(coordinate),
      new LngLatBounds(),
    )
    map.fitBounds(bounds, flatCameraOptions({ padding: 90, maxZoom: 6, duration: 700 }))
  }, [readyMap, cameraTargetKey, worldResetKey])

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
          ? `${selectedMarkers.length} ${selectedMarkers.length === 1 ? 'place' : 'places'} · ${visitedCountryCodes.length} ${visitedCountryCodes.length === 1 ? 'country' : 'countries'}`
          : `${worldPlaces.length} ${worldPlaces.length === 1 ? 'place' : 'places'} visited`}</p>
      </div>
      <div className="map-canvas" ref={mapElementRef} />
      {!selectedTrip && globalRoutesAvailable ? (
        <button
          className="map-route-toggle"
          type="button"
          aria-pressed={showGlobalRoutes}
          aria-describedby="world-map-hint"
          onClick={() => setShowGlobalRoutes((current) => !current)}
        >
          <span aria-hidden="true" className="map-route-toggle-mark" />
          Show routes
        </button>
      ) : null}
      {!selectedTrip && overview && overview.markers.length > 0 ? (
        <p className="map-hint" id="world-map-hint" role="status">
          {showGlobalRoutes
            ? 'Routes shown. Zoom in to trace nearby stops.'
            : 'Choose a journey to trace its story across the map.'}
        </p>
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

function createSelectedMarker(
  marker: DisplayMarker,
  tripNames: Map<string, string>,
): Marker {
  const element = document.createElement('button')
  element.className = 'map-marker is-itinerary is-selected'
  element.type = 'button'
  element.setAttribute('aria-label', selectedMarkerAriaLabel(marker, tripNames))
  element.textContent = marker.markerLabel ?? ''

  const mapMarker = new Marker({ element, anchor: 'center', offset: marker.pixelOffset })
    .setLngLat(marker.coordinate)

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

function selectedMarkerAriaLabel(
  marker: DisplayMarker,
  tripNames: Map<string, string>,
): string {
  const place = `${marker.cityName}, ${marker.country.name}`
  const visit = marker.visits[0]
  const tripName = visit ? tripNames.get(visit.tripId) : undefined
  return `${place}${tripName ? ` — ${tripName}` : ''}${visit ? `, stop ${visit.position}` : ''}`
}

function popupLine(text: string): HTMLSpanElement {
  const line = document.createElement('span')
  line.textContent = text
  return line
}

function updateWorldViewport(map: maplibregl.Map, moveCamera: boolean) {
  const container = map.getContainer()
  const camera = worldOverviewCamera(container.clientWidth, container.clientHeight)
  if (!camera) {
    return
  }

  map.setMinZoom(camera.zoom)
  if (moveCamera) {
    map.jumpTo(flatCameraOptions(camera))
  }
}
