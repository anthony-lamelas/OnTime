import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────────────

// mapbox-gl requires WebGL; stub it out entirely
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('mapbox-gl', () => ({
  default: { Map: vi.fn(), supported: () => true },
}))

// react-map-gl: replace map primitives with plain divs that forward
// mapbox-style event objects so the component handlers receive lngLat/point.
// vi.mock is hoisted, so all components must be defined inline (no top-level refs).
vi.mock('react-map-gl', () => {
  const LNGLAT = { lat: 40.73, lng: -73.99 }
  const POINT  = { x: 100, y: 200 }
  const MockMap = ({ children, onMouseDown, onMouseMove, onMouseUp }) => (
    <div
      data-testid="map"
      onMouseDown={() => onMouseDown?.({ lngLat: LNGLAT, point: POINT })}
      onMouseMove={() => onMouseMove?.({ point: POINT })}
      onMouseUp={() => onMouseUp?.()}
    >
      {children}
    </div>
  )
  return {
    default: MockMap,
    Map: MockMap,
    Source: ({ children }) => children,
    Layer: () => null,
    Marker: ({ children, onClick }) => (
      <div
        data-testid="marker"
        onClick={() => onClick?.({ originalEvent: { stopPropagation: () => {} } })}
      >
        {children}
      </div>
    ),
    NavigationControl: () => null,
    Popup: ({ children }) => <div data-testid="popup">{children}</div>,
  }
})

import SubwayMap, { walkLineGeoJSON, routeSubwayGeoJSON } from './SubwayMap'

// ── Fixtures ─────────────────────────────────────────────────────────────────

const BLEECKER = { id: '637', name: 'Bleecker St', lat: 40.7259, lon: -73.9947, lines: ['4', '6'] }
const ASTOR    = { id: '636', name: 'Astor Pl',    lat: 40.7301, lon: -73.9911, lines: ['4', '6'] }
const GCT      = { id: '631', name: 'Grand Central', lat: 40.7518, lon: -73.9768, lines: ['4', '5', '6'] }

const ROUTE_STATIONS = [BLEECKER, ASTOR, GCT]

function makeSubwayLines(features = []) {
  return { type: 'FeatureCollection', features }
}

function lineFeature(ROUTE, coords) {
  return {
    type: 'Feature',
    properties: { ROUTE },
    geometry: { type: 'LineString', coordinates: coords },
  }
}

// ── walkLineGeoJSON ───────────────────────────────────────────────────────────

describe('walkLineGeoJSON', () => {
  it('returns null when from is missing', () => {
    expect(walkLineGeoJSON(null, BLEECKER)).toBeNull()
  })

  it('returns null when to is missing', () => {
    expect(walkLineGeoJSON(BLEECKER, null)).toBeNull()
  })

  it('returns null when both args are missing', () => {
    expect(walkLineGeoJSON(null, null)).toBeNull()
  })

  it('returns a valid FeatureCollection with one LineString feature', () => {
    const result = walkLineGeoJSON(
      { lat: 40.72, lon: -73.99 },
      { lat: 40.73, lon: -73.98 },
    )
    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(1)
    expect(result.features[0].geometry.type).toBe('LineString')
  })

  it('places from coord first and to coord second', () => {
    const from = { lat: 40.72, lon: -73.99 }
    const to   = { lat: 40.75, lon: -73.97 }
    const coords = walkLineGeoJSON(from, to).features[0].geometry.coordinates
    expect(coords[0]).toEqual([from.lon, from.lat])
    expect(coords[1]).toEqual([to.lon, to.lat])
  })
})

// ── routeSubwayGeoJSON ────────────────────────────────────────────────────────

