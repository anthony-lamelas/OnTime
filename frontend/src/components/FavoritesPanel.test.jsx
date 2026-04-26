import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import FavoritesPanel from './FavoritesPanel'

vi.mock('./SidebarNav', () => ({
  default: () => <div data-testid="sidebar-nav" />,
}))

const defaultProps = {
  setView: vi.fn(),
  isLoggedIn: true,
  setIsLoggedIn: vi.fn(),
  onSelectRoute: vi.fn()
}

describe('FavoritesPanel Component', () => {
    beforeEach(() => {
        Storage.prototype.getItem = vi.fn(() => 'fake-jwt-token')
        global.fetch = vi.fn((url) => {
            if (url.includes('/api/favorites/routes')) {
                return Promise.resolve({ ok: true, json: async () => [] })
            }
            if (url.includes('/api/favorites/locations')) {
                return Promise.resolve({ ok: true, json: async () => [] })
            }
            return Promise.resolve({ ok: true, json: async () => [] })
        })
    })

    afterEach(() => {
        vi.clearAllMocks()
    })

    it('renders empty state correctly when no favorites exist', async () => {
        render(<FavoritesPanel {...defaultProps} />)
        
        expect(screen.getByText('Favorites')).toBeInTheDocument()
        await waitFor(() => {
            expect(screen.getByText('No favorite routes saved.')).toBeInTheDocument()
            expect(screen.getByText('No favorite locations saved.')).toBeInTheDocument()
        })
    })

    it('fetches and renders favorite components accurately referencing mock API values', async () => {
        const mockRoutes = [
            { id: 1, name: 'Commute to Work', origin: { label: 'Wall St' }, destination: { label: 'Times Square' } }
        ]
        const mockLocations = [
            { id: 1, name: 'Home', location: { label: '123 Fake St' } }
        ]
        
        global.fetch = vi.fn((url) => {
            if (url.includes('/api/favorites/routes')) {
                return Promise.resolve({ ok: true, json: async () => mockRoutes })
            }
            if (url.includes('/api/favorites/locations')) {
                return Promise.resolve({ ok: true, json: async () => mockLocations })
            }
            return Promise.resolve({ ok: true, json: async () => [] })
        })
        
        // Mock LocalStorage JWT logic
        Storage.prototype.getItem = vi.fn(() => 'fake-jwt-token')

        render(<FavoritesPanel {...defaultProps} />)
        
        await waitFor(() => {
            expect(screen.getByText('Commute to Work')).toBeInTheDocument()
            expect(screen.getByText('Wall St → Times Square')).toBeInTheDocument()
            expect(screen.getByText('Home')).toBeInTheDocument()
            expect(screen.getByText('123 Fake St')).toBeInTheDocument()
        })
        
        // Test intercept authorization logic
        expect(global.fetch).toHaveBeenCalledWith('/api/favorites/routes', expect.objectContaining({
            headers: { Authorization: "Bearer fake-jwt-token" }
        }))
    })
})
