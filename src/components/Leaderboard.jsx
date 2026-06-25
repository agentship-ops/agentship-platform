export default function Leaderboard() {
  return (
    <div style={styles.wrap}>
      <i className="ti ti-trophy" aria-hidden="true" style={styles.icon} />
      <h2 style={styles.title}>Leaderboard</h2>
      <p style={styles.desc}>Live agent performance data from Follow Up Boss. Connecting in Phase 2.</p>
      <div style={styles.badge}>Phase 2</div>
    </div>
  )
}

const styles = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    gap: '14px',
    textAlign: 'center',
    padding: '40px',
  },
  icon: {
    fontSize: '40px',
    color: '#C9A84C',
  },
  title: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: '-0.2px',
  },
  desc: {
    fontSize: '13px',
    color: '#555555',
    maxWidth: '280px',
    lineHeight: 1.6,
  },
  badge: {
    padding: '6px 18px',
    borderRadius: '20px',
    border: '0.5px solid #C9A84C',
    color: '#C9A84C',
    fontSize: '12px',
    fontWeight: '500',
    fontFamily: 'Montserrat, sans-serif',
  },
}
