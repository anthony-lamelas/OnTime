import { useState, useEffect } from 'react'
import styles from './TripPlanner.module.css'
import favStyles from './FavoritesPanel.module.css'
import SidebarNav from './SidebarNav'
import PlaceSearch from './PlaceSearch'

export default function FavoritesPanel({ setView, isLoggedIn, setIsLoggedIn, onSelectRoute, onSelectLocation }) {
  const [routes, setRoutes] = useState([])
  const [locations, setLocations] = useState([])
  
  const [isAddingRoute, setIsAddingRoute] = useState(false)
  const [isAddingLocation, setIsAddingLocation] = useState(false)
  
  const [routeForm, setRouteForm] = useState({ name: '', origin: null, destination: null })
  const [locationForm, setLocationForm] = useState({ name: '', location: null })

  const fetchFavorites = async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const [routeRes, locRes] = await Promise.all([
        fetch('/api/favorites/routes', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/favorites/locations', { headers: { Authorization: `Bearer ${token}` } })
      ])
      if (routeRes.ok) {
        const routeData = await routeRes.json()
        setRoutes(routeData)
      }
      if (locRes.ok) {
        const locData = await locRes.json()
        setLocations(locData)
      }
    } catch (err) {
      console.error('Failed to fetch favorites', err)
    }
  }

  useEffect(() => {
    if (isLoggedIn) {
      fetchFavorites()
    } else {
      setRoutes([])
      setLocations([])
    }
  }, [isLoggedIn])

  const handleRouteClick = (route) => {
    onSelectRoute(route.origin, route.destination)
    setView('home')
  }
  
  const handleLocationClick = (loc) => {
    onSelectLocation(loc.location)
    setView('home')
  }

  const handleDeleteRoute = async (e, id) => {
    e.stopPropagation()
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`/api/favorites/routes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setRoutes(routes.filter(r => r.id !== id))
    } catch (err) { console.error(err) }
  }

  const handleDeleteLocation = async (e, id) => {
    e.stopPropagation()
    const token = localStorage.getItem('token')
    if (!token) return
    try {
      const res = await fetch(`/api/favorites/locations/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) setLocations(locations.filter(l => l.id !== id))
    } catch (err) { console.error(err) }
  }

  const handleAddRoute = async (e) => {
    e.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      if (!routeForm.origin || !routeForm.destination) {
        alert("Please select valid locations from the dropdown searches.")
        return
      }
      const payload = {
        name: routeForm.name || 'Custom Route',
        origin: routeForm.origin,
        destination: routeForm.destination
      }
      
      const res = await fetch('/api/favorites/routes', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save route')
      const data = await res.json()
      setRoutes([data, ...routes])
      
      setIsAddingRoute(false)
      setRouteForm({ name: '', origin: null, destination: null })
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddLocation = async (e) => {
    e.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      if (!locationForm.location) {
        alert("Please select a valid location from the dropdown search.")
        return
      }
      const payload = {
        name: locationForm.name || 'Custom Location',
        location: locationForm.location
      }
      
      const res = await fetch('/api/favorites/locations', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('Failed to save location')
      const data = await res.json()
      setLocations([data, ...locations])
      
      setIsAddingLocation(false)
      setLocationForm({ name: '', location: null })
    } catch (err) {
      console.error(err)
    }
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
                <PlaceSearch
                  placeholder="Search starting point..."
                  value={routeForm.origin?.name || ''}
                  onSelect={sel => setRouteForm({ ...routeForm, origin: sel })}
                />
              </div>
              <div className={favStyles.inputGroup}>
                <label>Destination</label>
                <PlaceSearch
                  placeholder="Search destination..."
                  value={routeForm.destination?.name || ''}
                  onSelect={sel => setRouteForm({ ...routeForm, destination: sel })}
                />
              </div>
              <div className={favStyles.formActions}>
                <button type="button" className={favStyles.cancelBtn} onClick={() => setIsAddingRoute(false)}>Cancel</button>
                <button type="submit" className={favStyles.submitBtn}>Save</button>
              </div>
            </form>
          )}

          {!isAddingRoute && routes.length === 0 && (
            <div className={favStyles.empty}>No favorite routes saved.</div>
          )}
          {!isAddingRoute && routes.map(route => (
            <div key={route.id} className={favStyles.card} onClick={() => handleRouteClick(route)}>
              <div className={favStyles.cardHeader}>
                <div className={favStyles.cardTitle}>{route.name}</div>
                <button type="button" className={favStyles.deleteBtn} onClick={(e) => handleDeleteRoute(e, route.id)}>×</button>
              </div>
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
                <PlaceSearch
                  placeholder="Search address or place..."
                  value={locationForm.location?.name || ''}
                  onSelect={sel => setLocationForm({ ...locationForm, location: sel })}
                />
              </div>
              <div className={favStyles.formActions}>
                <button type="button" className={favStyles.cancelBtn} onClick={() => setIsAddingLocation(false)}>Cancel</button>
                <button type="submit" className={favStyles.submitBtn}>Save</button>
              </div>
            </form>
          )}

          {!isAddingLocation && locations.length === 0 && (
            <div className={favStyles.empty}>No favorite locations saved.</div>
          )}
          {!isAddingLocation && locations.map(loc => (
            <div key={loc.id} className={favStyles.card} onClick={() => handleLocationClick(loc)}>
              <div className={favStyles.cardHeader}>
                <div className={favStyles.cardTitle}>{loc.name}</div>
                <button type="button" className={favStyles.deleteBtn} onClick={(e) => handleDeleteLocation(e, loc.id)}>×</button>
              </div>
              <div className={favStyles.cardDesc}>{loc.location.label}</div>
            </div>
          ))}
        </div>
      </div>

      <SidebarNav 
        isLoggedIn={isLoggedIn} 
        currentView="favorites" 
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
