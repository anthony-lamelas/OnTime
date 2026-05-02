import { useState, useEffect, useRef, useCallback } from 'react'
import styles from './TripPlanner.module.css'
import ptStyles from './PlannedTripsPanel.module.css'
import SidebarNav from './SidebarNav'
import PlaceSearch from './PlaceSearch'

// ── Scroll Wheel Drum ──────────────────────────────────────────────
const ITEM_H = 44

function Drum({ items, value, onChange }) {
  const ref = useRef()
  const ticking = useRef(false)

  // Snap to initial value on mount
  useEffect(() => {
    const idx = items.indexOf(String(value))
    if (ref.current && idx >= 0) {
      ref.current.scrollTop = idx * ITEM_H
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleScroll = useCallback(() => {
    if (!ref.current || ticking.current) return
    ticking.current = true
    requestAnimationFrame(() => {
      if (ref.current) {
        const newIdx = Math.round(ref.current.scrollTop / ITEM_H)
        const clamped = Math.max(0, Math.min(items.length - 1, newIdx))
        if (items[clamped] !== undefined && String(items[clamped]) !== String(value)) {
          onChange(items[clamped])
        }
      }
      ticking.current = false
    })
  }, [items, value, onChange])

  return (
    <div className={ptStyles.drumOuter}>
      <div className={ptStyles.drumHighlight} />
      <div ref={ref} className={ptStyles.drumScroll} onScroll={handleScroll}>
        {/* Top padding: 1 item so first item can center in 3-item window */}
        <div style={{ height: ITEM_H, flexShrink: 0 }} />
        {items.map(item => (
          <div
            key={item}
            className={`${ptStyles.drumItem} ${String(item) === String(value) ? ptStyles.drumItemSelected : ''}`}
          >
            {item}
          </div>
        ))}
        {/* Bottom padding */}
        <div style={{ height: ITEM_H, flexShrink: 0 }} />
      </div>
    </div>
  )
}

// ── Time Picker (inline scroll wheels) ────────────────────────────
const HOURS   = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const AMPM    = ['AM', 'PM']

function TimePicker({ hour, minute, ampm, onChange }) {
  return (
    <div className={ptStyles.timePicker}>
      <Drum items={HOURS}   value={hour}   onChange={v => onChange('timeHour', v)} />
      <div className={ptStyles.timeSep}>:</div>
      <Drum items={MINUTES} value={minute} onChange={v => onChange('timeMinute', v)} />
      <Drum items={AMPM}    value={ampm}   onChange={v => onChange('timeAmpm', v)} />
    </div>
  )
}

// ── Date Input (MM / DD / YYYY text fields) ───────────────────────
function DateInputs({ month, day, year, onChange }) {
  const dayRef  = useRef()
  const yearRef = useRef()

  const handleMonth = e => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2)
    onChange('dateMonth', val)
    if (val.length === 2) dayRef.current?.focus()
  }
  const handleDay = e => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2)
    onChange('dateDay', val)
    if (val.length === 2) yearRef.current?.focus()
  }
  const handleYear = e => {
    onChange('dateYear', e.target.value.replace(/\D/g, '').slice(0, 4))
  }

  return (
    <div className={ptStyles.dateRow}>
      <input
        type="text"
        inputMode="numeric"
        placeholder="MM"
        value={month}
        onChange={handleMonth}
        className={ptStyles.dateInput}
        maxLength={2}
      />
      <span className={ptStyles.dateSep}>/</span>
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        placeholder="DD"
        value={day}
        onChange={handleDay}
        className={ptStyles.dateInput}
        maxLength={2}
      />
      <span className={ptStyles.dateSep}>/</span>
      <input
        ref={yearRef}
        type="text"
        inputMode="numeric"
        placeholder="YYYY"
        value={year}
        onChange={handleYear}
        className={`${ptStyles.dateInput} ${ptStyles.dateInputYear}`}
        maxLength={4}
      />
    </div>
  )
}

