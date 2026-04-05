import styles from './SidebarNav.module.css'

export default function SidebarNav({ isLoggedIn, currentView, setView, onLogout }) {
  // If not logged in, we just show a login/register button
  if (!isLoggedIn) {
    return (
      <div className={styles.navContainer}>
        <button 
          className={`${styles.navBtn} ${currentView === 'login' ? styles.active : ''}`}
          onClick={() => setView('login')}
        >
          Login / Register
        </button>
      </div>
    )
  }

  // If logged in, show Favorites, Planned Trips, and Logout
  return (
    <div className={styles.navContainer}>
      <button 
        className={`${styles.navBtn} ${currentView === 'favorites' ? styles.active : ''}`}
        onClick={() => setView('favorites')}
      >
        Favorites
      </button>
      <button 
        className={`${styles.navBtn} ${currentView === 'plannedTrips' ? styles.active : ''}`}
        onClick={() => setView('plannedTrips')}
      >
        Planned Trips
      </button>
      <button 
        className={styles.navBtnLogout}
        onClick={onLogout}
      >
        Logout
      </button>
    </div>
  )
}
