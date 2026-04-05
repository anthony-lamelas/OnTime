import { useState } from 'react'
import styles from './TripPlanner.module.css'
import ptStyles from './PlannedTripsPanel.module.css'
import SidebarNav from './SidebarNav'

// Mock Data
const INITIAL_PLANNED_TRIPS = [
  {
    id: 1,
    origin: { lat: 40.7128, lon: -74.0060, name: '123 Fake St, New York', label: '123 Fake St' },
    destination: { lat: 40.7580, lon: -73.9855, name: 'Times Square, New York', label: 'Times Square' },
    date: '2026-05-15',
    time: '08:30',
  }
]

export default function PlannedTripsPanel({ setView, isLoggedIn, setIsLoggedIn, onSelectRoute }) {
  const [trips, setTrips] = useState(INITIAL_PLANNED_TRIPS)
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    date: '',
    time: ''
  })

  // To simulate selecting locations. In a full implementation, you would reuse PlaceSearch
  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleAddSubmit = (e) => {
    e.preventDefault()
    const newTrip = {
      id: Date.now(),
      origin: { lat: 40.7128, lon: -74.0060, name: formData.origin, label: formData.origin },
      destination: { lat: 40.7580, lon: -73.9855, name: formData.destination, label: formData.destination },
      date: formData.date,
      time: formData.time,
    }
    setTrips([newTrip, ...trips])
    setIsAdding(false)
    setFormData({ origin: '', destination: '', date: '', time: '' })
  }

  const handleTripClick = (trip) => {
    onSelectRoute(trip.origin, trip.destination)
    setView('home')
  }

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
         <button className={styles.resetBtn} onClick={() => setView('home')}>← Back to Planner</button>
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
            <h3 className={ptStyles.subtitle}>New Trip</h3>
            <div className={ptStyles.inputGroup}>
              <label>Origin</label>
              <input type="text" name="origin" required value={formData.origin} onChange={handleChange} placeholder="e.g. 123 Fake St"/>
            </div>
            <div className={ptStyles.inputGroup}>
              <label>Destination</label>
              <input type="text" name="destination" required value={formData.destination} onChange={handleChange} placeholder="e.g. Times Square"/>
            </div>
            <div className={ptStyles.row}>
              <div className={ptStyles.inputGroup}>
                <label>Date</label>
                <input type="date" name="date" required value={formData.date} onChange={handleChange} />
              </div>
              <div className={ptStyles.inputGroup}>
                <label>Time</label>
                <input type="time" name="time" required value={formData.time} onChange={handleChange} />
              </div>
            </div>
            <div className={ptStyles.formActions}>
              <button type="button" className={ptStyles.cancelBtn} onClick={() => setIsAdding(false)}>Cancel</button>
              <button type="submit" className={ptStyles.submitBtn}>Save Trip</button>
            </div>
          </form>
        ) : (
          <div className={ptStyles.tripList}>
            {trips.length === 0 && <div className={ptStyles.empty}>No trips planned.</div>}
            {trips.map(trip => (
              <div key={trip.id} className={ptStyles.card} onClick={() => handleTripClick(trip)}>
                <div className={ptStyles.cardTime}>
                  {trip.date} at {trip.time}
                </div>
                <div className={ptStyles.cardRoute}>
                  {trip.origin.label} → {trip.destination.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SidebarNav 
        isLoggedIn={isLoggedIn} 
        currentView="plannedTrips" 
        setView={setView} 
        onLogout={() => setIsLoggedIn(false)} 
      />
    </aside>
  )
}
