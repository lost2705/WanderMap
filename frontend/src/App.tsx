import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentUser, login, logout, register } from './api/auth'
import type { CurrentUser, LoginInput, RegistrationInput } from './api/auth'
import {
  ApiError,
  getClientSessionGeneration,
  resetClientSession,
  setUnauthorizedHandler,
} from './api/client'
import { addBucketListItem, deleteBucketListItem, listBucketListItems } from './api/bucketList'
import { getPlaceDetails } from './api/places'
import { getTravelProfile } from './api/profile'
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
import { AuthScreen } from './components/AuthScreen'
import { BucketListSection } from './components/BucketListSection'
import { Itinerary } from './components/Itinerary'
import { MemoryView } from './components/MemoryView'
import { PlaceDetailsPanel } from './components/PlaceDetailsPanel'
import { TripForm } from './components/TripForm'
import { TripList } from './components/TripList'
import { TravelAssistantView } from './components/TravelAssistantView'
import { TravelProfileView } from './components/TravelProfileView'
import { WorldPlaceNavigation } from './components/WorldPlaceNavigation'
import { WorldTravelStatsBar } from './components/WorldTravelStatsBar'
import { orderedMemoryPhotos, visitForTripStop } from './components/memoryPresentation'
import { MapView } from './features/map/MapView'
import type {
  City,
  BucketListItem,
  CitySearchResult,
  PlaceDetails,
  PlaceVisit,
  StopJournalInput,
  Trip,
  TripDetailsInput,
  TripMapOverview,
  TravelProfile,
  TripStop,
  TripStopPhoto,
  TripSummary,
} from './types/travel'

type TripFormMode = 'create' | 'edit' | null
type FullScreenView = 'profile' | 'assistant' | null

interface AppProps {
  initialTheme?: Theme
}

interface AuthenticatedAppProps extends AppProps {
  currentUser?: CurrentUser
  logoutError?: string | null
  onLogout?: () => Promise<void>
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
const BUCKET_LIST_UNAVAILABLE_MESSAGE = 'Want to visit is temporarily unavailable.'
const LOGOUT_FAILED_MESSAGE = 'Sign out failed. Please try again.'
const TRAVEL_PROFILE_UNAVAILABLE_MESSAGE = 'Travel profile is temporarily unavailable.'

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
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [logoutError, setLogoutError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setUnauthorizedHandler((requestGeneration) => {
      if (!cancelled && requestGeneration === getClientSessionGeneration()) {
        resetClientSession()
        setLogoutError(null)
        setCurrentUser(null)
        setIsCheckingSession(false)
      }
    })
    getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCurrentUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCheckingSession(false)
        }
      })
    return () => {
      cancelled = true
      setUnauthorizedHandler(null)
    }
  }, [])

  async function handleLogin(input: LoginInput): Promise<CurrentUser> {
    const user = await login(input)
    resetClientSession()
    setLogoutError(null)
    setCurrentUser(user)
    return user
  }

  async function handleRegister(input: RegistrationInput): Promise<CurrentUser> {
    const user = await register(input)
    resetClientSession()
    setLogoutError(null)
    setCurrentUser(user)
    return user
  }

  async function handleLogout(): Promise<void> {
    setLogoutError(null)
    try {
      await logout()
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 401) {
        resetClientSession()
        setCurrentUser(null)
        return
      }
      setLogoutError(LOGOUT_FAILED_MESSAGE)
      return
    }
    resetClientSession()
    setCurrentUser(null)
  }

  if (isCheckingSession) {
    return (
      <main className="auth-shell auth-checking" aria-live="polite">
        <div className="auth-brand" role="status" aria-label="Restoring your WanderMap session">
          <span aria-hidden="true" className="brand-mark">W</span>
          <span className="brand-copy">
            <strong>WanderMap</strong>
            <small>Opening your atlas…</small>
          </span>
        </div>
      </main>
    )
  }

  if (!currentUser) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />
  }

  return (
    <AuthenticatedApp
      key={currentUser.id}
      currentUser={currentUser}
      initialTheme={initialTheme}
      logoutError={logoutError}
      onLogout={handleLogout}
    />
  )
}

