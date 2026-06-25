export default function TopBar({ onToggleSidebar }) {
  return (
    <div style={styles.topbar}>
      <button
        onClick={onToggleSidebar}
        aria-label="Toggle sidebar"
        style={styles.hbtn}
      >
        <i className="ti ti-menu-2" aria-hidden="true" />
      </button>

      <div style={styles.brand}>
        <div style={styles.brandMark}>A</div>
        <div style={styles.brandWords}>
          <span style={styles.poweredBy}>Powered by</span>
          <span style={styles.agentship}>Agentship</span>
        </div>
      </div>

      <div style={styles.right}>
        <div style={{ position: 'relative' }}>
          <button aria-label="Notifications" style={styles.iconBtn}>
            <i className="ti ti-bell" aria-hidden="true" />
          </button>
          <div style={styles.notifDot} />
        </div>
        <button aria-label="Settings" style={styles.iconBtn}>
          <i className="ti ti-settings" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

const styles = {
  topbar: {
    height: '54px',
    background: '#0f0f0f',
    borderBottom: '1px solid #2a2a2a',
    display: 'flex',
    alignItems: 'center',
    padding: '0 20px',
    gap: '16px',
    flexShrink: 0,
  },
  hbtn: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    flexShrink: 0,
    fontFamily: 'Montserrat, sans-serif',
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flex: 1,
  },
  brandMark: {
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    background: '#C9A84C',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: '700',
    color: '#0A0A0A',
    flexShrink: 0,
    fontFamily: 'Montserrat, sans-serif',
  },
  brandWords: {
    display: 'flex',
    flexDirection: 'column',
  },
  poweredBy: {
    fontSize: '9px',
    color: '#888',
    letterSpacing: '1.5px',
    textTransform: 'uppercase',
    lineHeight: 1.2,
  },
  agentship: {
    fontSize: '13px',
    fontWeight: '700',
    color: '#C9A84C',
    letterSpacing: '2px',
    textTransform: 'uppercase',
    lineHeight: 1.2,
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  iconBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '8px',
    background: 'transparent',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '17px',
    fontFamily: 'Montserrat, sans-serif',
  },
  notifDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#C9A84C',
    position: 'absolute',
    top: '4px',
    right: '4px',
    pointerEvents: 'none',
  },
}
