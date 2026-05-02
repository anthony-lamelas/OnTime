import { useState, useCallback } from 'react'
import styles from './TripPlanner.module.css'
import SidebarNav from './SidebarNav'
import PlaceSearch from './PlaceSearch'

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
          value={origin?.name || origin?.label || ''}
          placeholder="Enter your starting address…"
          userLocation={null}
          onSelect={onOriginChange}
        />
      )}
    </div>
  )
}

function StationChip({ station, label, walkKm, color, allRoutes, activePlan, onPlanSelect }) {
  if (!station) return null
  const walkMin = Math.max(1, Math.round((walkKm / 5) * 60))
  const hasRoutes = allRoutes?.length > 0

  return (
    <div className={styles.stationChip}>
      <div className={styles.chipDot} style={{ background: color }} />
      <div className={styles.chipBody}>
        <span className={styles.chipLabel}>{label}</span>
        <span className={styles.chipName}>{station.name}</span>
        <div className={styles.chipMeta}>
          <span className={styles.chipWalk}>🚶 {walkMin} min walk</span>
        </div>

        {hasRoutes && (
          <div className={styles.depList}>
            {allRoutes.map((route, i) => {
              const line = route.lines?.[0]
              const isActive = activePlan?.lines?.[0] === line
              const minutes = route.travel_time.wait_minutes
              const isLive = route.travel_time.live
              const score = route.score

              const delayLabel = score > 0.75 ? 'On time'
                : score > 0.60 ? 'Minor delays'
                : 'Delays'
              const delayColor = score > 0.75 ? '#22c55e'
                : score > 0.60 ? '#fb923c'
                : '#ef4444'
              const delayBg = score > 0.75 ? 'rgba(34,197,94,0.15)'
                : score > 0.60 ? 'rgba(251,146,60,0.15)'
                : 'rgba(239,68,68,0.15)'

              return (
                <div
                  key={line}
                  className={`${styles.depRow} ${isActive ? styles.depRowSelected : ''}`}
                  onClick={() => onPlanSelect(route)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && onPlanSelect(route)}
                >
                  <LineBadge line={line} />
                  <span className={isLive ? styles.depTime : styles.depTimeEst}>
                    {isLive ? `${minutes} min` : `~${minutes} min`}
                  </span>
                  <span
                    className={styles.routeDelayBadge}
                    style={{
                      background: route.predicted_delay_minutes < 0.5
                        ? 'rgba(34,197,94,0.15)'
                        : route.predicted_delay_minutes < 2
                        ? 'rgba(251,146,60,0.15)'
                        : 'rgba(239,68,68,0.15)',
                      color: route.predicted_delay_minutes < 0.5 ? '#22c55e'
                        : route.predicted_delay_minutes < 2 ? '#fb923c'
                        : '#ef4444'
                    }}
                  >
                    {route.predicted_delay_minutes < 0
                      ? `${Math.abs(route.predicted_delay_minutes).toFixed(1)} min early`
                      : route.predicted_delay_minutes < 0.5
                      ? 'On time'
                      : `+${route.predicted_delay_minutes.toFixed(1)} min`}
                  </span>
                  {isActive && <span className={styles.depSelected}>✓</span>}
                </div>
              )
            })}
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
        <span className={styles.travelTotalLabel}>min</span>
      </div>

      <div className={styles.travelBreakdown}>
        <div className={styles.travelStep}>
          <span className={styles.travelIcon}>Walk </span>
          <span>{originWalkMin} min</span>
          <span className={styles.travelStepLabel}>Walk to station</span>
        </div>
        <div className={styles.travelDivider} />
        <div className={styles.travelStep}>
          <span className={styles.travelIcon}>Wait </span>
          <span>{tt.wait_minutes ?? 5} min</span>
          <span className={styles.travelStepLabel}>
            {selectedLine ? `wait for ${selectedLine} ` : 'wait '}
            {tt.live ? <span className={styles.livePill}>live</span> : '(estimated)'}
          </span>
        </div>
        <div className={styles.travelDivider} />
        <div className={styles.travelStep}>
          <span className={styles.travelIcon}>Ride </span>
          <span>{tt.transit_minutes} min</span>
          <span className={styles.travelStepLabel}>{tt.stops} stops</span>
        </div>
        <div className={styles.travelDivider} />
        <div className={styles.travelStep}>
          <span className={styles.travelIcon}>Walk </span>
          <span>{destWalkMin} min</span>
          <span className={styles.travelStepLabel}>Walk from station</span>
        </div>
      </div>
    </div>
  )
}

export default function TripPlanner({
  origin, locating, locError, destination, plan, planning,
  onOriginChange, onDestChange, onRequestGPS, onReset,
  isLoggedIn, setIsLoggedIn, setView,
  selectedLine, onLineSelect, onCandidatesChange,
  destInputRef,
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
          ref={destInputRef}
          value={destination?.name || destination?.label || ''}
          placeholder="Search destination…"
          userLocation={origin}
          onSelect={onDestChange}
          onCandidates={onCandidatesChange}
        />
      </div>

      {/* Station chips — origin shows ranked route options */}
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
      {!planning && plan && !plan.route?.found && (
        <div className={styles.noRoute}>No subway route found between these stations.</div>
      )}

      {/* Travel time card */}
      {!planning && plan?.route?.found && (
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
        onLogout={() => {
          localStorage.removeItem('token')
          setIsLoggedIn(false)
        }}
      />
    </aside>
  )
}