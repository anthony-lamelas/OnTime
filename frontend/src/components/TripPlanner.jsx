import { useState, useRef, useCallback } from 'react'
import styles from './TripPlanner.module.css'
import SidebarNav from './SidebarNav'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const LINE_COLORS = {
  '1': '#EE352E', '2': '#EE352E', '3': '#EE352E',
  '4': '#00933C', '5': '#00933C', '6': '#00933C',
  '7': '#B933AD',
  'A': '#0039A6', 'C': '#0039A6', 'E': '#0039A6',
  'B': '#FF6319', 'D': '#FF6319', 'F': '#FF6319', 'M': '#FF6319',
  'G': '#6CBE45', 'J': '#996633', 'Z': '#996633',
  'L': '#A7A9AC',
  'N': '#FCCC0A', 'Q': '#FCCC0A', 'R': '#FCCC0A', 'W': '#FCCC0A',
  'S': '#808183',
}

function LineBadge({ line }) {
  const bg = LINE_COLORS[line] || '#666'
  const color = bg === '#FCCC0A' ? '#000' : '#fff'
  return <span className={styles.badge} style={{ background: bg, color }}>{line}</span>
}

const CATEGORY_ICONS = {
  restaurant: '🍽️', food: '🍽️', cafe: '☕', coffee: '☕',
  bar: '🍺', pizza: '🍕', fast_food: '🍔', bakery: '🥐',
  college: '🎓', university: '🎓', school: '🏫',
  hospital: '🏥', pharmacy: '💊', doctor: '🩺',
  hotel: '🏨', lodging: '🏨',
  park: '🌳', museum: '🏛️', library: '📚',
  subway: '🚇', train: '🚆', bus: '🚌', airport: '✈️',
  grocery: '🛒', supermarket: '🛒', shopping: '🛍️',
  gym: '💪', sports: '⚽',
  bank: '🏦', atm: '💳',
}

function getCategoryIcon(poiCategories) {
  if (!poiCategories?.length) return '📍'
  for (const cat of poiCategories) {
    const key = cat.toLowerCase().replace(/[\s-]/g, '_')
    if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key]
    for (const [k, v] of Object.entries(CATEGORY_ICONS)) {
      if (key.includes(k)) return v
    }
  }
  return '📍'
}