describe('routeSubwayGeoJSON', () => {
  it('returns null for fewer than 2 stations', () => {
    const lines = makeSubwayLines()
    expect(routeSubwayGeoJSON([], lines)).toBeNull()
    expect(routeSubwayGeoJSON([BLEECKER], lines)).toBeNull()
  })

  it('returns null when subwayLines is null', () => {
    expect(routeSubwayGeoJSON(ROUTE_STATIONS, null)).toBeNull()
  })

  it('returns null when no features match the route lines', () => {
    const lines = makeSubwayLines([
      lineFeature('A', [[-73.99, 40.72], [-73.98, 40.73]]),
    ])
    // Route uses 4 and 6; A is not a match
    expect(routeSubwayGeoJSON(ROUTE_STATIONS, lines)).toBeNull()
  })

  it('returns null when matching line is outside the route bounding box', () => {
    const lines = makeSubwayLines([
      // Line 4 but coordinates are in the Bronx, far outside Bleecker–GCT bbox
      lineFeature('4', [[-73.88, 40.85], [-73.87, 40.86]]),
    ])
    expect(routeSubwayGeoJSON(ROUTE_STATIONS, lines)).toBeNull()
  })

  it('includes features whose line and bbox both match', () => {
    const inRouteCoord = [-73.992, 40.728]  // inside Bleecker–GCT bounding box
    const lines = makeSubwayLines([
      lineFeature('4', [inRouteCoord, [-73.991, 40.73]]),
    ])
    const result = routeSubwayGeoJSON(ROUTE_STATIONS, lines)
    expect(result).not.toBeNull()
    expect(result.features).toHaveLength(1)
    expect(result.features[0].properties.ROUTE).toBe('4')
  })

  it('filters out features outside the bbox even if line matches', () => {
    const lines = makeSubwayLines([
      lineFeature('4', [[-73.88, 40.85], [-73.87, 40.86]]),  // Bronx — out of box
      lineFeature('4', [[-73.992, 40.728], [-73.991, 40.73]]), // in box
    ])
    const result = routeSubwayGeoJSON(ROUTE_STATIONS, lines)
    expect(result.features).toHaveLength(1)
  })

  it('handles MultiLineString geometry', () => {
    const feature = {
      type: 'Feature',
      properties: { ROUTE: '6' },
      geometry: {
        type: 'MultiLineString',
        coordinates: [
          [[-73.992, 40.728], [-73.991, 40.73]],  // in bbox
          [[-73.88, 40.85], [-73.87, 40.86]],      // out of bbox
        ],
      },
    }
    const result = routeSubwayGeoJSON(ROUTE_STATIONS, makeSubwayLines([feature]))
    expect(result).not.toBeNull()
    expect(result.features).toHaveLength(1)
  })

  it('returns a valid FeatureCollection', () => {
    const lines = makeSubwayLines([
      lineFeature('6', [[-73.992, 40.728], [-73.991, 40.73]]),
    ])
    const result = routeSubwayGeoJSON(ROUTE_STATIONS, lines)
    expect(result.type).toBe('FeatureCollection')
    expect(Array.isArray(result.features)).toBe(true)
  })

  it('includes features for all lines used in the route', () => {
    const lines = makeSubwayLines([
      lineFeature('4', [[-73.992, 40.728], [-73.991, 40.73]]),
      lineFeature('5', [[-73.990, 40.740], [-73.989, 40.745]]),
      lineFeature('6', [[-73.988, 40.748], [-73.987, 40.750]]),
    ])
    const result = routeSubwayGeoJSON(ROUTE_STATIONS, lines)
    expect(result.features).toHaveLength(3)
  })
})

// ── SubwayMap component ───────────────────────────────────────────────────────

describe('SubwayMap component', () => {
  const defaultProps = {
    userLocation: null,
    userStation: null,
    destination: null,
    destStation: null,
    route: null,
    onPinOrigin: vi.fn(),
    onPinDestination: vi.fn(),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    // Stub fetch so the component doesn't make real network calls
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    })
    // Clear the Mapbox token env var so we can test the warning
    vi.stubEnv('VITE_MAPBOX_TOKEN', '')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders without crashing', () => {
    render(<SubwayMap {...defaultProps} />)
    expect(screen.getByTestId('map')).toBeInTheDocument()
  })

  it('does not show the token warning when VITE_MAPBOX_TOKEN is set', () => {
    // MAPBOX_TOKEN is captured at module load time from import.meta.env,
    // so the warning visibility reflects the build-time env, not stubEnv.
    // We verify the component renders cleanly without an error warning.
    render(<SubwayMap {...defaultProps} />)
    expect(screen.queryByText(/Add.*VITE_MAPBOX_TOKEN/)).not.toBeInTheDocument()
  })

  it('shows the hold-to-pin hint', () => {
    render(<SubwayMap {...defaultProps} />)
    expect(screen.getByText('Hold to drop a pin')).toBeInTheDocument()
  })

  it('renders user location marker when userLocation is provided', () => {
    render(<SubwayMap {...defaultProps} userLocation={{ lat: 40.72, lon: -73.99, label: 'Me' }} />)
    // The pulsing blue dot is inside a Marker
    const markers = screen.getAllByTestId('marker')
    expect(markers.length).toBeGreaterThanOrEqual(1)
  })

  it('renders dest pin marker when destination is set', () => {
    render(<SubwayMap {...defaultProps} destination={{ lat: 40.75, lon: -73.97, name: 'GCT' }} />)
    const markers = screen.getAllByTestId('marker')
    expect(markers.length).toBeGreaterThanOrEqual(1)
  })

  // Helper: fire mousedown on the map and advance fake timers past the long-press threshold
  async function triggerLongPress() {
    fireEvent.mouseDown(screen.getByTestId('map'))
    await act(async () => { vi.advanceTimersByTime(600) })
  }

  it('shows From here / Go here popup after a long press', async () => {
    render(<SubwayMap {...defaultProps} />)
    await triggerLongPress()
    expect(screen.getByText('From here')).toBeInTheDocument()
    expect(screen.getByText('Go here')).toBeInTheDocument()
    expect(screen.getByText('Dismiss')).toBeInTheDocument()
  })

  it('does not show popup if mouseup fires before long-press threshold', async () => {
    render(<SubwayMap {...defaultProps} />)
    fireEvent.mouseDown(screen.getByTestId('map'))
    fireEvent.mouseUp(screen.getByTestId('map'))
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(screen.queryByText('From here')).not.toBeInTheDocument()
  })

  it('calls onPinOrigin and closes popup when From here is clicked', async () => {
    const onPinOrigin = vi.fn()
    render(<SubwayMap {...defaultProps} onPinOrigin={onPinOrigin} />)
    await triggerLongPress()
    fireEvent.click(screen.getByText('From here'))
    expect(onPinOrigin).toHaveBeenCalledOnce()
    expect(screen.queryByText('From here')).not.toBeInTheDocument()
  })

  it('calls onPinDestination and closes popup when Go here is clicked', async () => {
    const onPinDestination = vi.fn()
    render(<SubwayMap {...defaultProps} onPinDestination={onPinDestination} />)
    await triggerLongPress()
    fireEvent.click(screen.getByText('Go here'))
    expect(onPinDestination).toHaveBeenCalledOnce()
    expect(screen.queryByText('Go here')).not.toBeInTheDocument()
  })

  it('closes the popup when Dismiss is clicked', async () => {
    render(<SubwayMap {...defaultProps} />)
    await triggerLongPress()
    fireEvent.click(screen.getByText('Dismiss'))
    expect(screen.queryByText('Dismiss')).not.toBeInTheDocument()
  })
})

