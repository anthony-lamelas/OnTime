import Map from 'react-map-gl'
import styles from './LandingPage.module.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

export default function LandingPage({ onGetStarted, onSignIn, onSkip }) {
  return (
    <div className={styles.root}>
      {/* Background map — right portion */}
      <div className={styles.mapPanel}>
        <Map
          initialViewState={{
            longitude: -73.9845,
            latitude: 40.7549,
            zoom: 13.2,
            pitch: 0,
            bearing: -8,
          }}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          interactive={false}
          attributionControl={false}
        />
        <div className={styles.mapFade} />
      </div>

      {/* Left content */}
      <div className={styles.content}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoSymbol}>⊝</span>
            <span className={styles.logoText}>OnTime</span>
          </div>
        </header>

        <main className={styles.hero}>
          <div className={styles.eyebrow}>NYC Subway Planner</div>
          <h1 className={styles.tagline}>
            Know before<br />you go.
          </h1>
          <p className={styles.description}>
            Real-time subway directions, live delay predictions,
            and smart route planning — built for New Yorkers.
          </p>

          <div className={styles.actions}>
            <button className={styles.ctaPrimary} onClick={onGetStarted}>
              Get started
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
            <button className={styles.ctaSecondary} onClick={onSignIn}>
              Sign in
            </button>
          </div>

          <div className={styles.pillRow}>
            <span className={styles.pill} style={{ '--dot': '#22c55e' }}>Live arrivals</span>
            <span className={styles.pill} style={{ '--dot': '#4f6ef7' }}>Smart routing</span>
            <span className={styles.pill} style={{ '--dot': '#f97316' }}>Delay predictions</span>
          </div>

          <button className={styles.skipLink} onClick={onSkip}>
            Continue without an account
          </button>
        </main>

        <footer className={styles.footer}>
          Powered by MTA GTFS-RT data
        </footer>
      </div>
    </div>
  )
}
