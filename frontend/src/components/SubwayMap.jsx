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
  onPinOrigin, onPinDestination, candidateLocations = [],
  theme, onThemeToggle
}) {
  const mapRef = useRef(null)
  const [subwayLines, setSubwayLines] = useState(null)
  const [viewState, setViewState] = useState({ ...NYC_CENTER, zoom: 13.5, pitch: 45, bearing: -10 })
  const [selectedCandidate, setSelectedCandidate] = useState(null)
  const [is3D, setIs3D] = useState(true)

  const toggle3D = useCallback(() => {
    const next = !is3D
    setIs3D(next)
    if (mapRef.current) {
      mapRef.current.easeTo({ pitch: next ? 45 : 0, bearing: next ? -10 : 0, duration: 600 })
    }
  }, [is3D])

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

  // Fit map to all candidate locations when they change
  useEffect(() => {
    if (!candidateLocations.length || !mapRef.current) return
    setSelectedCandidate(null)
    if (candidateLocations.length === 1) {
      mapRef.current.flyTo({ center: [candidateLocations[0].lon, candidateLocations[0].lat], zoom: 15, duration: 1000 })
      return
    }
    const lons = candidateLocations.map(c => c.lon).filter(isFinite)
    const lats = candidateLocations.map(c => c.lat).filter(isFinite)
    if (lons.length < 2) return
    try {
      mapRef.current.fitBounds(
        [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
        { padding: 80, duration: 1000, maxZoom: 15 }
      )
    } catch (e) { console.error('candidate fitBounds failed:', e) }
  }, [candidateLocations])

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
        mapStyle={theme === 'light' ? 'mapbox://styles/mapbox/light-v11' : 'mapbox://styles/mapbox/dark-v11'}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        dragPan={{ threshold: 10 }}
      >
        <NavigationControl position="top-right" />

        <button
          className={styles.themeToggle}
          onClick={onThemeToggle}
          title="Toggle Light/Dark Mode"
        >
          {theme === 'light' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          )}
        </button>

        <button
          className={styles.viewToggle}
          onClick={toggle3D}
          title={is3D ? 'Switch to 2D view' : 'Switch to 3D view'}
        >
          {is3D ? '2D' : '3D'}
        </button>

        {/* Sky atmosphere — visible when map is pitched */}
        <Layer
          id="sky"
          type="sky"
          paint={{
            'sky-type': 'atmosphere',
            'sky-atmosphere-sun': [0.0, 90.0],
            'sky-atmosphere-sun-intensity': 15,
            'sky-atmosphere-color': theme === 'light'
              ? 'rgba(186,210,235,1)'
              : 'rgba(12,14,28,1)',
          }}
        />

        {/* 3D buildings — real NYC building heights from Mapbox composite tileset.
            Placed first so it renders below subway overlay and route lines. */}
        <Layer
          id="3d-buildings"
          type="fill-extrusion"
          layout={{ visibility: is3D ? 'visible' : 'none' }}
          source="composite"
          source-layer="building"
          minzoom={14}
          filter={['==', 'extrude', 'true']}
          paint={{
            'fill-extrusion-color': theme === 'light'
              ? ['case',
                  ['>', ['get', 'height'], 100], '#b8c2cc',
                  '#c8d0d9',
                ]
              : ['case',
                  ['>', ['get', 'height'], 200], '#2a3050',
                  ['>', ['get', 'height'], 100], '#222640',
                  ['>', ['get', 'height'], 50],  '#1c2035',
                  '#171a2c',
                ],
            // Animate buildings rising from ground as zoom crosses 15
            'fill-extrusion-height': [
              'interpolate', ['linear'], ['zoom'],
              14, 0,
              14.2, ['get', 'height'],
            ],
            'fill-extrusion-base': [
              'interpolate', ['linear'], ['zoom'],
              14, 0,
              14.2, ['get', 'min_height'],
            ],
            'fill-extrusion-opacity': theme === 'light' ? 0.72 : 0.82,
            'fill-extrusion-ambient-occlusion-intensity': 0.4,
            'fill-extrusion-ambient-occlusion-radius': 3,
          }}
        />

        {/* Subway network background — ArcGIS track geometry, uniform dim color */}
        {subwayLines && (
          <Source id="subway-lines" type="geojson" data={subwayLines}>
            <Layer id="subway-lines-casing" type="line"
              paint={{ 'line-color': theme === 'light' ? '#fff' : '#000', 'line-width': 4, 'line-opacity': 0.4 }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
            <Layer id="subway-lines-fill" type="line"
              paint={{
                'line-color': theme === 'light' ? '#cbd5e1' : '#4a4f6a',
                'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 2.5],
                'line-opacity': 0.7,
              }}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            />
          </Source>
        )}

        {/* POI circles — zoom-gated, filterrank-capped, Apple Maps style
            filterrank 1 = landmark/famous · 2 = well-known · 3 = common
            zoom 15 → rank ≤ 1 only | zoom 16 → rank ≤ 2 | zoom 17 → rank ≤ 3
        */}
        <Source id="mapbox-pois" type="vector" url="mapbox://mapbox.mapbox-streets-v8">
          {/* Filled circle per category */}
          <Layer
            id="poi-circles"
            type="circle"
            source-layer="poi_label"
            minzoom={15}
            filter={['all',
              ['in', ['get', 'class'], ['literal', [
                'food_and_drink', 'arts_and_entertainment', 'hotel', 'park_like', 'education',
              ]]],
              ['<=', ['get', 'filterrank'],
                ['step', ['zoom'], 1, 16, 2, 17, 3]
              ],
            ]}
            paint={{
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 6, 18, 11],
              'circle-color': [
                'match', ['get', 'class'],
                'food_and_drink',         '#FF9500',
                'arts_and_entertainment', '#AF52DE',
                'hotel',                  '#5AC8FA',
                'park_like',              '#34C759',
                'education',              '#007AFF',
                '#8E8E93',
              ],
              'circle-stroke-width': 1.5,
              'circle-stroke-color': theme === 'light' ? '#fff' : 'rgba(255,255,255,0.85)',
              'circle-opacity':        ['interpolate', ['linear'], ['zoom'], 15, 0, 15.4, 0.92],
              'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.4, 0.92],
            }}
          />
          {/* Maki icon inside circle */}
          <Layer
            id="poi-icons"
            type="symbol"
            source-layer="poi_label"
            minzoom={15}
            filter={['all',
              ['in', ['get', 'class'], ['literal', [
                'food_and_drink', 'arts_and_entertainment', 'hotel', 'park_like', 'education',
              ]]],
              ['<=', ['get', 'filterrank'],
                ['step', ['zoom'], 1, 16, 2, 17, 3]
              ],
            ]}
            layout={{
              'icon-image': ['get', 'maki'],
              'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.45, 18, 0.75],
              'icon-allow-overlap': false,
              'icon-ignore-placement': false,
            }}
            paint={{
              'icon-color': '#fff',
              'icon-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 15.4, 1],
            }}
          />
          {/* Name label — fades in at zoom 16 */}
          <Layer
            id="poi-names"
            type="symbol"
            source-layer="poi_label"
            minzoom={16}
            filter={['all',
              ['in', ['get', 'class'], ['literal', [
                'food_and_drink', 'arts_and_entertainment', 'hotel', 'park_like', 'education',
              ]]],
              ['<=', ['get', 'filterrank'],
                ['step', ['zoom'], 1, 16, 2, 17, 3]
              ],
            ]}
            layout={{
              'text-field': ['get', 'name'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 16, 10, 18, 12],
              'text-offset': [0, 1.4],
              'text-anchor': 'top',
              'text-max-width': 8,
              'text-allow-overlap': false,
              'text-optional': true,
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
            }}
            paint={{
              'text-color': theme === 'light' ? '#111827' : '#e8eaf6',
              'text-halo-color': theme === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(15,17,23,0.85)',
              'text-halo-width': 1.5,
              'text-opacity': ['interpolate', ['linear'], ['zoom'], 16, 0, 16.4, 1],
            }}
          />
        </Source>

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
              paint={{ 'line-color': theme === 'light' ? '#fff' : '#0d1020', 'line-width': 9, 'line-opacity': 0.9 }}
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

        {/* Candidate location pins (shown during search) */}
        {candidateLocations.map(c => {
          const isSelected = selectedCandidate?.id === c.id
          return (
            <Marker
              key={c.id}
              longitude={c.lon}
              latitude={c.lat}
              anchor="bottom"
              onClick={e => { e.originalEvent.stopPropagation(); setSelectedCandidate(c) }}
            >
              <div className={`${styles.candidatePin} ${isSelected ? styles.candidatePinActive : ''}`} />
            </Marker>
          )
        })}

        {/* Candidate popup */}
        {selectedCandidate && (
          <Popup
            longitude={selectedCandidate.lon}
            latitude={selectedCandidate.lat}
            anchor="bottom"
            offset={36}
            closeButton={false}
            closeOnClick={false}
            className={styles.pinPopup}
          >
            <div className={styles.pinPopupContent}>
              <p className={styles.pinPopupTitle}>{selectedCandidate.name}</p>
              {selectedCandidate.fullAddress && (
                <p className={styles.candidateAddr}>{selectedCandidate.fullAddress}</p>
              )}
              <div className={styles.pinPopupActions}>
                <button
                  className={`${styles.pinBtn} ${styles.pinBtnDest}`}
                  onClick={() => {
                    onPinDestination({
                      lat: selectedCandidate.lat,
                      lon: selectedCandidate.lon,
                      name: selectedCandidate.fullAddress || selectedCandidate.name,
                      label: selectedCandidate.name,
                    })
                    setSelectedCandidate(null)
                  }}
                >
                  Go here
                </button>
              </div>
              <button className={styles.pinDismiss} onClick={() => setSelectedCandidate(null)}>
                Dismiss
              </button>
            </div>
          </Popup>
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
