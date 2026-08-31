import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from './api/client'
import { getPlaceDetails } from './api/places'
import { applyTheme, initializeTheme, persistTheme } from './appearance/theme'
import type { Theme } from './appearance/theme'
import {
  addStop,
  createTrip,
  deleteStop,
  deleteStopPhoto,
  deleteTrip,
  getMapOverview,
  getTrip,
  listTrips,
  moveStop,
  updateStopJournal,
  updateTrip,
  uploadStopPhoto,
} from './api/trips'
import { AppearanceControl } from './components/AppearanceControl'
import { Itinerary } from './components/Itinerary'
import { MemoryView } from './components/MemoryView'
import { PlaceDetailsPanel } from './components/PlaceDetailsPanel'
import { TripForm } from './components/TripForm'
import { TripList } from './components/TripList'
import { orderedMemoryPhotos, visitForTripStop } from './components/memoryPresentation'
import { MapView } from './features/map/MapView'
import type {
  City,
  CitySearchResult,
  PlaceDetails,
  PlaceVisit,
  StopJournalInput,
  Trip,
  TripDetailsInput,
  TripMapOverview,
  TripStop,
  TripStopPhoto,
  TripSummary,
} from './types/travel'

type TripFormMode = 'create' | 'edit' | null

interface AppProps {
  initialTheme?: Theme
}

const MOBILE_NAVIGATION_QUERY = '(max-width: 820px)'
const DRAWER_FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type AtlasView =
  | { kind: 'map' }
  | { kind: 'place'; cityId: string }
  | {
      kind: 'memory'
      cityId: string
      stopId: string
      tripId: string
      origin: 'place' | 'journey'
    }