function PlaceSearch({ placeholder, userLocation, onSelect, value, onCandidates }) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [retrieving, setRetrieving] = useState(false)
  const debounceRef = useRef(null)
  const sessionTokenRef = useRef(crypto.randomUUID())

  const search = useCallback(async (q) => {
    if (!q.trim() || !MAPBOX_TOKEN) {
      setResults([])
      onCandidates?.([])
      return
    }
    const proximity = userLocation
      ? `${userLocation.lon},${userLocation.lat}`
      : '-74.0060,40.7128'
    const suggestUrl = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(q)}&access_token=${MAPBOX_TOKEN}&session_token=${sessionTokenRef.current}&bbox=-74.3,40.4,-73.7,40.9&limit=6&types=poi,address,place&proximity=${proximity}`
    const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&bbox=-74.3,40.4,-73.7,40.9&limit=8&types=poi,address,place&proximity=${proximity}`
    try {
      const [sRes, gRes] = await Promise.all([fetch(suggestUrl), fetch(geoUrl)])
      const [sData, gData] = await Promise.all([sRes.json(), gRes.json()])
      setResults(sData.suggestions || [])
      setOpen(true)
      if (onCandidates) {
        const candidates = (gData.features || [])
          .filter(f => f.geometry?.coordinates?.length >= 2)
          .map(f => ({
            id: f.id,
            name: f.text,
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
            fullAddress: f.place_name,
            category: f.properties?.category?.split(',')[0] || null,
          }))
        onCandidates(candidates)
      }
    } catch (e) { console.error(e) }
  }, [userLocation, onCandidates])

  const handleInput = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 300)
  }

  const handleSelect = async (suggestion) => {
    setQuery(suggestion.name)
    setResults([])
    setOpen(false)
    setRetrieving(true)
    try {
      const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?access_token=${MAPBOX_TOKEN}&session_token=${sessionTokenRef.current}`
      const res = await fetch(url)
      const data = await res.json()
      const feature = data.features?.[0]
      if (feature) {
        const [lon, lat] = feature.geometry.coordinates
        const displayName = suggestion.full_address || suggestion.place_formatted
          ? `${suggestion.name}, ${suggestion.place_formatted}`
          : suggestion.name
        setQuery(displayName)
        onSelect({ name: displayName, lat, lon, label: suggestion.name })
        onCandidates?.([])
        sessionTokenRef.current = crypto.randomUUID()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setRetrieving(false)
    }
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    onSelect(null)
    onCandidates?.([])
    sessionTokenRef.current = crypto.randomUUID()
  }

  return (
    <div className={styles.searchWrapper}>
      <div className={styles.searchBox}>
        <span className={styles.searchIcon}>{retrieving ? '' : ''}</span>
        <input
          className={styles.searchInput}
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={handleInput}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          autoComplete="off"
        />
        {retrieving && <div className={styles.searchSpinner} />}
        {query && !retrieving && <button className={styles.clearBtn} onMouseDown={handleClear}>×</button>}
      </div>
      {open && results.length > 0 && (
        <ul className={styles.dropdown}>
          {results.map(s => {
            const icon = s.feature_type === 'poi' ? getCategoryIcon(s.poi_category) : '📍'
            const category = s.poi_category?.[0]
              ? s.poi_category[0].replace(/_/g, ' ')
              : s.feature_type
            return (
              <li key={s.mapbox_id} className={styles.dropdownItem} onMouseDown={() => handleSelect(s)}>
                <div className={styles.dropdownRow}>
                  <span className={styles.placeIcon}>{icon}</span>
                  <div className={styles.placeInfo}>
                    <span className={styles.placeName}>{s.name}</span>
                    <span className={styles.placeAddr}>{s.place_formatted || ''}</span>
                  </div>
                  {s.feature_type === 'poi' && (
                    <span className={styles.placeCategory}>{category}</span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function OriginPicker({ origin, locating, locError, onRequestGPS, onOriginChange }) {
  const [mode, setMode] = useState('gps') // 'gps' | 'custom'

  const switchToGPS = () => {
    setMode('gps')
    onRequestGPS()
  }

  const switchToCustom = () => {
    setMode('custom')
    onOriginChange(null)
  }

  return (
    <div className={styles.originSection}>
      <div className={styles.originLabel}>Starting from</div>

      {/* Toggle */}
      <div className={styles.toggle}>
        <button
          className={`${styles.toggleBtn} ${mode === 'gps' ? styles.toggleActive : ''}`}
          onClick={switchToGPS}
        >
          My location
        </button>
        <button
          className={`${styles.toggleBtn} ${mode === 'custom' ? styles.toggleActive : ''}`}
          onClick={switchToCustom}
        >
          Enter address
        </button>
      </div>

      {/* GPS status */}
      {mode === 'gps' && (
        <div className={styles.gpsStatus}>
          {locating && (
            <div className={styles.locating}>
              <div className={styles.pulse} />
              Finding your location…
            </div>
          )}
          {!locating && origin && (
            <div className={styles.locFound}>
              <span className={styles.locDot} />
              Location found
            </div>
          )}
          {!locating && locError && (
            <div className={styles.locError}>
              {locError}{' '}
              <button className={styles.retryBtn} onClick={switchToGPS}>Retry</button>
            </div>
          )}
        </div>
      )}

      {/* Custom address search */}
      {mode === 'custom' && (
        <PlaceSearch
          placeholder="Enter your starting address…"
          userLocation={null}
          onSelect={onOriginChange}
        />
      )}
    </div>
  )
}

function LineDepartureRow({ line, minutes, isLive, isSelected, onSelect }) {
  return (
    <div
      className={`${styles.depRow} ${isSelected ? styles.depRowSelected : ''}`}
      onClick={() => onSelect(line)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect(line)}
      aria-pressed={isSelected}
    >
      <LineBadge line={line} />
      <span className={isLive ? styles.depTime : styles.depTimeEst}>
        {isLive ? `${minutes} min` : `~${minutes} min`}
      </span>
      <span className={isSelected ? styles.depSelected : styles.depSelect}>
        {isSelected ? 'Selected ✓' : 'Select'}
      </span>
    </div>
  )
}

function StationChip({ station, label, walkKm, color, allRoutes, activePlan, onPlanSelect }) {
    if (!station) return null
    const walkMin = Math.max(1, Math.round((walkKm / 5) * 60))

    // If we have ranked routes, show them grouped by line group
    const hasRoutes = allRoutes?.length > 0

    return (
        <div className={styles.stationChip}>
            <div className={styles.chipDot} style={{ background: color }} />
            <div className={styles.chipBody}>
                <span className={styles.chipLabel}>{label}</span>
                {hasRoutes ? (
                    // Show ranked route options grouped by line
                    <div className={styles.rankedRoutes}>
                        {allRoutes.map((route, i) => {
                            const isActive = activePlan?.lines?.join() === route.lines?.join()
                            const depLines = Object.keys(route.travel_time.line_departures || {})
                            const soonest = depLines.length
                                ? Math.min(...depLines.map(l => route.travel_time.line_departures[l].minutes))
                                : route.travel_time.wait_minutes
                            const isLive = Object.values(route.travel_time.line_departures || {}).some(d => d.live)

                            return (
                                <div
                                    key={i}
                                    className={`${styles.rankedRoute} ${isActive ? styles.rankedRouteActive : ''}`}
                                    onClick={() => onPlanSelect(route)}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={e => e.key === 'Enter' && onPlanSelect(route)}
                                >
                                    {/* Line badges */}
                                    <div className={styles.routeLineBadges}>
                                        {route.lines.map(l => <LineBadge key={l} line={l} />)}
                                    </div>

                                    {/* Wait time */}
                                    <span className={isLive ? styles.depTime : styles.depTimeEst}>
                                        {isLive ? `${soonest} min` : `~${soonest} min`}
                                    </span>

                                    {/* Total travel time */}
                                    <span className={styles.routeTotalTime}>
                                        {route.travel_time.total_minutes} min total
                                    </span>

                                    {/* Active indicator */}
                                    {isActive && <span className={styles.routeActiveCheck}>✓</span>}
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    // Fallback: just show station name + walk time
                    <>
                        <span className={styles.chipName}>{station.name}</span>
                        <div className={styles.chipMeta}>
                            <span className={styles.chipWalk}>🚶 {walkMin} min walk</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

function TravelCard({ plan, selectedLine }) {
  if (!plan) return null
  const { travel_time: tt, origin_walk_km, dest_walk_km } = plan
  if (!tt || tt.stops === 0) return null

  const originWalkMin = Math.max(1, Math.round((origin_walk_km / 5) * 60))
  const destWalkMin = Math.max(1, Math.round((dest_walk_km / 5) * 60))
  const total = originWalkMin + (tt.wait_minutes ?? 5) + tt.transit_minutes + destWalkMin

  return (
    <div className={styles.travelCard}>
      <div className={styles.travelTotal}>
        <span className={styles.travelTotalNum}>{total}</span>
        <span className={styles.travelTotalLabel}>min total</span>
      </div>

      <div className={styles.travelBreakdown}>
        <div className={styles.travelStep}>
          <span className={styles.travelIcon}>Walk</span>
          <span>{originWalkMin} min</span>
          <span className={styles.travelStepLabel}>walk to station</span>
        </div>
        <div className={styles.travelDivider} />
        <div className={styles.travelStep}>
          <span className={styles.travelIcon}>Wait</span>
          <span>{tt.wait_minutes ?? 5} min</span>
          <span className={styles.travelStepLabel}>
            {selectedLine ? `wait for ${selectedLine} ` : 'wait '}
            {tt.live ? <span className={styles.livePill}>live</span> : '(est.)'}
          </span>
        </div>
        <div className={styles.travelDivider} />
        <div className={styles.travelStep}>
          <span className={styles.travelIcon}>Ride</span>
          <span>{tt.transit_minutes} min</span>
          <span className={styles.travelStepLabel}>{tt.stops} stops</span>
        </div>
        <div className={styles.travelDivider} />
        <div className={styles.travelStep}>
          <span className={styles.travelIcon}>Walk</span>
          <span>{destWalkMin} min</span>
          <span className={styles.travelStepLabel}>walk from station</span>
        </div>
      </div>
    </div>
  )
}

function RouteOptionsList({ options, activePlan, onSelect }) {
  if (!options || options.length <= 1) return null
  return (
    <div className={styles.routeOptions}>
      {options.map((r, i) => (
        <div
          key={i}
          className={`${styles.routeOption} ${activePlan === r ? styles.routeOptionActive : ''}`}
          onClick={() => onSelect(r)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onSelect(r)}
        >
          <span className={styles.routeOptionRank}>#{i + 1}</span>
          <span className={styles.routeOptionTime}>{r.travel_time.total_minutes} min</span>
          <span className={styles.routeOptionStops}>{r.travel_time.stops} stops</span>
        </div>
      ))}
    </div>
  )
}

export default function TripPlanner({
  origin, locating, locError, destination, plan, planning,
  onOriginChange, onDestChange, onRequestGPS, onReset,
  isLoggedIn, setIsLoggedIn, setView,
  selectedLine, onLineSelect, onCandidatesChange,
  allRoutes, onPlanSelect,
}) {
  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⊝</span>
          <span className={styles.logoText}>OnTime</span>
        </div>
        <p className={styles.tagline}>NYC Subway Planner</p>
      </div>

      {/* Origin picker */}
      <OriginPicker
        origin={origin}
        locating={locating}
        locError={locError}
        onRequestGPS={onRequestGPS}
        onOriginChange={onOriginChange}
      />

      {/* Destination search */}
      <div className={styles.destSection}>
        <div className={styles.destLabel}>Where to?</div>
        <PlaceSearch
          placeholder="Search destination…"
          userLocation={origin}
          onSelect={onDestChange}
          onCandidates={onCandidatesChange}
        />
      </div>

      {/* Station chips */}
      {plan && (
        <>
          <StationChip
            station={plan.origin_station}
            label="Nearest station to you"
            walkKm={plan.origin_walk_km}
            color="#4f6ef7"
            allRoutes={allRoutes}
            activePlan={plan}
            onPlanSelect={onPlanSelect}
          />
          <StationChip
            station={plan.dest_station}
            label="Nearest station to destination"
            walkKm={plan.dest_walk_km}
            color="#f97316"
          />
        </>
      )}

      {/* Loading */}
      {planning && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          Planning your trip…
        </div>
      )}

      {/* No route */}
      {!planning && plan && !plan.route.found && (
        <div className={styles.noRoute}>No subway route found between these stations.</div>
      )}

      {/* Travel time card */}
      {!planning && plan?.route.found && (
        <TravelCard plan={plan} selectedLine={selectedLine} />
      )}

      {/* Reset */}
      {destination && (
        <button className={styles.resetBtn} onClick={onReset}>← New search</button>
      )}

      <SidebarNav 
        isLoggedIn={isLoggedIn} 
        currentView="home" 
        setView={setView} 
        onLogout={() => setIsLoggedIn(false)} 
      />
    </aside>
  )
}
