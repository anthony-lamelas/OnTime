import { useState, useEffect } from 'react'
import styles from './TripPlanner.module.css'
import ptStyles from './PlannedTripsPanel.module.css'
import SidebarNav from './SidebarNav'

export default function PlannedTripsPanel({ setView, isLoggedIn, setIsLoggedIn, onSelectRoute }) {
  const [trips, setTrips] = useState([])
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({
    origin: '',
    destination: '',
    date: '',
    time: ''
  })

  useEffect(() => {
    if (!isLoggedIn) {
      setTrips([])
      return
    }
    const fetchTrips = async () => {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/planned_trips/', {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (res.ok) {
          const data = await res.json()
          setTrips(data)
        }
      } catch (e) {
        console.error("Failed to load planned trips:", e)
      }
    }
    fetchTrips()
  }, [isLoggedIn])

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return

    const newTripPayload = {
      origin: { lat: 40.7128, lon: -74.0060, name: formData.origin, label: formData.origin },
      destination: { lat: 40.7580, lon: -73.9855, name: formData.destination, label: formData.destination },
      date: formData.date,
      time: formData.time,
    }

    try {
      const res = await fetch('/api/planned_trips/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newTripPayload)
      })
      if (res.ok) {
        const trip = await res.json()
        setTrips([trip, ...trips])
        setIsAdding(false)
        setFormData({ origin: '', destination: '', date: '', time: '' })
      } else {
        throw new Error("Failed to save trip")
      }
    } catch (err) {
      console.error(err)
    }
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
        onLogout={() => {
          localStorage.removeItem('token')
          setIsLoggedIn(false)
          setView('home')
        }} 
      />
    </aside>
  )
}
