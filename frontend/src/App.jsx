import { useState, useEffect, useCallback } from 'react'
import SubwayMap from './components/SubwayMap'
import TripPlanner from './components/TripPlanner'
import FavoritesPanel from './components/FavoritesPanel'
import PlannedTripsPanel from './components/PlannedTripsPanel'
import LoginPanel from './components/LoginPanel'
import styles from './App.module.css'

export default function App() {
  const [currentView, setCurrentView] = useState('home')
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  // Origin: { lat, lon, label } — either from GPS or user-typed
  const [origin, setOrigin] = useState(null)
  const [locError, setLocError] = useState(null)
  const [locating, setLocating] = useState(false)

  // Destination: { lat, lon, name }
  const [destination, setDestination] = useState(null)

  // Plan result from backend
  const [plan, setPlan] = useState(null)   // PlanOut
  const [planning, setPlanning] = useState(false)

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
      .then(setPlan)
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
  }, [])

  const handleDestChange = useCallback((dest) => {
    setDestination(dest)
    setPlan(null)
    setSelectedLine(null)
  }, [])

  const handleReset = useCallback(() => {
    setDestination(null)
    setPlan(null)
    setSelectedLine(null)
  }, [])

  // Toggle: clicking the same line again deselects (reverts to auto-route)
  const handleLineSelect = useCallback((line) => {
    setSelectedLine(prev => prev === line ? null : line)
  }, [])

  // Map long-press: pinned location → set as origin or destination
  const handlePinOrigin = useCallback((loc) => {
    handleOriginChange(loc)
  }, [handleOriginChange])

  const handlePinDestination = useCallback((loc) => {
    handleDestChange(loc)
  }, [handleDestChange])

  return (
    <div className={styles.layout}>
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
        />
      )}
      {currentView === 'favorites' && (
        <FavoritesPanel
          setView={setCurrentView}
          isLoggedIn={isLoggedIn}
          setIsLoggedIn={setIsLoggedIn}
          onSelectRoute={(orig, dest) => {
            setOrigin(orig)
            setDestination(dest)
          }}
          onSelectLocation={(loc) => {
            setDestination(loc)
          }}
        />
      )}
      {currentView === 'plannedTrips' && (
        <PlannedTripsPanel
          setView={setCurrentView}
          isLoggedIn={isLoggedIn}
          setIsLoggedIn={setIsLoggedIn}
          onSelectRoute={(orig, dest) => {
            setOrigin(orig)
            setDestination(dest)
          }}
        />
      )}
      {currentView === 'login' && (
        <LoginPanel
          setView={setCurrentView}
          isLoggedIn={isLoggedIn}
          setIsLoggedIn={setIsLoggedIn}
        />
      )}
      <SubwayMap
        userLocation={origin}
        userStation={plan?.origin_station}
        destination={destination}
        destStation={plan?.dest_station}
        route={plan?.route}
        onPinOrigin={handlePinOrigin}
        onPinDestination={handlePinDestination}
      />
    </div>
  )
}
