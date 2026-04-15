import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./SidebarNav', () => ({
  default: () => <div data-testid="sidebar-nav" />,
}))

import TripPlanner from './TripPlanner'

// ── Manhattan POI fixtures ───────────────────────────────────────────────────

// Search Box suggest response — no coordinates, just names/ids for dropdown
function makeSuggestResponse(name, poiCategory, count = 3) {
  return {
    suggestions: Array.from({ length: count }, (_, i) => ({
      mapbox_id: `poi.${name.replace(/\W/g, '_')}.${i}`,
      name,
      feature_type: 'poi',
      place_formatted: 'New York, NY',
      poi_category: [poiCategory],
      maki: poiCategory,
    })),
  }
}

// Geocoding v5 response — includes real Manhattan coordinates
const GEO_FIXTURES = {
  "McDonald's": {
    type: 'FeatureCollection',
    features: [
      { id: 'poi.mc.1', type: 'Feature', text: "McDonald's", place_name: "McDonald's, 160 Broadway, New York, NY 10038", geometry: { type: 'Point', coordinates: [-74.0094, 40.7088] }, properties: { category: 'fast food restaurant' } },
      { id: 'poi.mc.2', type: 'Feature', text: "McDonald's", place_name: "McDonald's, 1407 Broadway, New York, NY 10018", geometry: { type: 'Point', coordinates: [-73.9870, 40.7551] }, properties: { category: 'fast food restaurant' } },
      { id: 'poi.mc.3', type: 'Feature', text: "McDonald's", place_name: "McDonald's, 637 8th Ave, New York, NY 10036", geometry: { type: 'Point', coordinates: [-73.9929, 40.7571] }, properties: { category: 'fast food restaurant' } },
      { id: 'poi.mc.4', type: 'Feature', text: "McDonald's", place_name: "McDonald's, 250 W 34th St, New York, NY 10001", geometry: { type: 'Point', coordinates: [-73.9971, 40.7495] }, properties: { category: 'fast food restaurant' } },
    ],
  },
  "Shake Shack": {
    type: 'FeatureCollection',
    features: [
      { id: 'poi.ss.1', type: 'Feature', text: 'Shake Shack', place_name: 'Shake Shack, 691 8th Ave, New York, NY 10036', geometry: { type: 'Point', coordinates: [-73.9921, 40.7577] }, properties: { category: 'burger restaurant' } },
      { id: 'poi.ss.2', type: 'Feature', text: 'Shake Shack', place_name: 'Shake Shack, 366 Columbus Ave, New York, NY 10024', geometry: { type: 'Point', coordinates: [-73.9793, 40.7832] }, properties: { category: 'burger restaurant' } },
      { id: 'poi.ss.3', type: 'Feature', text: 'Shake Shack', place_name: 'Shake Shack, 215 Murray St, New York, NY 10282', geometry: { type: 'Point', coordinates: [-74.0133, 40.7156] }, properties: { category: 'burger restaurant' } },
    ],
  },
  "Trader Joe's": {
    type: 'FeatureCollection',
    features: [
      { id: 'poi.tj.1', type: 'Feature', text: "Trader Joe's", place_name: "Trader Joe's, 675 6th Ave, New York, NY 10010", geometry: { type: 'Point', coordinates: [-73.9960, 40.7438] }, properties: { category: 'grocery store' } },
      { id: 'poi.tj.2', type: 'Feature', text: "Trader Joe's", place_name: "Trader Joe's, 142 E 14th St, New York, NY 10003", geometry: { type: 'Point', coordinates: [-73.9882, 40.7338] }, properties: { category: 'grocery store' } },
      { id: 'poi.tj.3', type: 'Feature', text: "Trader Joe's", place_name: "Trader Joe's, 2073 Broadway, New York, NY 10023", geometry: { type: 'Point', coordinates: [-73.9840, 40.7847] }, properties: { category: 'grocery store' } },
    ],
  },
  "Whole Foods": {
    type: 'FeatureCollection',
    features: [
      { id: 'poi.wf.1', type: 'Feature', text: 'Whole Foods Market', place_name: 'Whole Foods Market, 4 Union Square S, New York, NY 10003', geometry: { type: 'Point', coordinates: [-73.9902, 40.7351] }, properties: { category: 'grocery store' } },
      { id: 'poi.wf.2', type: 'Feature', text: 'Whole Foods Market', place_name: 'Whole Foods Market, 250 7th Ave, New York, NY 10001', geometry: { type: 'Point', coordinates: [-74.0001, 40.7453] }, properties: { category: 'grocery store' } },
      { id: 'poi.wf.3', type: 'Feature', text: 'Whole Foods Market', place_name: 'Whole Foods Market, 808 Columbus Ave, New York, NY 10025', geometry: { type: 'Point', coordinates: [-73.9756, 40.7841] }, properties: { category: 'grocery store' } },
    ],
  },
  "Starbucks": {
    type: 'FeatureCollection',
    features: [
      { id: 'poi.sb.1', type: 'Feature', text: 'Starbucks', place_name: 'Starbucks, 1585 Broadway, New York, NY 10036', geometry: { type: 'Point', coordinates: [-73.9858, 40.7582] }, properties: { category: 'coffee shop' } },
      { id: 'poi.sb.2', type: 'Feature', text: 'Starbucks', place_name: 'Starbucks, 100 Park Ave, New York, NY 10017',   geometry: { type: 'Point', coordinates: [-73.9780, 40.7518] }, properties: { category: 'coffee shop' } },
      { id: 'poi.sb.3', type: 'Feature', text: 'Starbucks', place_name: 'Starbucks, 30 Rockefeller Plaza, New York, NY 10112', geometry: { type: 'Point', coordinates: [-73.9784, 40.7589] }, properties: { category: 'coffee shop' } },
      { id: 'poi.sb.4', type: 'Feature', text: 'Starbucks', place_name: 'Starbucks, 450 Park Ave, New York, NY 10022',   geometry: { type: 'Point', coordinates: [-73.9714, 40.7586] }, properties: { category: 'coffee shop' } },
      { id: 'poi.sb.5', type: 'Feature', text: 'Starbucks', place_name: 'Starbucks, 200 Broadway, New York, NY 10038',   geometry: { type: 'Point', coordinates: [-74.0087, 40.7097] }, properties: { category: 'coffee shop' } },
    ],
  },
  "NYU": {
    type: 'FeatureCollection',
    features: [
      { id: 'poi.nyu.1', type: 'Feature', text: 'New York University', place_name: 'New York University, 70 Washington Square S, New York, NY 10012', geometry: { type: 'Point', coordinates: [-73.9965, 40.7295] }, properties: { category: 'university' } },
    ],
  },
  "Tandon": {
    type: 'FeatureCollection',
    features: [
      { id: 'poi.tan.1', type: 'Feature', text: 'NYU Tandon School of Engineering', place_name: 'NYU Tandon School of Engineering, 6 MetroTech Center, Brooklyn, NY 11201', geometry: { type: 'Point', coordinates: [-73.9874, 40.6942] }, properties: { category: 'university' } },
    ],
  },
}