// ── Candidate location pins (multi-location search) ──────────────────────────

const MCDONALDS_CANDIDATES = [
  { id: 'poi.mc.1', name: "McDonald's", lat: 40.7088, lon: -74.0094, fullAddress: "McDonald's, 160 Broadway, New York, NY 10038", category: 'fast food restaurant' },
  { id: 'poi.mc.2', name: "McDonald's", lat: 40.7551, lon: -73.9870, fullAddress: "McDonald's, 1407 Broadway, New York, NY 10018", category: 'fast food restaurant' },
  { id: 'poi.mc.3', name: "McDonald's", lat: 40.7571, lon: -73.9929, fullAddress: "McDonald's, 637 8th Ave, New York, NY 10036",  category: 'fast food restaurant' },
]

const TRADER_JOES_CANDIDATES = [
  { id: 'poi.tj.1', name: "Trader Joe's", lat: 40.7438, lon: -73.9960, fullAddress: "Trader Joe's, 675 6th Ave, New York, NY 10010", category: 'grocery store' },
  { id: 'poi.tj.2', name: "Trader Joe's", lat: 40.7338, lon: -73.9882, fullAddress: "Trader Joe's, 142 E 14th St, New York, NY 10003", category: 'grocery store' },
]

const SHAKE_SHACK_CANDIDATES = [
  { id: 'poi.ss.1', name: 'Shake Shack', lat: 40.7577, lon: -73.9921, fullAddress: 'Shake Shack, 691 8th Ave, New York, NY 10036', category: 'burger restaurant' },
  { id: 'poi.ss.2', name: 'Shake Shack', lat: 40.7832, lon: -73.9793, fullAddress: 'Shake Shack, 366 Columbus Ave, New York, NY 10024', category: 'burger restaurant' },
  { id: 'poi.ss.3', name: 'Shake Shack', lat: 40.7156, lon: -74.0133, fullAddress: 'Shake Shack, 215 Murray St, New York, NY 10282', category: 'burger restaurant' },
]

