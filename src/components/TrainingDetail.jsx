import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function TrainingDetail({ slug }) {
  const [training, setTraining] = useState(null)
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: trainingData } = await supabase
        .from('trainings')
        .select('*')
        .eq('slug', slug)
        .single()

      if (trainingData) {
        const { data: resourceData } = await supabase
          .from('training_resources')
          .select('*')
          .eq('training_id', trainingData.id)
        setResources(resourceData || [])
      }

      setTraining(trainingData)
      setLoading(false)
    }
    load()
  }, [slug])

  if (loading) {
    return <div style={styles.loading}>Loading...</div>
  }

  if (!training) {
    return (
      <div style={styles.wrap}>
        <p style={styles.notFound}>This training isn't set up yet.</p>
      </div>
    )
  }

  const videoSrc = training.loom_id
    ? `https://www.loom.com/embed/${training.loom_id}`
    : training.youtube_id
    ? `https://www.youtube.com/embed/${training.youtube_id}`
    : null

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>{training.title}</h1>

      {videoSrc && (
        <div style={styles.videoWrap}>
          <iframe
            src={videoSrc}
            title={training.title}
            style={styles.iframe}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
          />
        </div>
      )}

      {training.description && (
        <p style={styles.description}>{training.description}</p>
      )}

      {training.learn_points && training.learn_points.length > 0 && (
        <div style={styles.learn}>
          <h2 style={styles.learnTitle}>What you'll learn</h2>
          <ul style={styles.learnList}>
            {training.learn_points.map(function (point, i) {
              return (
                <li key={i} style={styles.learnItem}>{point}</li>
              )
            })}
          </ul>
        </div>
      )}

      {resources.length > 0 && (
        <div style={styles.resources}>
          <h2 style={styles.resourcesTitle}>Resources</h2>
          {resources.map(function (r) {
            return (
              <button
                key={r.id}
                onClick={function () { window.open(r.file_url, '_blank', 'noopener,noreferrer') }}
                style={styles.resourceLink}
              >
                <i className="ti ti-file-download" aria-hidden="true" style={styles.resourceIcon} />
                <span>{r.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

const styles = {
  page: {
    padding: '28px 32px',
    maxWidth: '780px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  title: {
    fontSize: '22px',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: '-0.3px',
  },
  videoWrap: {
    position: 'relative',
    width: '100%',
    paddingBottom: '56.25%',
    borderRadius: '10px',
    overflow: 'hidden',
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
  },
  iframe: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    border: 'none',
  },
  description: {
    fontSize: '14px',
    color: '#aaaaaa',
    lineHeight: 1.7,
  },
  learn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  learnTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#C9A84C',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
  },
  learnList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    paddingLeft: '20px',
    margin: 0,
  },
  learnItem: {
    fontSize: '14px',
    color: '#aaaaaa',
    lineHeight: 1.6,
    paddingLeft: '4px',
  },
  resources: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  resourcesTitle: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '4px',
  },
  resourceLink: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    background: '#1E1E1E',
    border: '0.5px solid #2a2a2a',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '13px',
    fontWeight: '500',
    fontFamily: 'Montserrat, sans-serif',
    textAlign: 'left',
    cursor: 'pointer',
  },
  resourceIcon: {
    color: '#C9A84C',
    fontSize: '16px',
  },
  loading: {
    padding: '40px',
    color: '#666',
    fontSize: '13px',
  },
  notFound: {
    color: '#666',
    fontSize: '13px',
  },
}
