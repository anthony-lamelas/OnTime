import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import SubwayMap from './components/SubwayMap'
import TripPlanner from './components/TripPlanner'
import FavoritesPanel from './components/FavoritesPanel'
import PlannedTripsPanel from './components/PlannedTripsPanel'
import LoginPanel from './components/LoginPanel'
import styles from './App.module.css'

export default function App() {
  const [currentView, setCurrentView] = useState('home')
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem('token'))
  const [theme, setTheme] = useState('dark')
  const [sidebarWidth, setSidebarWidth] = useState(340)
  const dragging = useRef(false)

  // Mobile detection
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Bottom sheet state (mobile only)
  const PEEK = 88
  const snapPoints = useMemo(() => [PEEK, Math.round(window.innerHeight * 0.55), window.innerHeight], [])
  const [sheetHeight, setSheetHeight] = useState(PEEK)
  const [isSheetDragging, setIsSheetDragging] = useState(false)
  const sheetDragRef = useRef(null)
  const destInputRef = useRef(null)

  const snapTo = useCallback((height) => {
    const closest = snapPoints.reduce((a, b) => Math.abs(b - height) < Math.abs(a - height) ? b : a)
    setSheetHeight(closest)
  }, [snapPoints])

  const handleSheetDragStart = useCallback((e) => {
    setIsSheetDragging(true)
    sheetDragRef.current = { startY: e.touches[0].clientY, startHeight: sheetHeight }
  }, [sheetHeight])

  const handleSheetDragMove = useCallback((e) => {
    if (!sheetDragRef.current) return
    const dy = sheetDragRef.current.startY - e.touches[0].clientY
    const next = Math.max(80, Math.min(window.innerHeight, sheetDragRef.current.startHeight + dy))
    setSheetHeight(next)
  }, [])

  const handleSheetDragEnd = useCallback(() => {
    setIsSheetDragging(false)
    if (!sheetDragRef.current) return
    snapTo(sheetHeight)
    sheetDragRef.current = null
  }, [sheetHeight, snapTo])

  const handleResizeStart = useCallback((e) => {
    dragging.current = true
    e.preventDefault()
    const onMove = (e) => {
      if (!dragging.current) return
      setSidebarWidth(Math.min(Math.max(e.clientX, 220), 640))
    }
    const onUp = () => {
      dragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Origin: { lat, lon, label } — either from GPS or user-typed
  const [origin, setOrigin] = useState(null)
  const [locError, setLocError] = useState(null)
  const [locating, setLocating] = useState(false)

  // Destination: { lat, lon, name }
  const [destination, setDestination] = useState(null)

  // Candidate locations shown as map pins during search
  const [candidateLocations, setCandidateLocations] = useState([])

  // Plan result from backend
  const [plan, setPlan] = useState(null)
  const [planning, setPlanning] = useState(false)
  const [allRoutes, setAllRoutes] = useState([])   // all ranked route options

  // Selected line at origin station (null = auto-pick fastest)
  const [selectedLine, setSelectedLine] = useState(null)

  // Request GPS location
  const requestGPS = useCallback(() => {
    if (!navigator.geolocation) {
      setLocError('Geolocation not supported.')
      return
    }
    setLocating(true)
    setLocError(null)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLocating(false)
        setOrigin({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Your location' })
      },
      () => {
        setLocating(false)
        setLocError('Location access denied.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  // Auto-request GPS on mount
  useEffect(() => { requestGPS() }, [])

  // Fetch plan whenever origin, destination, or selectedLine changes
  useEffect(() => {
    if (!origin || !destination) return
    setPlanning(true)
    setPlan(null)
    setAllRoutes([])
    const body = {
      origin_lat: origin.lat,
      origin_lon: origin.lon,
      dest_lat: destination.lat,
      dest_lon: destination.lon,
    }
    if (selectedLine) body.preferred_line = selectedLine
    fetch('/api/subway/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() })
      .then(data => {
        if (!data.routes?.length) {
          setPlan({ route: { found: false } })
          return
        }
        setPlan(data.routes[0])       // top-ranked route drives the map
        setAllRoutes(data.routes)     // all routes for the sidebar
      })
      .catch((e) => {
        console.error(e)
        setPlan({ route: { found: false } })
      })
      .finally(() => setPlanning(false))
  }, [origin, destination, selectedLine])

  const handleOriginChange = useCallback((loc) => {
    setOrigin(loc)
    setPlan(null)
    setSelectedLine(null)
    setAllRoutes([])
  }, [])

  const handleDestChange = useCallback((dest) => {
    setDestination(dest)
    setPlan(null)
    setSelectedLine(null)
    setCandidateLocations([])
    setAllRoutes([])
  }, [])

  const handleReset = useCallback(() => {
    setDestination(null)
    setPlan(null)
    setSelectedLine(null)
    setCandidateLocations([])
    setAllRoutes([])
  }, [])

  // Toggle: clicking the same line again deselects (reverts to auto-route)
  const handleLineSelect = useCallback((line) => {
    setSelectedLine(prev => prev === line ? null : line)
  }, [])

  // Selecting a ranked route option swaps the active plan
  const handlePlanSelect = useCallback((route) => {
    setPlan(route)
    setSelectedLine(null)
  }, [])

  // Map long-press: pinned location → set as origin or destination
  const handlePinOrigin = useCallback((loc) => {
    handleOriginChange(loc)
  }, [handleOriginChange])

  const handlePinDestination = useCallback((loc) => {
    handleDestChange(loc)
  }, [handleDestChange])

  // On mobile, snap sheet up when a destination is selected so trip info is visible
  useEffect(() => {
    if (isMobile && destination) {
      snapTo(snapPoints[1])
    }
  }, [destination])

  // Reset GPS and routing on view switch
  useEffect(() => {
    if (currentView === 'favorites' || currentView === 'plannedTrips') {
      requestGPS()
      setDestination(null)
      setSelectedLine(null)
      setPlan(null)
      setAllRoutes([])
    }
  }, [currentView, requestGPS])

  const activePrimaryLine = plan?.lines?.[0] ?? null

  // Shared panel content rendered in both mobile and desktop
  const panelContent = (
    <>
      {currentView === 'home' && (
        <TripPlanner
          origin={origin}
          locating={locating}
          locError={locError}
          destination={destination}
          plan={plan}
          planning={planning}
          onOriginChange={handleOriginChange}
          onDestChange={handleDestChange}
          onRequestGPS={requestGPS}
          onReset={handleReset}
          isLoggedIn={isLoggedIn}
          setIsLoggedIn={setIsLoggedIn}
          setView={setCurrentView}
          selectedLine={selectedLine}
          onLineSelect={handleLineSelect}
          onCandidatesChange={setCandidateLocations}
          destInputRef={destInputRef}
          allRoutes={allRoutes}
          onPlanSelect={handlePlanSelect}
        />
      )}
      {currentView === 'favorites' && (
        <FavoritesPanel
          setView={setCurrentView}
          isLoggedIn={isLoggedIn}
          setIsLoggedIn={setIsLoggedIn}
          onSelectRoute={(orig, dest) => { setOrigin(orig); setDestination(dest) }}
          onSelectLocation={(loc) => { setDestination(loc) }}
        />
      )}
      {currentView === 'plannedTrips' && (
        <PlannedTripsPanel
          setView={setCurrentView}
          isLoggedIn={isLoggedIn}
          setIsLoggedIn={setIsLoggedIn}
          onSelectRoute={(orig, dest) => { setOrigin(orig); setDestination(dest) }}
        />
      )}
      {currentView === 'login' && (
        <LoginPanel
          setView={setCurrentView}
          isLoggedIn={isLoggedIn}
          setIsLoggedIn={setIsLoggedIn}
        />
      )}
    </>
  )

  const mapEl = (
    <SubwayMap
      userLocation={origin}
      userStation={plan?.origin_station}
      destination={destination}
      destStation={plan?.dest_station}
      route={plan?.route}
      onPinOrigin={handlePinOrigin}
      onPinDestination={handlePinDestination}
      candidateLocations={candidateLocations}
      theme={theme}
      onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
      selectedLine={selectedLine ?? activePrimaryLine}
      lineDepartures={plan?.travel_time?.line_departures}
    />
  )

  if (isMobile) {
    const isPeeked = sheetHeight <= PEEK + 20
    return (
      <div className={styles.mobileLayout}>
        <div className={styles.mobileMapWrapper}>{mapEl}</div>

        {/* Tap-to-dismiss overlay — visible map area above the sheet when expanded */}
        {!isPeeked && (
          <div
            className={styles.mapTapOverlay}
            style={{ bottom: sheetHeight }}
            onClick={() => snapTo(PEEK)}
          />
        )}

        {/* Bottom sheet */}
        <div
          className={styles.mobileSheet}
          style={{
            height: sheetHeight,
            transition: isSheetDragging ? 'none' : 'height 0.3s cubic-bezier(0.34, 1.2, 0.64, 1)',
          }}
        >
          {/* Drag handle — always draggable */}
          <div
            className={styles.sheetHandleBar}
            onTouchStart={handleSheetDragStart}
            onTouchMove={handleSheetDragMove}
            onTouchEnd={handleSheetDragEnd}
          >
            <div className={styles.sheetPill} />
          </div>

          {isPeeked ? (
            /* Compact Apple Maps-style search pill */
            <button
              className={styles.mobileSearchPill}
              onClick={() => {
                snapTo(snapPoints[1])
                setTimeout(() => destInputRef.current?.focus(), 320)
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <span>Search OnTime</span>
            </button>
          ) : (
            <div className={styles.sheetContent}>
              {panelContent}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.layout}>
      <div className={styles.sidebar} style={{ width: sidebarWidth }}>
        {panelContent}
      </div>
      <div className={styles.resizeHandle} onMouseDown={handleResizeStart}>
        <div className={styles.resizeBar} />
      </div>
      {mapEl}
    </div>
  )
}