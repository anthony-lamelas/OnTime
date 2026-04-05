import { useState } from 'react'
import styles from './TripPlanner.module.css'
import favStyles from './FavoritesPanel.module.css'
import SidebarNav from './SidebarNav'

// Mock Data
const MOCK_FAVORITE_ROUTES = [
  {
    id: 1,
    name: 'Home to Work',
    origin: { lat: 40.7128, lon: -74.0060, name: '123 Fake St, New York', label: '123 Fake St' },
    destination: { lat: 40.7580, lon: -73.9855, name: 'Times Square, New York', label: 'Times Square' }
  },
  {
    id: 2,
    name: 'Work to Gym',
    origin: { lat: 40.7580, lon: -73.9855, name: 'Times Square, New York', label: 'Times Square' },
    destination: { lat: 40.7306, lon: -73.9965, name: 'Washington Square Park, New York', label: 'Washington Square Park' }
  }
]

const MOCK_FAVORITE_LOCATIONS = [
  {
    id: 1,
    name: 'JFK Airport',
    location: { lat: 40.6413, lon: -73.7781, name: 'JFK Airport, Queens', label: 'JFK Airport' }
  },
  {
    id: 2,
    name: 'Central Park',
    location: { lat: 40.7822, lon: -73.9653, name: 'Central Park, New York', label: 'Central Park' }
  }
]

export default function FavoritesPanel({ setView, isLoggedIn, setIsLoggedIn, onSelectRoute, onSelectLocation }) {
  const [routes, setRoutes] = useState(MOCK_FAVORITE_ROUTES)
  const [locations, setLocations] = useState(MOCK_FAVORITE_LOCATIONS)
  
  const [isAddingRoute, setIsAddingRoute] = useState(false)
  const [isAddingLocation, setIsAddingLocation] = useState(false)
  
  const [routeForm, setRouteForm] = useState({ name: '', origin: '', destination: '' })
  const [locationForm, setLocationForm] = useState({ name: '', location: '' })

  const handleRouteClick = (route) => {
    onSelectRoute(route.origin, route.destination)
    setView('home')
  }
  
  const handleLocationClick = (loc) => {
    onSelectLocation(loc.location)
    setView('home')
  }

  const handleAddRoute = (e) => {
    e.preventDefault()
    const newRoute = {
      id: Date.now(),
      name: routeForm.name || 'Custom Route',
      origin: { lat: 40.7128, lon: -74.0060, name: routeForm.origin, label: routeForm.origin },
      destination: { lat: 40.7580, lon: -73.9855, name: routeForm.destination, label: routeForm.destination }
    }
    setRoutes([newRoute, ...routes])
    setIsAddingRoute(false)
    setRouteForm({ name: '', origin: '', destination: '' })
  }

  const handleAddLocation = (e) => {
    e.preventDefault()
    const newLoc = {
      id: Date.now(),
      name: locationForm.name || 'Custom Location',
      location: { lat: 40.7128, lon: -74.0060, name: locationForm.location, label: locationForm.location }
    }
    setLocations([newLoc, ...locations])
    setIsAddingLocation(false)
    setLocationForm({ name: '', location: '' })
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

      <div className={favStyles.backAction}>
         <button className={styles.resetBtn} onClick={() => setView('home')}>← Back to Planner</button>
      </div>

      <div className={favStyles.content}>
        <h2 className={favStyles.title}>Favorites</h2>
        
        <div className={favStyles.section}>
          <div className={favStyles.titleRow}>
            <h3 className={favStyles.subtitle}>Saved Routes</h3>
            {!isAddingRoute && <button className={favStyles.addBtn} onClick={() => setIsAddingRoute(true)}>+</button>}
          </div>
          
          {isAddingRoute && (
            <form className={favStyles.addForm} onSubmit={handleAddRoute}>
              <div className={favStyles.inputGroup}>
                <label>Name</label>
                <input type="text" required value={routeForm.name} onChange={e => setRouteForm({...routeForm, name: e.target.value})} placeholder="e.g. Home to Work" />
              </div>
              <div className={favStyles.inputGroup}>
                <label>Origin</label>
                <input type="text" required value={routeForm.origin} onChange={e => setRouteForm({...routeForm, origin: e.target.value})} placeholder="Location" />
              </div>
              <div className={favStyles.inputGroup}>
                <label>Destination</label>
                <input type="text" required value={routeForm.destination} onChange={e => setRouteForm({...routeForm, destination: e.target.value})} placeholder="Location" />
              </div>
              <div className={favStyles.formActions}>
                <button type="button" className={favStyles.cancelBtn} onClick={() => setIsAddingRoute(false)}>Cancel</button>
                <button type="submit" className={favStyles.submitBtn}>Save</button>
              </div>
            </form>
          )}

          {!isAddingRoute && routes.map(route => (
            <div key={route.id} className={favStyles.card} onClick={() => handleRouteClick(route)}>
              <div className={favStyles.cardTitle}>{route.name}</div>
              <div className={favStyles.cardDesc}>
                {route.origin.label} → {route.destination.label}
              </div>
            </div>
          ))}
        </div>

        <div className={favStyles.section}>
          <div className={favStyles.titleRow}>
            <h3 className={favStyles.subtitle}>Saved Locations</h3>
            {!isAddingLocation && <button className={favStyles.addBtn} onClick={() => setIsAddingLocation(true)}>+</button>}
          </div>

          {isAddingLocation && (
            <form className={favStyles.addForm} onSubmit={handleAddLocation}>
              <div className={favStyles.inputGroup}>
                <label>Name</label>
                <input type="text" required value={locationForm.name} onChange={e => setLocationForm({...locationForm, name: e.target.value})} placeholder="e.g. Central Park" />
              </div>
              <div className={favStyles.inputGroup}>
                <label>Address</label>
                <input type="text" required value={locationForm.location} onChange={e => setLocationForm({...locationForm, location: e.target.value})} placeholder="Location" />
              </div>
              <div className={favStyles.formActions}>
                <button type="button" className={favStyles.cancelBtn} onClick={() => setIsAddingLocation(false)}>Cancel</button>
                <button type="submit" className={favStyles.submitBtn}>Save</button>
              </div>
            </form>
          )}

          {!isAddingLocation && locations.map(loc => (
            <div key={loc.id} className={favStyles.card} onClick={() => handleLocationClick(loc)}>
              <div className={favStyles.cardTitle}>{loc.name}</div>
              <div className={favStyles.cardDesc}>{loc.location.label}</div>
            </div>
          ))}
        </div>
      </div>

      <SidebarNav 
        isLoggedIn={isLoggedIn} 
        currentView="favorites" 
        setView={setView} 
        onLogout={() => setIsLoggedIn(false)} 
      />
    </aside>
  )
}
