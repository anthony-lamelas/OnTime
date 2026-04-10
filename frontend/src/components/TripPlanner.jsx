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

function PlaceSearch({ placeholder, userLocation, onSelect, value }) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const debounceRef = useRef(null)

  const search = useCallback(async (q) => {
    if (!q.trim() || !MAPBOX_TOKEN) { setResults([]); return }
    const prox = userLocation ? `&proximity=${userLocation.lon},${userLocation.lat}` : ''
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${MAPBOX_TOKEN}&bbox=-74.3,40.4,-73.7,40.9&limit=6&types=poi,address,place${prox}`
    try {
      const res = await fetch(url)
      const data = await res.json()
      setResults(data.features || [])
      setOpen(true)
    } catch (e) { console.error(e) }
  }, [userLocation])

  const handleInput = (e) => {
    const q = e.target.value
    setQuery(q)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(q), 300)
  }

  const handleSelect = (feature) => {
    const [lon, lat] = feature.geometry.coordinates
    setQuery(feature.place_name)
    setResults([])
    setOpen(false)
    onSelect({ name: feature.place_name, lat, lon, label: feature.text })
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    onSelect(null)
  }

  return (
    <div className={styles.searchWrapper}>
      <div className={styles.searchBox}>
        <span className={styles.searchIcon}></span>
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
        {query && <button className={styles.clearBtn} onMouseDown={handleClear}>×</button>}
      </div>
      {open && results.length > 0 && (
        <ul className={styles.dropdown}>
          {results.map(f => (
            <li key={f.id} className={styles.dropdownItem} onMouseDown={() => handleSelect(f)}>
              <span className={styles.placeName}>{f.text}</span>
              <span className={styles.placeAddr}>{f.place_name}</span>
            </li>
          ))}
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

function StationChip({ station, label, walkKm, color, lineDepartures, selectedLine, onLineSelect }) {
  if (!station) return null
  const walkMin = Math.max(1, Math.round((walkKm / 5) * 60))
  const depEntries = lineDepartures
    ? Object.entries(lineDepartures).sort(([, a], [, b]) => a.minutes - b.minutes)
    : null

  return (
    <div className={styles.stationChip}>
      <div className={styles.chipDot} style={{ background: color }} />
      <div className={styles.chipBody}>
        <span className={styles.chipLabel}>{label}</span>
        <span className={styles.chipName}>{station.name}</span>
        <div className={styles.chipMeta}>
          <span className={styles.chipWalk}>🚶 {walkMin} min walk</span>
          {!depEntries && (
            <span className={styles.chipLines}>
              {station.lines.slice(0, 6).map(l => <LineBadge key={l} line={l} />)}
            </span>
          )}
        </div>
        {depEntries && (
          <div className={styles.depList}>
            {depEntries.map(([line, { minutes, live }]) => (
              <LineDepartureRow
                key={line}
                line={line}
                minutes={minutes}
                isLive={live}
                isSelected={selectedLine === line}
                onSelect={onLineSelect}
              />
            ))}
          </div>
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

export default function TripPlanner({
  origin, locating, locError, destination, plan, planning,
  onOriginChange, onDestChange, onRequestGPS, onReset,
  isLoggedIn, setIsLoggedIn, setView,
  selectedLine, onLineSelect,
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
            lineDepartures={plan.travel_time?.line_departures}
            selectedLine={selectedLine}
            onLineSelect={onLineSelect}
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
