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

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>{training.title}</h1>

      <div style={styles.videoWrap}>
        <iframe
          src={`https://www.youtube.com/embed/${training.youtube_id}`}
          title={training.title}
          style={styles.iframe}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>

      {training.description && (
        <p style={styles.description}>{training.description}</p>
      )}

      {resources.length > 0 && (
        <div style={styles.resources}>
          <h2 style={styles.resourcesTitle}>Resources</h2>
          {resources.map(function (r) {
            return (
              
                key={r.id}
                href={r.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.resourceLink}
              >
                <i className="ti ti-file-download" aria-hidden="true" style={styles.resourceIcon} />
                <span>{r.label}</span>
              </a>
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
