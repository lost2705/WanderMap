import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import { LngLatBounds, Marker, Popup } from 'maplibre-gl'
import type { Trip, TripMapOverview } from '../../types/travel'
import { countryCodesFromOverview, markersForMap, markersForTrip } from './mapData'

const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const COUNTRY_BOUNDARIES_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson'

interface MapViewProps {
  overview: TripMapOverview | null
  selectedTrip: Trip | null
}

export function MapView({ overview, selectedTrip }: MapViewProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markerRefs = useRef<Marker[]>([])
  const [isReady, setIsReady] = useState(false)
  const [mapFailure, setMapFailure] = useState<string | null>(null)

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) {
      return
    }

    try {
      const map = new maplibregl.Map({
        container: mapElementRef.current,
        style: MAP_STYLE_URL,
        center: [12, 28],
        zoom: 1.25,
      })
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
      map.once('load', () => {
        map.addSource('country-boundaries', { type: 'geojson', data: COUNTRY_BOUNDARIES_URL })
        map.addLayer({
          id: 'visited-countries-fill',
          type: 'fill',
          source: 'country-boundaries',
          paint: { 'fill-color': '#f5b544', 'fill-opacity': 0.32 },
        })
        map.addLayer({
          id: 'visited-countries-line',
          type: 'line',
          source: 'country-boundaries',
          paint: { 'line-color': '#c87b16', 'line-width': 1.25, 'line-opacity': 0.8 },
        })
        mapRef.current = map
        setIsReady(true)
      })
      map.on('error', () => {
        setMapFailure('The map base could not be loaded. Check your internet connection and try again.')
      })
      mapRef.current = map
    } catch {
      setMapFailure('The map could not be initialized in this browser.')
    }

    return () => {
      markerRefs.current.forEach((marker) => marker.remove())
      markerRefs.current = []
      mapRef.current?.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isReady) {
      return
    }

    const countryCodes = countryCodesFromOverview(overview)
    const countryFilter: maplibregl.FilterSpecification = countryCodes.length > 0
      ? ['in', 'ISO_A2_EH', ...countryCodes]
      : ['==', 'ISO_A2_EH', '']
    map.setFilter('visited-countries-fill', countryFilter)
    map.setFilter('visited-countries-line', countryFilter)

    markerRefs.current.forEach((marker) => marker.remove())
    markerRefs.current = markersForMap(overview, selectedTrip?.id ?? null).map((marker) => {
      const element = document.createElement('button')
      element.className = `map-marker${marker.isSelectedTrip ? ' is-selected' : ''}`
      element.type = 'button'
      element.setAttribute('aria-label', `${marker.cityName}, ${marker.country.name}`)
      const position = document.createElement('span')
      position.textContent = String(marker.position)
      element.append(position)

      const popupContent = document.createElement('div')
      const city = document.createElement('strong')
      city.textContent = marker.cityName
      const country = document.createElement('span')
      country.textContent = marker.country.name
      popupContent.append(city, country)

      return new Marker({ element, anchor: 'bottom' })
        .setLngLat([marker.longitude, marker.latitude])
        .setPopup(new Popup({ offset: 16 }).setDOMContent(popupContent))
        .addTo(map)
    })
  }, [isReady, overview, selectedTrip?.id])

  useEffect(() => {
    const map = mapRef.current
    const focusMarkers = markersForTrip(selectedTrip)
    if (!map || !isReady || focusMarkers.length === 0) {
      return
    }

    if (focusMarkers.length === 1) {
      const [marker] = focusMarkers
      map.flyTo({ center: [marker.longitude, marker.latitude], zoom: 6, essential: true })
      return
    }

    const bounds = focusMarkers.reduce(
      (currentBounds, marker) => currentBounds.extend([marker.longitude, marker.latitude]),
      new LngLatBounds(),
    )
    map.fitBounds(bounds, { padding: 90, maxZoom: 6, duration: 700 })
  }, [isReady, selectedTrip])

  return (
    <section className="map-panel" aria-label="Interactive travel map">
      <div className="map-caption">
        <div>
          <p className="eyebrow">A visual travel journal</p>
          <h1>See where your stories take you.</h1>
        </div>
        <p>{countryCodesFromOverview(overview).length} countries visited</p>
      </div>
      <div className="map-canvas" ref={mapElementRef} />
      {mapFailure ? <p className="map-error">{mapFailure}</p> : null}
      {!selectedTrip && overview && overview.markers.length > 0 ? (
        <p className="map-hint">Select a trip to focus its itinerary on the map.</p>
      ) : null}
    </section>
  )
}
