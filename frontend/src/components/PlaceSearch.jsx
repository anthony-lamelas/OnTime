import { useState, useRef, useCallback } from 'react'
import styles from './PlaceSearch.module.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

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

export default function PlaceSearch({ placeholder, userLocation, onSelect, value, onCandidates }) {
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
        {query && !retrieving && <button type="button" className={styles.clearBtn} onMouseDown={handleClear}>×</button>}
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
