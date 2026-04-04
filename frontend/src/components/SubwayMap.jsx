import { useRef, useState, useEffect, useCallback } from 'react'
import Map, { Source, Layer, Marker, NavigationControl, Popup } from 'react-map-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import styles from './SubwayMap.module.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const NYC_CENTER = { longitude: -73.9857, latitude: 40.7484 }
const LONG_PRESS_MS = 550

// ArcGIS endpoint (NYC OTI) — replaced the broken Socrata URL
const ARCGIS_BASE =
  'https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Subway_view/FeatureServer/0/query'
const ARCGIS_PARAMS = '?where=1%3D1&outFields=ROUTE&f=geojson&resultRecordCount=2000'


// Build a GeoJSON of real subway track segments that fall within the route's bounding box
// and belong to lines used in the route. This follows actual track geometry instead of
// straight lines between station coordinates.
export function routeSubwayGeoJSON(stations, subwayLines) {
  if (!stations || stations.length < 2 || !subwayLines) return null

  const lats = stations.map(s => s.lat).filter(Boolean)
  const lons = stations.map(s => s.lon).filter(Boolean)
  if (!lats.length || !lons.length) return null

  // Bounding box around the route stations with padding
  const pad = 0.018
  const minLat = Math.min(...lats) - pad
  const maxLat = Math.max(...lats) + pad
  const minLon = Math.min(...lons) - pad * 1.5
  const maxLon = Math.max(...lons) + pad * 1.5

  // All line letters/numbers used by stations in this route
  const routeLines = new Set(stations.flatMap(s => s.lines || []))

  const inBox = (coord) => {
    if (!Array.isArray(coord) || coord.length < 2) return false
    const [lon, lat] = coord
    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat
  }

  const geomOverlapsBox = (geom) => {
    if (!geom || !Array.isArray(geom.coordinates)) return false
    if (geom.type === 'LineString') return geom.coordinates.some(inBox)
    if (geom.type === 'MultiLineString') return geom.coordinates.some(ring => Array.isArray(ring) && ring.some(inBox))
    return false
  }

  const features = subwayLines.features.filter(f => {
    const sym = f.properties?.ROUTE
    return routeLines.has(sym) && geomOverlapsBox(f.geometry)
  })

  return features.length ? { type: 'FeatureCollection', features } : null
}

export function walkLineGeoJSON(from, to) {
  if (!from || !to) return null
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
      properties: {},
    }],
  }
}

