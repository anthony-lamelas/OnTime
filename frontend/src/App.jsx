import { useState, useEffect, useCallback } from 'react'
import SubwayMap from './components/SubwayMap'
import TripPlanner from './components/TripPlanner'
import styles from './App.module.css'

export default function App() {
  // Origin: { lat, lon, label } — either from GPS or user-typed
  const [origin, setOrigin] = useState(null)
  const [locError, setLocError] = useState(null)
  const [locating, setLocating] = useState(false)

  // Destination: { lat, lon, name }
  const [destination, setDestination] = useState(null)

  // Plan result from backend
  const [plan, setPlan] = useState(null)   // PlanOut
  const [planning, setPlanning] = useState(false)

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

  // When both origin + destination are set, fetch plan from backend
  useEffect(() => {
    if (!origin || !destination) return
    setPlanning(true)
    setPlan(null)
    fetch('/api/subway/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin_lat: origin.lat,
        origin_lon: origin.lon,
        dest_lat: destination.lat,
        dest_lon: destination.lon,
      }),
    })
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() })
      .then(setPlan)
      .catch(console.error)
      .finally(() => setPlanning(false))
  }, [origin, destination])

  const handleOriginChange = useCallback((loc) => {
    setOrigin(loc)
    setPlan(null)
  }, [])

  const handleDestChange = useCallback((dest) => {
    setDestination(dest)
    setPlan(null)
  }, [])

  const handleReset = useCallback(() => {
    setDestination(null)
    setPlan(null)
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
      />
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