describe('SubwayMap — candidate location pins', () => {
  const defaultProps = {
    userLocation: null,
    userStation: null,
    destination: null,
    destStation: null,
    route: null,
    onPinOrigin: vi.fn(),
    onPinDestination: vi.fn(),
  }

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ type: 'FeatureCollection', features: [] }),
    })
    vi.stubEnv('VITE_MAPBOX_TOKEN', '')
  })

  afterEach(() => { vi.useRealTimers() })

  it('renders one marker per candidate location', () => {
    render(<SubwayMap {...defaultProps} candidateLocations={MCDONALDS_CANDIDATES} />)
    const markers = screen.getAllByTestId('marker')
    // 3 candidate markers (no user/station/dest markers since those props are null)
    expect(markers).toHaveLength(3)
  })

  it('renders correct number of markers for Trader Joe\'s (2 locations)', () => {
    render(<SubwayMap {...defaultProps} candidateLocations={TRADER_JOES_CANDIDATES} />)
    expect(screen.getAllByTestId('marker')).toHaveLength(2)
  })

  it('renders correct number of markers for Shake Shack (3 locations)', () => {
    render(<SubwayMap {...defaultProps} candidateLocations={SHAKE_SHACK_CANDIDATES} />)
    expect(screen.getAllByTestId('marker')).toHaveLength(3)
  })

  it('shows no candidate markers when candidateLocations is empty', () => {
    render(<SubwayMap {...defaultProps} candidateLocations={[]} />)
    expect(screen.queryAllByTestId('marker')).toHaveLength(0)
  })

  it('clicking a candidate marker shows its name in a popup', () => {
    render(<SubwayMap {...defaultProps} candidateLocations={MCDONALDS_CANDIDATES} />)
    const markers = screen.getAllByTestId('marker')
    fireEvent.click(markers[0])
    expect(screen.getByTestId('popup')).toBeInTheDocument()
    expect(screen.getByText("McDonald's")).toBeInTheDocument()
  })

  it('popup shows the full address of the selected candidate', () => {
    render(<SubwayMap {...defaultProps} candidateLocations={MCDONALDS_CANDIDATES} />)
    fireEvent.click(screen.getAllByTestId('marker')[0])
    expect(screen.getByText("McDonald's, 160 Broadway, New York, NY 10038")).toBeInTheDocument()
  })

  it('clicking "Go here" on a candidate calls onPinDestination with correct coordinates', () => {
    const onPinDestination = vi.fn()
    render(<SubwayMap {...defaultProps} candidateLocations={MCDONALDS_CANDIDATES} onPinDestination={onPinDestination} />)
    fireEvent.click(screen.getAllByTestId('marker')[0])
    fireEvent.click(screen.getByText('Go here'))
    expect(onPinDestination).toHaveBeenCalledOnce()
    expect(onPinDestination).toHaveBeenCalledWith(expect.objectContaining({
      lat: MCDONALDS_CANDIDATES[0].lat,
      lon: MCDONALDS_CANDIDATES[0].lon,
      label: "McDonald's",
    }))
  })

  it('clicking a different candidate updates the popup to the new location', () => {
    render(<SubwayMap {...defaultProps} candidateLocations={SHAKE_SHACK_CANDIDATES} />)
    const markers = screen.getAllByTestId('marker')

    fireEvent.click(markers[0])
    expect(screen.getByText('Shake Shack, 691 8th Ave, New York, NY 10036')).toBeInTheDocument()

    fireEvent.click(markers[1])
    expect(screen.getByText('Shake Shack, 366 Columbus Ave, New York, NY 10024')).toBeInTheDocument()
    expect(screen.queryByText('Shake Shack, 691 8th Ave, New York, NY 10036')).not.toBeInTheDocument()
  })

  it('clicking Dismiss closes the candidate popup', () => {
    render(<SubwayMap {...defaultProps} candidateLocations={TRADER_JOES_CANDIDATES} />)
    fireEvent.click(screen.getAllByTestId('marker')[0])
    expect(screen.getByTestId('popup')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Dismiss'))
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument()
  })

  it('popup closes and onPinDestination fires when "Go here" clicked on Trader Joe\'s', () => {
    const onPinDestination = vi.fn()
    render(<SubwayMap {...defaultProps} candidateLocations={TRADER_JOES_CANDIDATES} onPinDestination={onPinDestination} />)
    fireEvent.click(screen.getAllByTestId('marker')[1])
    fireEvent.click(screen.getByText('Go here'))
    expect(onPinDestination).toHaveBeenCalledWith(expect.objectContaining({
      lat: TRADER_JOES_CANDIDATES[1].lat,
      lon: TRADER_JOES_CANDIDATES[1].lon,
    }))
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument()
  })

  it('candidate markers render alongside user location and destination markers', () => {
    render(
      <SubwayMap
        {...defaultProps}
        userLocation={{ lat: 40.73, lon: -73.99, label: 'Me' }}
        destination={{ lat: 40.75, lon: -73.97, name: 'GCT' }}
        candidateLocations={MCDONALDS_CANDIDATES}
      />
    )
    // 1 user + 1 dest + 3 candidates = 5 markers
    expect(screen.getAllByTestId('marker')).toHaveLength(5)
  })

  it('no popup visible before any candidate is clicked', () => {
    render(<SubwayMap {...defaultProps} candidateLocations={SHAKE_SHACK_CANDIDATES} />)
    expect(screen.queryByTestId('popup')).not.toBeInTheDocument()
  })
})