export function AuthenticatedApp({ initialTheme, currentUser, logoutError, onLogout }: AuthenticatedAppProps) {
  const [theme, setTheme] = useState<Theme>(() => initialTheme ?? initializeTheme())
  const [trips, setTrips] = useState<TripSummary[]>([])
  const [overview, setOverview] = useState<TripMapOverview | null>(null)
  const [travelProfile, setTravelProfile] = useState<TravelProfile | null>(null)
  const [travelProfileLoadError, setTravelProfileLoadError] = useState<string | null>(null)
  const [isTravelProfileLoading, setIsTravelProfileLoading] = useState(true)
  const [bucketListItems, setBucketListItems] = useState<BucketListItem[]>([])
  const [bucketListLoadError, setBucketListLoadError] = useState<string | null>(null)
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
  const [isBucketListMutating, setIsBucketListMutating] = useState(false)
  const [formMode, setFormMode] = useState<TripFormMode>(null)
  const [error, setError] = useState<string | null>(null)
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const [fullScreenView, setFullScreenView] = useState<FullScreenView>(null)
  const navigationToggleRef = useRef<HTMLButtonElement>(null)
  const navigationCloseRef = useRef<HTMLButtonElement>(null)
  const placeDetailsCloseRef = useRef<HTMLButtonElement>(null)
  const profileTriggerRef = useRef<HTMLButtonElement>(null)
  const profileBackRef = useRef<HTMLButtonElement>(null)
  const assistantTriggerRef = useRef<HTMLButtonElement>(null)
  const assistantBackRef = useRef<HTMLButtonElement>(null)
  const applicationLoadVersionRef = useRef(0)
  const placeNavigationTriggerRef = useRef<HTMLElement | null>(null)
  const focusOpenedPlaceRef = useRef(false)
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
  const activeBucketListItem = activePlaceDetails
    ? bucketListItems.find((item) => item.city.id === activePlaceDetails.city.id) ?? null
    : null
  const showWorldTravelStats = selectedTripId === null
    && atlasView.kind === 'map'
    && travelProfile !== null
    && (travelProfile.journeyCount > 0 || travelProfile.visitCount > 0)

  useEffect(() => {
    if (atlasView.kind === 'place' && focusOpenedPlaceRef.current) {
      focusOpenedPlaceRef.current = false
      placeDetailsCloseRef.current?.focus()
    }
  }, [atlasView])

  useEffect(() => {
    void loadApplication()
  }, [])

  useEffect(() => {
    if (fullScreenView === 'profile') {
      profileBackRef.current?.focus()
    } else if (fullScreenView === 'assistant') {
      assistantBackRef.current?.focus()
    }
  }, [fullScreenView])

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

  function handleOpenPlaceFromNavigation(cityId: string) {
    placeNavigationTriggerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    focusOpenedPlaceRef.current = true
    handleOpenPlace(cityId)
  }

  function handleClosePlace() {
    setAtlasView({ kind: 'map' })
    const trigger = placeNavigationTriggerRef.current
    placeNavigationTriggerRef.current = null
    if (window.matchMedia?.(MOBILE_NAVIGATION_QUERY).matches) {
      navigationToggleRef.current?.focus()
    } else if (trigger?.isConnected) {
      trigger.focus()
    }
  }

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
    const loadVersion = applicationLoadVersionRef.current + 1
    applicationLoadVersionRef.current = loadVersion
    let coreSucceeded = false
    setIsLoading(true)
    setIsTravelProfileLoading(true)
    setTravelProfileLoadError(null)
    setBucketListLoadError(null)
    const optionalWorldData = Promise.allSettled([
      getTravelProfile(),
      listBucketListItems(),
    ] as const)
    let settledOptionalWorldData: Awaited<typeof optionalWorldData> | null = null

    function applyOptionalWorldData([profileResult, bucketListResult]: Awaited<typeof optionalWorldData>) {
      if (!coreSucceeded || applicationLoadVersionRef.current !== loadVersion) {
        return
      }
      if (profileResult.status === 'fulfilled') {
        setTravelProfile(profileResult.value)
        setTravelProfileLoadError(null)
      } else {
        setTravelProfile(null)
        setTravelProfileLoadError(TRAVEL_PROFILE_UNAVAILABLE_MESSAGE)
      }
      setIsTravelProfileLoading(false)
      if (bucketListResult.status === 'fulfilled') {
        setBucketListItems(bucketListResult.value)
        setBucketListLoadError(null)
      } else {
        setBucketListItems([])
        setBucketListLoadError(BUCKET_LIST_UNAVAILABLE_MESSAGE)
      }
    }

    void optionalWorldData.then((result) => {
      settledOptionalWorldData = result
      applyOptionalWorldData(result)
    })
    try {
      const [nextTrips, nextOverview] = await Promise.all([
        listTrips(),
        getMapOverview(),
      ])
      if (applicationLoadVersionRef.current !== loadVersion) {
        return
      }
      coreSucceeded = true
      setTrips(nextTrips)
      setOverview(nextOverview)
      setTravelProfile(null)
      setBucketListItems([])
      setSelectedTripId((current) => {
        const candidate = preferredTripId ?? current
        return candidate && nextTrips.some((trip) => trip.id === candidate) ? candidate : (nextTrips[0]?.id ?? null)
      })
      if (settledOptionalWorldData) {
        applyOptionalWorldData(settledOptionalWorldData)
      }
    } catch (reason) {
      coreSucceeded = false
      if (applicationLoadVersionRef.current === loadVersion) {
        setTravelProfile(null)
        setTravelProfileLoadError(null)
        setIsTravelProfileLoading(false)
        setBucketListItems([])
        setError(toErrorMessage(reason))
      }
    } finally {
      if (applicationLoadVersionRef.current === loadVersion) {
        setIsLoading(false)
        if (!coreSucceeded) {
          setIsTravelProfileLoading(false)
        }
      }
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
    await refreshTravelProfile()
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
    await refreshTravelProfile()
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
    setBucketListItems((current) => current.map((item) => item.city.id === createdStop.city.id
      ? { ...item, visited: true }
      : item))
    await refreshTravelProfile()
  }

  async function handleAddBucketListItem(city: CitySearchResult): Promise<BucketListItem> {
    setIsBucketListMutating(true)
    try {
      const created = await addBucketListItem({
        countryCode: city.countryCode,
        cityName: city.name,
        latitude: city.latitude,
        longitude: city.longitude,
      })
      setBucketListItems((current) => [...current, created].sort(compareBucketListItems))
      setBucketListLoadError(null)
      return created
    } finally {
      setIsBucketListMutating(false)
    }
  }

  async function handleRemoveBucketListItem(itemId: string): Promise<void> {
    setIsBucketListMutating(true)
    try {
      await deleteBucketListItem(itemId)
      setBucketListItems((current) => current.filter((item) => item.id !== itemId))
      setBucketListLoadError(null)
    } finally {
      setIsBucketListMutating(false)
    }
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
    await refreshTravelProfile()
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
    await refreshTravelProfile()
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
    await refreshTravelProfile()
  }

  async function handleMemoryUpdateJournal(input: StopJournalInput) {
    const target = memoryMutationTarget(atlasView)
    if (!target) {
      return
    }

    const updatedStop = await performMutation(() => updateStopJournal(target.tripId, target.stopId, input))
    applyMemoryStopUpdate(target, updatedStop)
    await Promise.all([refreshOverview(), refreshTravelProfile()])
  }

  async function handleMemoryUploadPhoto(file: File) {
    const target = memoryMutationTarget(atlasView)
    if (!target) {
      return
    }

    const createdPhoto = await performMutation(() => uploadStopPhoto(target.tripId, target.stopId, file))
    applyMemoryPhotoUpdate(target, (photos) => orderedMemoryPhotos([...photos, createdPhoto]))
    await Promise.all([refreshOverview(), refreshTravelProfile()])
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
    await Promise.all([refreshOverview(), refreshTravelProfile()])
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

  async function refreshTravelProfile() {
    setIsTravelProfileLoading(true)
    setTravelProfileLoadError(null)
    try {
      setTravelProfile(await getTravelProfile())
    } catch {
      setTravelProfile(null)
      setTravelProfileLoadError(TRAVEL_PROFILE_UNAVAILABLE_MESSAGE)
    } finally {
      setIsTravelProfileLoading(false)
    }
  }

  function handleOpenProfile() {
    setIsNavigationOpen(false)
    setFullScreenView('profile')
  }

  function handleCloseProfile() {
    closeFullScreenView(profileTriggerRef)
  }

  function handleOpenAssistant() {
    setIsNavigationOpen(false)
    setFullScreenView('assistant')
  }

  function handleCloseAssistant() {
    closeFullScreenView(assistantTriggerRef)
  }

  function closeFullScreenView(triggerRef: { current: HTMLButtonElement | null }) {
    setFullScreenView(null)
    window.requestAnimationFrame(() => {
      if (window.matchMedia?.(MOBILE_NAVIGATION_QUERY).matches) {
        navigationToggleRef.current?.focus()
      } else {
        triggerRef.current?.focus()
      }
    })
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
        inert={fullScreenView !== null}
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
        >
          <>
            <WorldPlaceNavigation overview={overview} onSelectPlace={handleOpenPlaceFromNavigation} />
            <BucketListSection
              isMutating={isBucketListMutating}
              items={bucketListItems}
              loadError={bucketListLoadError}
              onAdd={handleAddBucketListItem}
              onSelectPlace={handleOpenPlaceFromNavigation}
            />
          </>
        </TripList>
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
        {currentUser && onLogout ? (
          <div className="account-control">
            <span className="account-identity">
              <strong>{currentUser.displayName}</strong>
              <small>{currentUser.email}</small>
            </span>
            <span className="account-actions">
              <button
                className="button button-quiet"
                ref={assistantTriggerRef}
                type="button"
                onClick={handleOpenAssistant}
              >
                Travel Assistant
              </button>
              <button
                className="button button-quiet"
                ref={profileTriggerRef}
                type="button"
                onClick={handleOpenProfile}
              >
                View profile
              </button>
              <button className="button button-quiet" type="button" onClick={() => void onLogout()}>
                Sign out
              </button>
            </span>
            {logoutError ? <p className="account-control-error" role="alert">{logoutError}</p> : null}
          </div>
        ) : null}
      </aside>
      <div
        className={`content-area${showWorldTravelStats ? ' has-world-stats' : ''}`}
        inert={fullScreenView !== null}
        ref={contentAreaRef}
      >
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
          bucketListItems={bucketListItems}
          worldResetKey={worldResetKey}
          overview={overview}
          selectedTrip={activeSelectedTrip}
          trips={trips}
          onSelectPlace={handleOpenPlace}
        />
        {showWorldTravelStats ? (
          <WorldTravelStatsBar profile={travelProfile} />
        ) : null}
        {selectedTripId === null && atlasView.kind === 'place' ? (
          <PlaceDetailsPanel
            bucketListItem={activeBucketListItem}
            closeButtonRef={placeDetailsCloseRef}
            details={activePlaceDetails}
            error={placeDetailsError}
            isLoading={isPlaceDetailsLoading}
            isBucketListMutating={isBucketListMutating}
            onClose={handleClosePlace}
            onRemoveFromBucketList={handleRemoveBucketListItem}
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
      {fullScreenView === 'profile' && currentUser ? (
        <TravelProfileView
          backButtonRef={profileBackRef}
          error={travelProfileLoadError}
          isLoading={isTravelProfileLoading}
          profile={travelProfile}
          user={currentUser}
          onBack={handleCloseProfile}
          onRetry={() => void refreshTravelProfile()}
        />
      ) : null}
      {fullScreenView === 'assistant' && currentUser ? (
        <TravelAssistantView backButtonRef={assistantBackRef} onBack={handleCloseAssistant} />
      ) : null}
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

function compareBucketListItems(left: BucketListItem, right: BucketListItem): number {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
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
