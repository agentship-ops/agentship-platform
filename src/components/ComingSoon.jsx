export default function ComingSoon({ title, icon, description, phase = 'Phase 2' }) {
  return (
    <div style={styles.wrap}>
      <i className={`ti ${icon}`} aria-hidden="true" style={styles.icon} />
      <h2 style={styles.title}>{title}</h2>
      <p style={styles.desc}>{description}</p>
      <div style={styles.badge}>{phase}</div>
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
    color: '#2a2a2a',
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
