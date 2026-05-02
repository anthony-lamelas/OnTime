import { useState, useRef, useCallback, useEffect, forwardRef, useImperativeHandle } from 'react'
import styles from './PlaceSearch.module.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  }
  throw new Error('Secure UUID generation is unavailable in this environment')
}

const CATEGORIES = {
  pin:      { color: '#6B7280', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C8.686 2 6 4.686 6 8c0 5.25 6 14 6 14s6-8.75 6-14c0-3.314-2.686-6-6-6z"/><circle cx="12" cy="8" r="2"/></svg> },
  food:     { color: '#F97316', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="2" x2="18" y2="8"/><path d="M18 8a4 4 0 0 1-4 4v10"/><line x1="6" y1="2" x2="6" y2="7"/><line x1="4" y1="5" x2="8" y2="5"/><line x1="6" y1="7" x2="6" y2="22"/></svg> },
  coffee:   { color: '#92400E', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 8h2a2 2 0 1 1 0 4h-2"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/></svg> },
  bar:      { color: '#7C3AED', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 2 4 10 20 10 16 2"/><line x1="12" y1="10" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg> },
  hospital: { color: '#EF4444', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> },
  school:   { color: '#2563EB', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 9l10 6 10-6-10-6z"/><path d="M2 17l10 6 10-6"/><line x1="2" y1="13" x2="2" y2="17"/><line x1="22" y1="13" x2="22" y2="17"/></svg> },
  hotel:    { color: '#0891B2', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> },
  park:     { color: '#16A34A', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 0-7 7c0 3 2 5.5 5 6.7V22h4v-6.3c3-1.2 5-3.7 5-6.7a7 7 0 0 0-7-7z"/></svg> },
  museum:   { color: '#9333EA', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 9 12 2 22 9"/><line x1="2" y1="22" x2="22" y2="22"/><rect x="4" y="9" width="3" height="13"/><rect x="10.5" y="9" width="3" height="13"/><rect x="17" y="9" width="3" height="13"/></svg> },
  library:  { color: '#0D9488', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg> },
  subway:   { color: '#0039A6', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="14" rx="3"/><circle cx="9" cy="13" r="1.5"/><circle cx="15" cy="13" r="1.5"/><line x1="12" y1="3" x2="12" y2="7"/><line x1="4" y1="8" x2="20" y2="8"/><path d="M7 17l-2 3"/><path d="M17 17l2 3"/></svg> },
  bus:      { color: '#059669', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6v6"/><path d="M16 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s1 0 1-1V7c0-5-3-5-3-5H5C2 2 2 7 2 7v10c0 1 1 1 1 1h3"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></svg> },
  airport:  { color: '#0EA5E9', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21 4 19.5 2.5S18 2 16.5 3.5L13 7 4.8 5.2 3.4 6.6l7 4.1-2.1 2.1-3.5-.5L3 14l3.6 1.5L8.1 19l1.4-1.4-.5-3.5 2.1-2.1 4.1 7 1.4-1.4z"/></svg> },
  grocery:  { color: '#15803D', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg> },
  shopping: { color: '#DB2777', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg> },
  gym:      { color: '#EA580C', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5h2v11h-2z"/><path d="M15.5 6.5h2v11h-2z"/><path d="M3 9h3.5"/><path d="M17.5 9H21"/><path d="M3 15h3.5"/><path d="M17.5 15H21"/><line x1="8.5" y1="12" x2="15.5" y2="12"/></svg> },
  bank:     { color: '#CA8A04', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 9 12 3 21 9"/><line x1="3" y1="22" x2="21" y2="22"/><line x1="5" y1="9" x2="5" y2="22"/><line x1="9" y1="9" x2="9" y2="22"/><line x1="15" y1="9" x2="15" y2="22"/><line x1="19" y1="9" x2="19" y2="22"/></svg> },
}

const CATEGORY_MAP = {
  restaurant: 'food', food: 'food', pizza: 'food', fast_food: 'food', bakery: 'food',
  cafe: 'coffee', coffee: 'coffee',
  bar: 'bar',
  college: 'school', university: 'school', school: 'school',
  hospital: 'hospital', pharmacy: 'hospital', doctor: 'hospital',
  hotel: 'hotel', lodging: 'hotel',
  park: 'park',
  museum: 'museum',
  library: 'library',
  subway: 'subway', train: 'subway', bus: 'bus',
  airport: 'airport',
  grocery: 'grocery', supermarket: 'grocery',
  shopping: 'shopping',
  gym: 'gym', sports: 'gym',
  bank: 'bank', atm: 'bank',
}

function getCategoryIcon(poiCategories) {
  if (!poiCategories?.length) return CATEGORIES.pin
  for (const cat of poiCategories) {
    const key = cat.toLowerCase().replace(/[\s-]/g, '_')
    if (CATEGORY_MAP[key]) return CATEGORIES[CATEGORY_MAP[key]]
    for (const [k, v] of Object.entries(CATEGORY_MAP)) {
      if (key.includes(k)) return CATEGORIES[v]
    }
  }
  return CATEGORIES.pin
}

const PlaceSearch = forwardRef(function PlaceSearch({ placeholder, userLocation, onSelect, value, onCandidates }, ref) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [retrieving, setRetrieving] = useState(false)
  const debounceRef = useRef(null)
  const sessionTokenRef = useRef(generateUUID())
  const inputRef = useRef(null)

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }))

  useEffect(() => {
    setQuery(value || '')
  }, [value])

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
        sessionTokenRef.current = generateUUID()
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
    sessionTokenRef.current = generateUUID()
  }

  return (
    <div className={styles.searchWrapper}>
      <div className={styles.searchBox}>
        <span className={styles.searchIcon}>{retrieving ? '' : ''}</span>
        <input
          ref={inputRef}
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
            const { color, icon } = s.feature_type === 'poi' ? getCategoryIcon(s.poi_category) : CATEGORIES.pin
            const category = s.poi_category?.[0]
              ? s.poi_category[0].replace(/_/g, ' ')
              : s.feature_type
            return (
              <li key={s.mapbox_id} className={styles.dropdownItem} onMouseDown={() => handleSelect(s)}>
                <div className={styles.dropdownRow}>
                  <span className={styles.placeIcon} style={{ background: color }}>{icon}</span>
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
})

export default PlaceSearch