// ── Trip card ─────────────────────────────────────────────────────
function TripCard({ trip, isPast, onSelect, onDelete }) {
  return (
    <div
      className={ptStyles.card}
      style={isPast ? { opacity: 0.5 } : {}}
      onClick={onSelect}
    >
      <div className={ptStyles.cardHeader}>
        <div className={ptStyles.cardTime}>
          {trip.date} · {trip.time}
        </div>
        <button
          type="button"
          className={ptStyles.deleteBtn}
          onClick={e => { e.stopPropagation(); onDelete() }}
        >×</button>
      </div>
      <div className={ptStyles.cardRoute}>
        <span className={ptStyles.routeOrigin}>{trip.origin.label}</span>
        <span className={ptStyles.routeArrow}>→</span>
        <span>{trip.destination.label}</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────
export default function PlannedTripsPanel({ setView, isLoggedIn, setIsLoggedIn, onSelectRoute }) {
  const [trips, setTrips]       = useState([])
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError]       = useState(null)
  const [formData, setFormData] = useState({
    origin: null,
    destination: null,
    dateMonth: '',
    dateDay: '',
    dateYear: '',
    timeHour: '9',
    timeMinute: '00',
    timeAmpm: 'AM',
  })

  useEffect(() => {
    if (!isLoggedIn) { setTrips([]); return }
    const token = localStorage.getItem('token')
    fetch('/api/planned_trips/', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(data => setTrips(data))
      .catch(() => {})
  }, [isLoggedIn])

  const setField = useCallback((key, val) => {
    setFormData(prev => ({ ...prev, [key]: val }))
  }, [])

  const handleAddSubmit = async e => {
    e.preventDefault()
    setError(null)
    const { dateMonth, dateDay, dateYear, timeHour, timeMinute, timeAmpm } = formData

    if (!dateMonth || !dateDay || !dateYear || dateYear.length < 4) {
      setError('Please enter a valid date.'); return
    }
    if (!formData.origin || !formData.destination) {
      setError('Please select both origin and destination.'); return
    }

    const date = `${dateYear}-${dateMonth.padStart(2,'0')}-${dateDay.padStart(2,'0')}`
    let h = parseInt(timeHour)
    if (timeAmpm === 'PM' && h !== 12) h += 12
    if (timeAmpm === 'AM' && h === 12) h = 0
    const time = `${String(h).padStart(2,'0')}:${timeMinute}`

    if (new Date(`${date}T${time}`) < new Date()) {
      setError('Trip time must be in the future.'); return
    }

    const token = localStorage.getItem('token')
    try {
      const res = await fetch('/api/planned_trips/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ origin: formData.origin, destination: formData.destination, date, time }),
      })
      if (!res.ok) throw new Error('Failed to save')
      const trip = await res.json()
      setTrips(prev => [trip, ...prev])
      setIsAdding(false)
      setFormData({ origin: null, destination: null, dateMonth: '', dateDay: '', dateYear: '', timeHour: '9', timeMinute: '00', timeAmpm: 'AM' })
    } catch {
      setError('Could not save trip. Try again.')
    }
  }

  const handleDelete = async id => {
    const token = localStorage.getItem('token')
    const res = await fetch(`/api/planned_trips/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setTrips(prev => prev.filter(t => t.id !== id))
  }

  const now = new Date()
  const upcoming = trips.filter(t => new Date(`${t.date}T${t.time}`) >= now)
  const past     = trips.filter(t => new Date(`${t.date}T${t.time}`) < now)

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>⊝</span>
          <span className={styles.logoText}>OnTime</span>
        </div>
        <p className={styles.tagline}>NYC Subway Planner</p>
      </div>

      <div className={ptStyles.backAction}>
        <button className={ptStyles.backBtn} onClick={() => setView('home')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
          Back
        </button>
      </div>

      <div className={ptStyles.content}>
        <div className={ptStyles.titleRow}>
          <h2 className={ptStyles.title}>Planned Trips</h2>
          {!isAdding && (
            <button className={ptStyles.addBtn} onClick={() => setIsAdding(true)}>+</button>
          )}
        </div>

        {isAdding ? (
          <form className={ptStyles.addForm} onSubmit={handleAddSubmit}>
            <div className={ptStyles.formSectionLabel}>NEW TRIP</div>

            {error && <div className={ptStyles.formError}>{error}</div>}

            {/* Origin */}
            <div className={ptStyles.fieldGroup}>
              <div className={ptStyles.fieldLabel}>Origin</div>
              <div className={ptStyles.searchWrap}>
                <PlaceSearch
                  placeholder="Search starting point…"
                  value={formData.origin?.name || ''}
                  onSelect={sel => setField('origin', sel)}
                />
              </div>
            </div>

            {/* Destination */}
            <div className={ptStyles.fieldGroup}>
              <div className={ptStyles.fieldLabel}>Destination</div>
              <div className={ptStyles.searchWrap}>
                <PlaceSearch
                  placeholder="Search destination…"
                  value={formData.destination?.name || ''}
                  onSelect={sel => setField('destination', sel)}
                />
              </div>
            </div>

            <div className={ptStyles.divider} />

            {/* Date */}
            <div className={ptStyles.fieldGroup}>
              <div className={ptStyles.fieldLabel}>Date</div>
              <DateInputs
                month={formData.dateMonth}
                day={formData.dateDay}
                year={formData.dateYear}
                onChange={setField}
              />
            </div>

            {/* Time */}
            <div className={ptStyles.fieldGroup}>
              <div className={ptStyles.fieldLabel}>Time</div>
              <TimePicker
                hour={formData.timeHour}
                minute={formData.timeMinute}
                ampm={formData.timeAmpm}
                onChange={setField}
              />
            </div>

            {/* Actions */}
            <div className={ptStyles.formActions}>
              <button type="button" className={ptStyles.cancelBtn} onClick={() => { setIsAdding(false); setError(null) }}>
                Cancel
              </button>
              <button type="submit" className={ptStyles.submitBtn}>
                Save Trip
              </button>
            </div>
          </form>
        ) : (
          <div className={ptStyles.tripList}>
            {upcoming.length === 0 && (
              <div className={ptStyles.empty}>No upcoming trips planned.</div>
            )}
            {upcoming.map(t => (
              <TripCard
                key={t.id}
                trip={t}
                isPast={false}
                onSelect={() => { onSelectRoute(t.origin, t.destination); setView('home') }}
                onDelete={() => handleDelete(t.id)}
              />
            ))}
            {past.length > 0 && (
              <>
                <div className={ptStyles.sectionDivider}>Past trips</div>
                {past.map(t => (
                  <TripCard
                    key={t.id}
                    trip={t}
                    isPast
                    onSelect={() => { onSelectRoute(t.origin, t.destination); setView('home') }}
                    onDelete={() => handleDelete(t.id)}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </div>

      <SidebarNav
        isLoggedIn={isLoggedIn}
        currentView="plannedTrips"
        setView={setView}
        onLogout={() => { localStorage.removeItem('token'); setIsLoggedIn(false); setView('home') }}
      />
    </aside>
  )
}