export default function App({ initialTheme }: AppProps) {
  const [theme, setTheme] = useState<Theme>(() => initialTheme ?? initializeTheme())
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [overview, setOverview] = useState<TripMapOverview | null>(null)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null)
  const [atlasView, setAtlasView] = useState<AtlasView>({ kind: 'map' })
  const [worldResetKey, setWorldResetKey] = useState(0)
  const [placeDetails, setPlaceDetails] = useState<PlaceDetails | null>(null)
  const [isPlaceDetailsLoading, setIsPlaceDetailsLoading] = useState(false)
  const [placeDetailsError, setPlaceDetailsError] = useState<string | null>(null)
  const [placeDetailsRequestVersion, setPlaceDetailsRequestVersion] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [isMutating, setIsMutating] = useState(false)
  const [formMode, setFormMode] = useState<TripFormMode>(null)
  const [error, setError] = useState<string | null>(null)
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const navigationToggleRef = useRef<HTMLButtonElement>(null)
  const navigationCloseRef = useRef<HTMLButtonElement>(null)
  const contentAreaRef = useRef<HTMLDivElement>(null)
  const restoreNavigationFocusRef = useRef(false)
  const activeSelectedTrip = selectedTripId !== null && selectedTrip?.id === selectedTripId
    ? selectedTrip
    : null
  const selectedPlaceId = atlasView.kind === 'place'
    || (atlasView.kind === 'memory' && atlasView.origin === 'place')
    ? atlasView.cityId
    : null
  const activePlaceDetails = selectedPlaceId !== null && placeDetails?.city.id === selectedPlaceId
    ? placeDetails
    : null
  const activeMemory = memoryForView(atlasView, activePlaceDetails, activeSelectedTrip)

  useEffect(() => {
    void loadApplication()
  }, [])

  useEffect(() => {
    if (!isNavigationOpen) {
      if (restoreNavigationFocusRef.current) {
        restoreNavigationFocusRef.current = false
        navigationToggleRef.current?.focus()
      }
      return
    }

    if (typeof window.matchMedia !== 'function') {
      return
    }

    const mobileNavigation = window.matchMedia(MOBILE_NAVIGATION_QUERY)
    const navigation = navigationCloseRef.current?.closest<HTMLElement>('#journey-navigation') ?? null
    const background = contentAreaRef.current
    let pendingFocusTimeout: number | null = null

    function updateFocusIsolation() {
      if (mobileNavigation.matches) {
        if (navigation && !navigation.contains(document.activeElement)) {
          navigationCloseRef.current?.focus()
        }
        background?.setAttribute('inert', '')

        if (navigation) {
          if (pendingFocusTimeout !== null) {
            window.clearTimeout(pendingFocusTimeout)
          }
          pendingFocusTimeout = window.setTimeout(() => {
            pendingFocusTimeout = null
            if (mobileNavigation.matches && !navigation.contains(document.activeElement)) {
              navigationCloseRef.current?.focus()
            }
          }, 50)
        }
      } else {
        if (pendingFocusTimeout !== null) {
          window.clearTimeout(pendingFocusTimeout)
          pendingFocusTimeout = null
        }
        background?.removeAttribute('inert')
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (!mobileNavigation.matches) {
        return
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeNavigation({ restoreFocus: true })
        return
      }

      if (event.key !== 'Tab' || !navigation) {
        return
      }

      const focusableElements = drawerFocusableElements(navigation)
      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)
      if (!firstElement || !lastElement) {
        return
      }

      if (event.shiftKey && (document.activeElement === firstElement || !navigation.contains(document.activeElement))) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && (document.activeElement === lastElement || !navigation.contains(document.activeElement))) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    mobileNavigation.addEventListener('change', updateFocusIsolation)
    updateFocusIsolation()

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      mobileNavigation.removeEventListener('change', updateFocusIsolation)
      if (pendingFocusTimeout !== null) {
        window.clearTimeout(pendingFocusTimeout)
      }
      background?.removeAttribute('inert')
    }
  }, [isNavigationOpen])

  useEffect(() => {
    if (!selectedTripId) {
      setSelectedTrip(null)
      return
    }
    if (selectedTrip?.id === selectedTripId) {
      return
    }

    let cancelled = false
    getTrip(selectedTripId)
      .then((trip) => {
        if (!cancelled) {
          setSelectedTrip(trip)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(toErrorMessage(reason))
        }
      })
    return () => {
      cancelled = true
    }
  }, [selectedTrip, selectedTripId])

  useEffect(() => {
    if (!selectedPlaceId) {
      setPlaceDetails(null)
      setPlaceDetailsError(null)
      setIsPlaceDetailsLoading(false)
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setPlaceDetails(null)
    setPlaceDetailsError(null)
    setIsPlaceDetailsLoading(true)
    getPlaceDetails(selectedPlaceId, controller.signal)
      .then((details) => {
        if (!cancelled) {
          setPlaceDetails(details)
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled && !isAbortError(reason)) {
          setPlaceDetailsError(toErrorMessage(reason))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsPlaceDetailsLoading(false)
        }
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selectedPlaceId, placeDetailsRequestVersion])

  const handleOpenPlace = useCallback((cityId: string) => {
    setIsNavigationOpen(false)
    setAtlasView({ kind: 'place', cityId })
  }, [])

  function handleOpenPlaceMemory(visit: PlaceVisit) {
    if (!activePlaceDetails) {
      return
    }
    setAtlasView({
      kind: 'memory',
      cityId: activePlaceDetails.city.id,
      stopId: visit.stopId,
      tripId: visit.tripId,
      origin: 'place',
    })
  }

  function handleOpenJourneyMemory(stopId: string) {
    const stop = activeSelectedTrip?.stops.find((candidate) => candidate.id === stopId)
    if (!activeSelectedTrip || !stop) {
      return
    }
    setAtlasView({
      kind: 'memory',
      cityId: stop.city.id,
      stopId: stop.id,
      tripId: activeSelectedTrip.id,
      origin: 'journey',
    })
    setIsNavigationOpen(false)
  }

  async function loadApplication(preferredTripId?: string) {
    setIsLoading(true)
    try {
      const [nextTrips, nextOverview] = await Promise.all([listTrips(), getMapOverview()])
      setTrips(nextTrips)
      setOverview(nextOverview)
      setSelectedTripId((current) => {
        const candidate = preferredTripId ?? current
        return candidate && nextTrips.some((trip) => trip.id === candidate) ? candidate : (nextTrips[0]?.id ?? null)
      })
    } catch (reason) {
      setError(toErrorMessage(reason))
    } finally {
      setIsLoading(false)
    }
  }

  async function refreshSelectedTrip(tripId: string) {
    const [trip] = await Promise.all([getTrip(tripId), loadApplication(tripId)])
    setSelectedTrip(trip)
  }

  async function performMutation<T>(action: () => Promise<T>): Promise<T> {
    setIsMutating(true)
    setError(null)
    try {
      return await action()
    } catch (reason) {
      setError(toErrorMessage(reason))
      throw reason
    } finally {
      setIsMutating(false)
    }
  }

  async function handleCreate(input: TripDetailsInput) {
    const createdTrip = await performMutation(() => createTrip(input))
    setFormMode(null)
    setAtlasView({ kind: 'map' })
    setTrips((currentTrips) => [...currentTrips, toTripSummary(createdTrip)].sort(compareTripSummaries))
    setSelectedTripId(createdTrip.id)
    setSelectedTrip(createdTrip)
  }

  async function handleUpdate(input: TripDetailsInput) {
    if (!selectedTrip) {
      return
    }
    const updatedTrip = await performMutation(() => updateTrip(selectedTrip.id, input))
    if (!updatedTrip) {
      return
    }
    setFormMode(null)
    setSelectedTrip(updatedTrip)
    setTrips((currentTrips) => currentTrips.map((trip) => trip.id === updatedTrip.id
      ? {
          ...trip,
          name: updatedTrip.name,
          startDate: updatedTrip.startDate,
          endDate: updatedTrip.endDate,
          description: updatedTrip.description,
        }
      : trip))
  }

  async function handleDeleteTrip() {
    if (!selectedTrip || !window.confirm(`Delete “${selectedTrip.name}”? This cannot be undone.`)) {
      return
    }
    await performMutation(() => deleteTrip(selectedTrip.id))
    setFormMode(null)
    setSelectedTrip(null)
    await loadApplication()
  }

  async function handleAddStop(city: CitySearchResult) {
    if (!selectedTrip) {
      return
    }
    const tripId = selectedTrip.id
    const createdStop = await performMutation(() => addStop(tripId, {
      countryCode: city.countryCode,
      cityName: city.name,
      latitude: city.latitude,
      longitude: city.longitude,
    }))
    setSelectedTrip((currentTrip) => currentTrip?.id === tripId
      ? { ...currentTrip, stops: [...currentTrip.stops, createdStop].sort(compareStops) }
      : currentTrip)
    setTrips((currentTrips) => currentTrips.map((trip) => trip.id === tripId
      ? { ...trip, stopCount: trip.stopCount + 1 }
      : trip))
    setOverview((currentOverview) => appendStopToOverview(currentOverview, tripId, createdStop))
  }

  async function handleMoveStop(stopId: string, position: number) {
    if (!selectedTrip) {
      return
    }
    await performMutation(() => moveStop(selectedTrip.id, stopId, position))
    await refreshSelectedTrip(selectedTrip.id)
  }

  async function handleDeleteStop(stopId: string) {
    if (!selectedTrip) {
      return
    }
    await performMutation(() => deleteStop(selectedTrip.id, stopId))
    await refreshSelectedTrip(selectedTrip.id)
  }

  async function handleUpdateStopJournal(stopId: string, input: StopJournalInput) {
    if (!selectedTrip) {
      return
    }
    const updatedStop = await performMutation(() => updateStopJournal(selectedTrip.id, stopId, input))
    setSelectedTrip((currentTrip) => currentTrip?.id === selectedTrip.id
      ? {
          ...currentTrip,
          stops: replaceStop(currentTrip.stops, updatedStop),
        }
      : currentTrip)
  }

  async function handleUploadPhoto(stopId: string, file: File) {
    if (!selectedTrip) {
      return
    }
    const tripId = selectedTrip.id
    const createdPhoto = await performMutation(() => uploadStopPhoto(tripId, stopId, file))
    setSelectedTrip((currentTrip) => currentTrip?.id === tripId
      ? {
          ...currentTrip,
          stops: updateStopPhotos(currentTrip.stops, stopId, (photos) => [...photos, createdPhoto]),
        }
      : currentTrip)
  }

  async function handleDeletePhoto(stopId: string, photoId: string) {
    if (!selectedTrip) {
      return
    }
    const tripId = selectedTrip.id
    await performMutation(() => deleteStopPhoto(tripId, stopId, photoId))
    setSelectedTrip((currentTrip) => currentTrip?.id === tripId
      ? {
          ...currentTrip,
          stops: updateStopPhotos(
            currentTrip.stops,
            stopId,
            (photos) => photos
              .filter((photo) => photo.id !== photoId)
              .map((photo, index) => ({ ...photo, position: index + 1 })),
          ),
        }
      : currentTrip)
  }

  async function handleMemoryUpdateJournal(input: StopJournalInput) {
    const target = memoryMutationTarget(atlasView)
    if (!target) {
      return
    }

    const updatedStop = await performMutation(() => updateStopJournal(target.tripId, target.stopId, input))
    applyMemoryStopUpdate(target, updatedStop)
    await refreshOverview()
  }

  async function handleMemoryUploadPhoto(file: File) {
    const target = memoryMutationTarget(atlasView)
    if (!target) {
      return
    }

    const createdPhoto = await performMutation(() => uploadStopPhoto(target.tripId, target.stopId, file))
    applyMemoryPhotoUpdate(target, (photos) => orderedMemoryPhotos([...photos, createdPhoto]))
    await refreshOverview()
  }

  async function handleMemoryDeletePhoto(photoId: string) {
    const target = memoryMutationTarget(atlasView)
    if (!target) {
      return
    }

    await performMutation(() => deleteStopPhoto(target.tripId, target.stopId, photoId))
    applyMemoryPhotoUpdate(target, (photos) => photos
      .filter((photo) => photo.id !== photoId)
      .map((photo, index) => ({ ...photo, position: index + 1 })))
    await refreshOverview()
  }

  function applyMemoryStopUpdate(target: MemoryMutationTarget, updatedStop: TripStop) {
    setSelectedTrip((currentTrip) => currentTrip?.id === target.tripId
      ? { ...currentTrip, stops: replaceStop(currentTrip.stops, updatedStop) }
      : currentTrip)
    setPlaceDetails((currentDetails) => updatePlaceVisit(currentDetails, target, (visit) => ({
      ...visit,
      arrivalDate: updatedStop.arrivalDate,
      departureDate: updatedStop.departureDate,
      note: updatedStop.note,
      photos: orderedMemoryPhotos(updatedStop.photos),
    })))
  }

  function applyMemoryPhotoUpdate(
    target: MemoryMutationTarget,
    update: (photos: TripStopPhoto[]) => TripStopPhoto[],
  ) {
    setSelectedTrip((currentTrip) => currentTrip?.id === target.tripId
      ? { ...currentTrip, stops: updateStopPhotos(currentTrip.stops, target.stopId, update) }
      : currentTrip)
    setPlaceDetails((currentDetails) => updatePlaceVisit(currentDetails, target, (visit) => ({
      ...visit,
      photos: orderedMemoryPhotos(update(visit.photos)),
    })))
  }

  function handleSelectTrip(tripId: string) {
    const nextTripId = selectedTripId === tripId ? null : tripId
    setError(null)
    setAtlasView({ kind: 'map' })
    setFormMode(null)
    setSelectedTrip(null)
    setSelectedTripId(nextTripId)
    if (nextTripId === null) {
      void refreshOverview()
    }
  }

  function handleViewTrip(tripId: string) {
    setError(null)
    setAtlasView({ kind: 'map' })
    setFormMode(null)
    if (selectedTripId !== tripId) {
      setSelectedTrip(null)
    }
    setSelectedTripId(tripId)
    setIsNavigationOpen(true)
  }

  function handleMemoryBack() {
    if (atlasView.kind !== 'memory') {
      return
    }
    setAtlasView(atlasView.origin === 'place'
      ? { kind: 'place', cityId: atlasView.cityId }
      : { kind: 'map' })
  }

  function handleMemoryPlace() {
    if (atlasView.kind !== 'memory') {
      return
    }
    setError(null)
    setFormMode(null)
    setSelectedTrip(null)
    setSelectedTripId(null)
    setAtlasView({ kind: 'place', cityId: atlasView.cityId })
    void refreshOverview()
  }

  function handleMemoryJourney() {
    if (atlasView.kind !== 'memory') {
      return
    }
    handleViewTrip(atlasView.tripId)
  }

  function handleMemoryWorld() {
    setWorldResetKey((current) => current + 1)
    setError(null)
    setFormMode(null)
    setSelectedTrip(null)
    setSelectedTripId(null)
    setAtlasView({ kind: 'map' })
    setIsNavigationOpen(false)
    void refreshOverview()
  }

  function closeNavigation({ restoreFocus = false } = {}) {
    restoreNavigationFocusRef.current = restoreNavigationFocusRef.current || restoreFocus
    setIsNavigationOpen(false)
  }

  async function refreshOverview() {
    try {
      setOverview(await getMapOverview())
    } catch (reason) {
      setError(toErrorMessage(reason))
    }
  }

  function handleThemeChange(nextTheme: Theme) {
    applyTheme(nextTheme)
    persistTheme(nextTheme)
    setTheme(nextTheme)
  }

  return (
    <main className="application-shell">
      <div
        aria-hidden="true"
        className={`mobile-navigation-backdrop${isNavigationOpen ? ' is-open' : ''}`}
        onClick={() => closeNavigation({ restoreFocus: true })}
      />
      <aside
        aria-label="Journey navigation"
        className={`sidebar${isNavigationOpen ? ' is-open' : ''}`}
        id="journey-navigation"
      >
        <div className="sidebar-brand-row">
          <a className="brand" href="/" aria-label="WanderMap home">
            <span aria-hidden="true" className="brand-mark">W</span>
            <span className="brand-copy">
              <strong>WanderMap</strong>
              <small>Personal atlas</small>
            </span>
          </a>
          <button
            aria-label="Close journey navigation"
            className="sidebar-close"
            ref={navigationCloseRef}
            type="button"
            onClick={() => closeNavigation({ restoreFocus: true })}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <TripList
          isLoading={isLoading}
          overview={overview}
          selectedTripId={selectedTripId}
          trips={trips}
          onCreate={() => {
            setAtlasView({ kind: 'map' })
            setFormMode('create')
          }}
          onSelect={handleSelectTrip}
        />
        {formMode === 'create' ? (
          <section className="editor-panel" aria-label="Create a journey">
            <p className="eyebrow">Start a new story</p>
            <h2>New journey</h2>
            <TripForm
              isSubmitting={isMutating}
              submitLabel="Create journey"
              onCancel={() => setFormMode(null)}
              onSubmit={handleCreate}
            />
          </section>
        ) : null}
        {formMode === 'edit' && activeSelectedTrip ? (
          <section className="editor-panel" aria-label="Edit selected journey">
            <p className="eyebrow">Journey details</p>
            <h2>Edit journey</h2>
            <TripForm
              initialValue={activeSelectedTrip}
              isSubmitting={isMutating}
              submitLabel="Save changes"
              onCancel={() => setFormMode(null)}
              onSubmit={handleUpdate}
            />
          </section>
        ) : null}
        {!formMode && activeSelectedTrip ? (
          <>
            <Itinerary
              key={activeSelectedTrip.id}
              isMutating={isMutating}
              trip={activeSelectedTrip}
              onAddStop={handleAddStop}
              onDelete={handleDeleteStop}
              onMove={handleMoveStop}
              onUpdateJournal={handleUpdateStopJournal}
              onUploadPhoto={handleUploadPhoto}
              onDeletePhoto={handleDeletePhoto}
              onOpenMemory={handleOpenJourneyMemory}
            />
            <div className="trip-management-actions">
              <button className="button button-quiet" disabled={isMutating} type="button" onClick={() => setFormMode('edit')}>
                Edit journey
              </button>
              <button className="button button-danger" disabled={isMutating} type="button" onClick={() => void handleDeleteTrip()}>
                Delete journey
              </button>
            </div>
          </>
        ) : null}
        <AppearanceControl theme={theme} onChange={handleThemeChange} />
      </aside>
      <div className="content-area" ref={contentAreaRef}>
        {atlasView.kind !== 'memory' ? (
          <div className="mobile-map-controls" aria-label="Map navigation">
            <button
              aria-controls="journey-navigation"
              aria-expanded={isNavigationOpen}
              aria-label="Open journey navigation"
              className="mobile-map-button"
              ref={navigationToggleRef}
              type="button"
              onClick={() => setIsNavigationOpen(true)}
            >
              <span aria-hidden="true">☰</span>
              Journeys
            </button>
            {selectedTripId !== null || atlasView.kind !== 'map' ? (
              <button
                aria-label="Return to world map"
                className="mobile-map-button"
                type="button"
                onClick={handleMemoryWorld}
              >
                <span aria-hidden="true">←</span>
                World
              </button>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="error-banner" role="alert">
            <span>{error}</span>
            <button aria-label="Dismiss error" type="button" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        ) : null}
        <MapView
          worldResetKey={worldResetKey}
          overview={overview}
          selectedTrip={activeSelectedTrip}
          trips={trips}
          onSelectPlace={handleOpenPlace}
        />
        {selectedTripId === null && atlasView.kind === 'place' ? (
          <PlaceDetailsPanel
            details={activePlaceDetails}
            error={placeDetailsError}
            isLoading={isPlaceDetailsLoading}
            onClose={() => setAtlasView({ kind: 'map' })}
            onRetry={() => setPlaceDetailsRequestVersion((version) => version + 1)}
            onViewMemory={handleOpenPlaceMemory}
            onViewTrip={handleViewTrip}
          />
        ) : null}
        {atlasView.kind === 'memory' && activeMemory ? (
          <MemoryView
            key={`${atlasView.tripId}:${atlasView.stopId}`}
            city={activeMemory.city}
            isMutating={isMutating}
            origin={atlasView.origin}
            visit={activeMemory.visit}
            onBack={handleMemoryBack}
            onDeletePhoto={handleMemoryDeletePhoto}
            onJourney={handleMemoryJourney}
            onPlace={handleMemoryPlace}
            onUpdateJournal={handleMemoryUpdateJournal}
            onUploadPhoto={handleMemoryUploadPhoto}
            onWorld={handleMemoryWorld}
          />
        ) : null}
      </div>
    </main>
  )
}

function drawerFocusableElements(navigation: HTMLElement): HTMLElement[] {
  return [...navigation.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE_SELECTOR)]
}

function memoryForView(
  atlasView: AtlasView,
  placeDetails: PlaceDetails | null,
  selectedTrip: Trip | null,
): { city: City; visit: PlaceVisit } | null {
  if (atlasView.kind !== 'memory') {
    return null
  }

  if (atlasView.origin === 'place') {
    if (placeDetails?.city.id !== atlasView.cityId) {
      return null
    }
    const visit = placeDetails.visits.find((candidate) => candidate.stopId === atlasView.stopId)
    return visit ? { city: placeDetails.city, visit } : null
  }

  if (selectedTrip?.id !== atlasView.tripId) {
    return null
  }
  const stop = selectedTrip.stops.find((candidate) => candidate.id === atlasView.stopId)
  return stop ? { city: stop.city, visit: visitForTripStop(selectedTrip, stop) } : null
}

interface MemoryMutationTarget {
  tripId: string
  stopId: string
}

function memoryMutationTarget(atlasView: AtlasView): MemoryMutationTarget | null {
  return atlasView.kind === 'memory'
    ? { tripId: atlasView.tripId, stopId: atlasView.stopId }
    : null
}

function updatePlaceVisit(
  details: PlaceDetails | null,
  target: MemoryMutationTarget,
  update: (visit: PlaceVisit) => PlaceVisit,
): PlaceDetails | null {
  if (!details) {
    return details
  }

  return {
    ...details,
    visits: details.visits.map((visit) => visit.tripId === target.tripId && visit.stopId === target.stopId
      ? update(visit)
      : visit),
  }
}

function toErrorMessage(reason: unknown): string {
  if (reason instanceof ApiError) {
    return reason.code ? `${reason.message} (${reason.code})` : reason.message
  }
  return reason instanceof Error ? reason.message : 'Something went wrong. Please try again.'
}

function isAbortError(reason: unknown): boolean {
  return reason instanceof Error && reason.name === 'AbortError'
}

function toTripSummary(trip: Trip): TripSummary {
  return {
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate,
    endDate: trip.endDate,
    description: trip.description,
    stopCount: trip.stops.length,
  }
}

function compareTripSummaries(left: TripSummary, right: TripSummary): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
}

function compareStops(left: TripStop, right: TripStop): number {
  return left.position - right.position
}

function appendStopToOverview(
  currentOverview: TripMapOverview | null,
  tripId: string,
  stop: TripStop,
): TripMapOverview | null {
  if (!currentOverview) {
    return currentOverview
  }

  const visitedCountryCodes = [
    ...new Set([...currentOverview.visitedCountryCodes, stop.city.country.code]),
  ].sort()
  const latitude = stop.city.latitude
  const longitude = stop.city.longitude
  const markers = latitude === null || longitude === null
    ? currentOverview.markers
    : [...currentOverview.markers, {
        tripId,
        stopId: stop.id,
        cityId: stop.city.id,
        position: stop.position,
        cityName: stop.city.name,
        latitude,
        longitude,
        country: stop.city.country,
      }].sort((left, right) => left.tripId.localeCompare(right.tripId) || left.position - right.position)

  return {
    ...currentOverview,
    visitedCountryCodes,
    markers,
  }
}

function replaceStop(stops: TripStop[], updatedStop: TripStop): TripStop[] {
  return stops.map((stop) => stop.id === updatedStop.id ? updatedStop : stop)
}

function updateStopPhotos(
  stops: TripStop[],
  stopId: string,
  update: (photos: TripStopPhoto[]) => TripStopPhoto[],
): TripStop[] {
  return stops.map((stop) => stop.id === stopId
    ? { ...stop, photos: update(stop.photos ?? []).sort((left, right) => left.position - right.position) }
    : stop)
}