const EMPTY_GEO = { type: 'FeatureCollection', features: [] }

// Retrieve response (used when a dropdown suggestion is selected)
function makeRetrieveResponse(lon, lat) {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lon, lat] },
      properties: {},
    }],
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetch(queryOverrides = {}) {
  return vi.fn(url => {
    if (url.includes('searchbox/v1/suggest')) {
      const q = decodeURIComponent(url.match(/q=([^&]+)/)?.[1] || '')
      const name = Object.keys(GEO_FIXTURES).find(k => q.toLowerCase().includes(k.toLowerCase())) || q
      const category = GEO_FIXTURES[name]?.features[0]?.properties?.category || 'restaurant'
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeSuggestResponse(name, category)) })
    }
    if (url.includes('geocoding/v5/mapbox.places')) {
      const raw = url.match(/mapbox\.places\/(.+?)\.json/)?.[1] || ''
      const q = decodeURIComponent(raw)
      const override = Object.keys(queryOverrides).find(k => q.toLowerCase().includes(k.toLowerCase()))
      const fixture = override ? queryOverrides[override] : Object.keys(GEO_FIXTURES).reduce((acc, k) => {
        if (q.toLowerCase().includes(k.toLowerCase())) return GEO_FIXTURES[k]
        return acc
      }, EMPTY_GEO)
      return Promise.resolve({ ok: true, json: () => Promise.resolve(fixture) })
    }
    if (url.includes('searchbox/v1/retrieve')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(makeRetrieveResponse(-73.99, 40.73)) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

const defaultProps = {
  origin: null,
  locating: false,
  locError: null,
  destination: null,
  plan: null,
  planning: false,
  onOriginChange: vi.fn(),
  onDestChange: vi.fn(),
  onRequestGPS: vi.fn(),
  onReset: vi.fn(),
  isLoggedIn: false,
  setIsLoggedIn: vi.fn(),
  setView: vi.fn(),
  selectedLine: null,
  onLineSelect: vi.fn(),
  onCandidatesChange: vi.fn(),
}

async function typeAndSearch(input, text) {
  fireEvent.change(input, { target: { value: text } })
  await act(async () => { vi.advanceTimersByTime(350) })
  await act(async () => {}) // flush microtasks
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PlaceSearch — POI alias queries', () => {
  let onCandidatesChange

  beforeEach(() => {
    vi.useFakeTimers()
    onCandidatesChange = vi.fn()
    global.fetch = makeFetch()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('calls both Search Box suggest and Geocoding v5 in parallel on each query', async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, "McDonald's")

    const urls = global.fetch.mock.calls.map(c => c[0])
    expect(urls.some(u => u.includes('searchbox/v1/suggest'))).toBe(true)
    expect(urls.some(u => u.includes('geocoding/v5/mapbox.places'))).toBe(true)
  })

  it('passes bbox and proximity to both API calls', async () => {
    const origin = { lat: 40.7128, lon: -74.0060 }
    render(<TripPlanner {...defaultProps} origin={origin} onCandidatesChange={onCandidatesChange} />)

    const input = screen.getByPlaceholderText('Search destination…')
    await typeAndSearch(input, 'Starbucks')

    const urls = global.fetch.mock.calls.map(c => c[0])
    urls.forEach(u => {
      expect(u).toContain('bbox=-74.3,40.4,-73.7,40.9')
    })
    const suggestUrl = urls.find(u => u.includes('searchbox/v1/suggest'))
    expect(suggestUrl).toContain(`proximity=${origin.lon},${origin.lat}`)
  })

  // ── Restaurants ───────────────────────────────────────────────────────────

  it("returns 4 candidate pins for McDonald's (Financial District, Midtown, Hell's Kitchen, Penn Station)", async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, "McDonald's")

    expect(onCandidatesChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "McDonald's", lat: 40.7088, lon: -74.0094 }), // 160 Broadway
        expect.objectContaining({ name: "McDonald's", lat: 40.7551, lon: -73.9870 }), // 1407 Broadway
        expect.objectContaining({ name: "McDonald's", lat: 40.7571, lon: -73.9929 }), // 8th Ave
        expect.objectContaining({ name: "McDonald's", lat: 40.7495, lon: -73.9971 }), // 34th St
      ])
    )
    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(candidates).toHaveLength(4)
  })

  it("returns 3 Shake Shack locations across Manhattan", async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, 'Shake Shack')

    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(candidates).toHaveLength(3)
    expect(candidates.every(c => c.name === 'Shake Shack')).toBe(true)

    // Verify spread across Manhattan (lat range 40.71 – 40.78)
    const lats = candidates.map(c => c.lat)
    expect(Math.max(...lats) - Math.min(...lats)).toBeGreaterThan(0.03)
  })

  it("returns 5 Starbucks locations spread across Manhattan", async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, 'Starbucks')

    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(candidates).toHaveLength(5)
    // All in Manhattan longitude range
    candidates.forEach(c => {
      expect(c.lon).toBeGreaterThan(-74.05)
      expect(c.lon).toBeLessThan(-73.96)
    })
  })

  // ── Grocery Stores ────────────────────────────────────────────────────────

  it("returns 3 Trader Joe's grocery locations (Chelsea, Union Square, UWS)", async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, "Trader Joe's")

    expect(onCandidatesChange).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ lon: -73.9960, lat: 40.7438 }), // Chelsea
        expect.objectContaining({ lon: -73.9882, lat: 40.7338 }), // Union Square
        expect.objectContaining({ lon: -73.9840, lat: 40.7847 }), // UWS
      ])
    )
    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(candidates).toHaveLength(3)
  })

  it("returns 3 Whole Foods locations in Manhattan", async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, 'Whole Foods')

    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(candidates).toHaveLength(3)
    candidates.forEach(c => {
      expect(c.name).toBe('Whole Foods Market')
      expect(c.fullAddress).toMatch(/New York, NY/)
    })
  })

  it('each grocery candidate has a fullAddress with street-level detail', async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, "Trader Joe's")

    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    candidates.forEach(c => {
      expect(c.fullAddress).toBeTruthy()
      // Address should include a street number
      expect(c.fullAddress).toMatch(/\d+/)
    })
  })

  // ── Universities / Unique POIs ────────────────────────────────────────────

  it('returns a single candidate for NYU (unique institution)', async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, 'NYU')

    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({
      name: 'New York University',
      lat: 40.7295,
      lon: -73.9965,
    })
  })

  it('finds Tandon School of Engineering in Brooklyn (near Manhattan)', async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, 'Tandon')

    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(candidates[0]).toMatchObject({
      name: 'NYU Tandon School of Engineering',
      lat: 40.6942,
      lon: -73.9874,
    })
    expect(candidates[0].fullAddress).toContain('MetroTech')
  })

  // ── Candidate coordinate validity ─────────────────────────────────────────

  it('all candidate coordinates are within the NYC bounding box', async () => {
    const queries = ["McDonald's", 'Shake Shack', "Trader Joe's", 'Whole Foods', 'Starbucks']
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    for (const q of queries) {
      fireEvent.change(input, { target: { value: q } })
      await act(async () => { vi.advanceTimersByTime(350) })
      await act(async () => {})
    }

    // Check last batch of candidates (Starbucks)
    const allCalls = onCandidatesChange.mock.calls.filter(c => c[0].length > 0)
    allCalls.forEach(([candidates]) => {
      candidates.forEach(({ lat, lon }) => {
        expect(lat).toBeGreaterThan(40.4)
        expect(lat).toBeLessThan(40.9)
        expect(lon).toBeGreaterThan(-74.3)
        expect(lon).toBeLessThan(-73.7)
      })
    })
  })

  it('features have valid numeric coordinates (not NaN or null)', async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, "McDonald's")

    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    candidates.forEach(c => {
      expect(typeof c.lat).toBe('number')
      expect(typeof c.lon).toBe('number')
      expect(isNaN(c.lat)).toBe(false)
      expect(isNaN(c.lon)).toBe(false)
    })
  })

  // ── Lifecycle: clearing and selection ─────────────────────────────────────

  it('clears candidates when search input is cleared', async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, "McDonald's")
    expect(onCandidatesChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ name: "McDonald's" })]))

    // Clear the input
    fireEvent.change(input, { target: { value: '' } })
    await act(async () => { vi.advanceTimersByTime(350) })
    await act(async () => {})

    expect(onCandidatesChange).toHaveBeenLastCalledWith([])
  })

  it('replaces candidates when query changes to a different POI', async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, "Shake Shack")
    const firstCandidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(firstCandidates[0].name).toBe('Shake Shack')

    await typeAndSearch(input, "Trader Joe's")
    const secondCandidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(secondCandidates[0].name).toBe("Trader Joe's")

    // No bleed between results
    expect(secondCandidates.some(c => c.name === 'Shake Shack')).toBe(false)
  })

  it('clears candidates when dropdown item is selected (retrieve completes)', async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, "McDonald's")
    expect(onCandidatesChange).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ name: "McDonald's" })]))

    // Select the first dropdown item (multiple spans share the name — target the first li)
    const items = screen.getAllByText("McDonald's")
    const firstLi = items[0].closest('li') || items[0]
    fireEvent.mouseDown(firstLi)
    await act(async () => {})

    expect(onCandidatesChange).toHaveBeenLastCalledWith([])
  })

  it('shows dropdown results from Search Box suggest alongside map candidates', async () => {
    render(<TripPlanner {...defaultProps} onCandidatesChange={onCandidatesChange} />)
    const input = screen.getByPlaceholderText('Search destination…')

    await typeAndSearch(input, 'Starbucks')

    // Dropdown items visible
    const items = screen.getAllByText('Starbucks')
    expect(items.length).toBeGreaterThan(0)

    // Map candidates also passed
    const candidates = onCandidatesChange.mock.calls.at(-1)[0]
    expect(candidates.length).toBeGreaterThan(0)
  })
})

// ── Candidate pin SubwayMap integration tests (via SubwayMap.test.jsx) ────────
// See SubwayMap.test.jsx for marker rendering and click-to-select tests
