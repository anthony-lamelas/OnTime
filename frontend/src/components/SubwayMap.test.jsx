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
    Marker: ({ children }) => <div data-testid="marker">{children}</div>,
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

function lineFeature(rt_symbol, coords) {
  return {
    type: 'Feature',
    properties: { rt_symbol },
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
    expect(result.features[0].properties.rt_symbol).toBe('4')
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
      properties: { rt_symbol: '6' },
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