export default function SubwayMap({
  userLocation, userStation, destination, destStation, route,
  onPinOrigin, onPinDestination,
}) {
  const mapRef = useRef(null)
  const [subwayLines, setSubwayLines] = useState(null)
  const [viewState, setViewState] = useState({ ...NYC_CENTER, zoom: 12, pitch: 0, bearing: 0 })

  // Long-press state
  const timerRef = useRef(null)
  const movedRef = useRef(false)
  const pressStartRef = useRef(null)  // {x, y} pixel position at press start
  const [ripple, setRipple] = useState(null)          // {lat, lon, x, y} – press-and-hold indicator
  const [droppedPin, setDroppedPin] = useState(null)  // {lat, lon} – confirmed pin with popup

  useEffect(() => {
    // Paginate through ArcGIS (max 2000/page) until all features are collected
    async function fetchAllLines() {
      const allFeatures = []
      let offset = 0
      while (true) {
        const res = await fetch(`${ARCGIS_BASE}${ARCGIS_PARAMS}&resultOffset=${offset}`)
        const data = await res.json()
        const features = data.features ?? []
        allFeatures.push(...features)
        if (features.length < 2000) break   // last page
        offset += 2000
      }
      setSubwayLines({ type: 'FeatureCollection', features: allFeatures })
    }
    fetchAllLines().catch(console.error)
  }, [])

  useEffect(() => {
    if (userLocation && mapRef.current) {
      mapRef.current.flyTo({ center: [userLocation.lon, userLocation.lat], zoom: 13.5, duration: 1400 })
    }
  }, [userLocation])

  useEffect(() => {
    if (route?.found && route.stations.length >= 2 && mapRef.current) {
      const lons = route.stations.map(s => s.lon).filter(v => typeof v === 'number' && isFinite(v))
      const lats = route.stations.map(s => s.lat).filter(v => typeof v === 'number' && isFinite(v))
      if (userLocation?.lon != null && isFinite(userLocation.lon)) { lons.push(userLocation.lon); lats.push(userLocation.lat) }
      if (destination?.lon  != null && isFinite(destination.lon))  { lons.push(destination.lon);  lats.push(destination.lat)  }
      if (lons.length < 2) return  // not enough valid coords to fit
      try {
        mapRef.current.fitBounds(
          [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
          { padding: 80, duration: 1400 }
        )
      } catch (e) { console.error('fitBounds failed:', e) }
    }
  }, [route])

  // ── Long-press detection ──────────────────────────────────────────────────

  const cancelPress = useCallback(() => {
    clearTimeout(timerRef.current)
    setRipple(null)
    movedRef.current = false
  }, [])

  const startPress = useCallback((lngLat, point) => {
    movedRef.current = false
    pressStartRef.current = point
    setRipple({ lat: lngLat.lat, lon: lngLat.lng, x: point.x, y: point.y })

    timerRef.current = setTimeout(() => {
      if (!movedRef.current) {
        setRipple(null)
        setDroppedPin({ lat: lngLat.lat, lon: lngLat.lng })
        // Haptic feedback on mobile
        if (navigator.vibrate) navigator.vibrate(40)
      }
    }, LONG_PRESS_MS)
  }, [])

  const checkMove = useCallback((point) => {
    if (!pressStartRef.current) return
    const dx = point.x - pressStartRef.current.x
    const dy = point.y - pressStartRef.current.y
    if (Math.sqrt(dx * dx + dy * dy) > 8) {
      movedRef.current = true
      cancelPress()
    }
  }, [cancelPress])

  const handleMouseDown = useCallback((e) => startPress(e.lngLat, e.point), [startPress])
  const handleMouseMove = useCallback((e) => checkMove(e.point), [checkMove])
  const handleMouseUp   = useCallback(cancelPress, [cancelPress])

  const handleTouchStart = useCallback((e) => {
    const t = e.originalEvent?.touches?.[0]
    if (t) startPress(e.lngLat, { x: t.clientX, y: t.clientY })
  }, [startPress])

  const handleTouchMove = useCallback((e) => {
    const t = e.originalEvent?.touches?.[0]
    if (t) checkMove({ x: t.clientX, y: t.clientY })
  }, [checkMove])

  const handleTouchEnd = useCallback(cancelPress, [cancelPress])

  // ── Pin popup actions ─────────────────────────────────────────────────────

  const handlePinOrigin = useCallback(() => {
    if (!droppedPin) return
    onPinOrigin({ lat: droppedPin.lat, lon: droppedPin.lng ?? droppedPin.lon, label: 'Pinned location' })
    setDroppedPin(null)
  }, [droppedPin, onPinOrigin])

  const handlePinDestination = useCallback(() => {
    if (!droppedPin) return
    onPinDestination({ lat: droppedPin.lat, lon: droppedPin.lng ?? droppedPin.lon, name: 'Pinned location', label: 'Pinned location' })
    setDroppedPin(null)
  }, [droppedPin, onPinDestination])

  // ── Render ────────────────────────────────────────────────────────────────

  let routeGeoJSON = null
  if (route?.found) {
    try { routeGeoJSON = routeSubwayGeoJSON(route.stations, subwayLines) }
    catch (e) { console.error('routeSubwayGeoJSON failed:', e) }
    // Fallback: straight lines between stations until real geometry loads
    if (!routeGeoJSON) {
      const coords = route.stations
        .filter(s => s.lon != null && s.lat != null)
        .map(s => [s.lon, s.lat])
      if (coords.length >= 2) {
        routeGeoJSON = {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} }],
        }
      }
    }
  }
  const userToStation  = walkLineGeoJSON(userLocation, userStation)
  const destToStation  = walkLineGeoJSON(destination, destStation)

  return (
    <div className={styles.mapWrapper}>
      {!MAPBOX_TOKEN && (
        <div className={styles.tokenWarning}>
          Add <code>VITE_MAPBOX_TOKEN</code> to <code>frontend/.env</code>
        </div>
      )}

      {/* Hold-to-pin hint */}
      <div className={styles.holdHint}>Hold to drop a pin</div>

      {/* Press-and-hold ripple (CSS positioned over the canvas) */}
      {ripple && (
        <div
          className={styles.rippleContainer}
          style={{ left: ripple.x, top: ripple.y }}
        >
          <div className={styles.rippleRing} />
          <div className={styles.rippleCore} />
        </div>
      )}

      <Map
        ref={mapRef}
        {...viewState}
        onMove={e => setViewState(e.viewState)}
        mapboxAccessToken={MAPBOX_TOKEN}
        style={{ width: '100%', height: '100%' }}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        dragPan={{ threshold: 10 }}
      >
        <NavigationControl position="top-right" />

        {/* Subway network background — ArcGIS track geometry, uniform dim color */}
        {subwayLines && (
          <Source id="subway-lines" type="geojson" data={subwayLines}>
            <Layer id="subway-lines-casing" type="line"
              paint={{ 'line-color': '#000', 'line-width': 4, 'line-opacity': 0.4 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer id="subway-lines-fill" type="line"
              paint={{
                'line-color': '#4a4f6a',
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 2.5],
                'line-opacity': 0.7,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </Source>
        )}

        {/* Walk lines */}
        {userToStation && (
          <Source id="walk-origin" type="geojson" data={userToStation}>
            <Layer id="walk-origin-line" type="line"
              paint={{ 'line-color': '#4f6ef7', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 }}
            />
          </Source>
        )}
        {destToStation && (
          <Source id="walk-dest" type="geojson" data={destToStation}>
            <Layer id="walk-dest-line" type="line"
              paint={{ 'line-color': '#f97316', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.8 }}
            />
          </Source>
        )}

        {/* Route — highlighted real subway track segments */}
        {routeGeoJSON && (
          <Source id="route" type="geojson" data={routeGeoJSON}>
            {/* Outer glow */}
            <Layer id="route-glow" type="line"
              paint={{ 'line-color': '#4f6ef7', 'line-width': 14, 'line-opacity': 0.18, 'line-blur': 6 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            {/* Dark casing for contrast */}
            <Layer id="route-casing" type="line"
              paint={{ 'line-color': '#0d1020', 'line-width': 9, 'line-opacity': 0.9 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            {/* Main route line */}
            <Layer id="route-line" type="line"
              paint={{ 'line-color': '#4f6ef7', 'line-width': 5, 'line-opacity': 1 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </Source>
        )}

        {/* User location */}
        {userLocation && (
          <Marker longitude={userLocation.lon} latitude={userLocation.lat} anchor="center">
            <div className={styles.userDot}>
              <div className={styles.userDotCore} />
              <div className={styles.userDotRing} />
            </div>
          </Marker>
        )}

        {/* Origin station ring */}
        {userStation?.lon && (
          <Marker longitude={userStation.lon} latitude={userStation.lat} anchor="center">
            <div className={styles.stationMarker} style={{ borderColor: '#4f6ef7' }} />
          </Marker>
        )}

        {/* Destination pin */}
        {destination?.lon && (
          <Marker longitude={destination.lon} latitude={destination.lat} anchor="bottom">
            <div className={styles.destPin} />
          </Marker>
        )}

        {/* Dest station ring */}
        {destStation?.lon && destStation.id !== userStation?.id && (
          <Marker longitude={destStation.lon} latitude={destStation.lat} anchor="center">
            <div className={styles.stationMarker} style={{ borderColor: '#f97316' }} />
          </Marker>
        )}

        {/* Dropped pin + popup */}
        {droppedPin && (
          <>
            <Marker longitude={droppedPin.lon} latitude={droppedPin.lat} anchor="bottom">
              <div className={styles.droppedPin} />
            </Marker>
            <Popup
              longitude={droppedPin.lon}
              latitude={droppedPin.lat}
              anchor="bottom"
              offset={36}
              closeButton={false}
              closeOnClick={false}
              className={styles.pinPopup}
            >
              <div className={styles.pinPopupContent}>
                <p className={styles.pinPopupTitle}>Pinned location</p>
                <div className={styles.pinPopupActions}>
                  <button className={`${styles.pinBtn} ${styles.pinBtnOrigin}`} onClick={handlePinOrigin}>
                    From here
                  </button>
                  <button className={`${styles.pinBtn} ${styles.pinBtnDest}`} onClick={handlePinDestination}>
                    Go here
                  </button>
                </div>
                <button className={styles.pinDismiss} onClick={() => setDroppedPin(null)}>
                  Dismiss
                </button>
              </div>
            </Popup>
          </>
        )}
      </Map>
    </div>
  )
}
