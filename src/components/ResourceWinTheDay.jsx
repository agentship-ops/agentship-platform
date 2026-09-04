import { useState } from 'react'

const VERSIONS = {
  v1: {
    label: 'Activity first',
    file: '/win-the-day-v1.pdf',
    note: 'Starts with daily nurtures at the base and builds up to closed clients.',
  },
  v2: {
    label: 'Results first',
    file: '/win-the-day-v2.pdf',
    note: 'Starts with clients at the top and works down to your daily nurtures.',
  },
}

export default function ResourceWinTheDay() {
  const [version, setVersion] = useState('v1')
  const active = VERSIONS[version]

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.eyebrow}>Resource Library</div>
        <h1 style={styles.title}>Win the Day</h1>
        <p style={styles.subtitle}>
          Track the whole funnel on one page — daily nurtures, weekly appointments,
          clients taken, under contract, and closed. The same climb your Leaderboard measures.
        </p>
      </div>

      <div style={styles.card}>
        <div style={styles.controls}>
          <div style={styles.toggle}>
            {Object.keys(VERSIONS).map(v => {
              const on = version === v
              return (
                <button
                  key={v}
                  onClick={() => setVersion(v)}
                  style={{ ...styles.pill, ...(on ? styles.pillOn : {}) }}
                >
                  {VERSIONS[v].label}
                </button>
              )
            })}
          </div>

          <div style={styles.actions}>
            <a
              href={active.file}
              download="Win the Day.pdf"
              style={styles.download}
            >
              <i className="ti ti-download" aria-hidden="true" style={{ fontSize: '15px' }} />
              Download
            </a>
            <button
              onClick={() => window.open(active.file, '_blank', 'noopener')}
              style={styles.print}
            >
              <i className="ti ti-printer" aria-hidden="true" style={{ fontSize: '15px' }} />
              Print
            </button>
          </div>
        </div>

        <p style={styles.note}>{active.note}</p>

        <div style={styles.previewWrap}>
          <iframe
            key={version}
            src={`${active.file}#toolbar=0&view=FitH`}
            title={`Win the Day sheet — ${active.label}`}
            style={styles.iframe}
          />
        </div>
      </div>

      <p style={styles.hint}>
        <i className="ti ti-info-circle" aria-hidden="true" style={{ fontSize: '13px' }} />
        {' '}If the preview doesn&apos;t load on your phone, tap Download to open it.
      </p>
    </div>
  )
}

const styles = {
  page: {
    padding: '28px 32px',
    maxWidth: '860px',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '7px',
  },
  eyebrow: {
    fontSize: '11px',
    fontWeight: '600',
    letterSpacing: '1.4px',
    textTransform: 'uppercase',
    color: '#C9A84C',
  },
  title: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: '-0.3px',
  },
  subtitle: {
    fontSize: '13px',
    color: '#888',
    lineHeight: 1.7,
    maxWidth: '620px',
  },
  card: {
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
    borderRadius: '12px',
    padding: '20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '12px',
  },
  toggle: {
    display: 'flex',
    gap: '8px',
  },
  pill: {
    fontSize: '12px',
    fontWeight: '600',
    padding: '8px 14px',
    borderRadius: '20px',
    border: '0.5px solid #444',
    background: 'transparent',
    color: '#aaa',
    cursor: 'pointer',
    fontFamily: 'Montserrat, sans-serif',
    transition: 'all 0.15s',
  },
  pillOn: {
    background: '#C9A84C',
    borderColor: '#C9A84C',
    color: '#0A0A0A',
  },
  actions: {
    display: 'flex',
    gap: '10px',
  },
  download: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    fontSize: '12px',
    fontWeight: '600',
    padding: '10px 16px',
    borderRadius: '8px',
    background: '#C9A84C',
    color: '#0A0A0A',
    cursor: 'pointer',
    textDecoration: 'none',
    fontFamily: 'Montserrat, sans-serif',
  },
  print: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '7px',
    fontSize: '12px',
    fontWeight: '600',
    padding: '10px 16px',
    borderRadius: '8px',
    background: 'transparent',
    color: '#FFFFFF',
    border: '0.5px solid #444',
    cursor: 'pointer',
    fontFamily: 'Montserrat, sans-serif',
  },
  note: {
    fontSize: '12px',
    color: '#777',
    lineHeight: 1.6,
    margin: 0,
  },
  previewWrap: {
    background: '#FFFFFF',
    borderRadius: '8px',
    overflow: 'hidden',
    border: '0.5px solid #2a2a2a',
  },
  iframe: {
    width: '100%',
    height: '640px',
    border: 'none',
    display: 'block',
    background: '#FFFFFF',
  },
  hint: {
    fontSize: '11px',
    color: '#555',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    margin: 0,
  },
}
