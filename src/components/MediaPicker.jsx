import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Shared media tool for any composer (Messages, Channels, future post spaces).
// Handles: photo/video/GIF file upload, and keyword GIF search via Giphy.
// On success it calls onAttach({ url, type }) where type is image | video | gif.
// The parent decides what to do with the attachment (send it as a message).

const BUCKET = 'channel-media'
const GIPHY_KEY = import.meta.env.VITE_GIPHY_KEY

export default function MediaPicker({ pathPrefix, onAttach, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const [q, setQ] = useState('')
  const [gifs, setGifs] = useState([])
  const [loadingGifs, setLoadingGifs] = useState(false)
  const fileRef = useRef(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const safe = file.name.replace(/[^\w.-]/g, '_')
    const path = `${pathPrefix}/${Date.now()}-${safe}`
    const { error } = await supabase.storage
      .from(BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (error) { console.error('Upload failed:', error); setUploading(false); return }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const type = file.type.startsWith('video') ? 'video'
      : file.type === 'image/gif' ? 'gif' : 'image'
    onAttach({ url: pub.publicUrl, type, name: file.name })
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function searchGifs(term) {
    if (!GIPHY_KEY) return
    setLoadingGifs(true)
    const url = term
      ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(term)}&limit=24&rating=pg-13`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`
    try {
      const res = await fetch(url)
      const json = await res.json()
      setGifs((json.data || []).map(g => ({ id: g.id, url: g.images?.fixed_height?.url })))
    } catch (err) { console.error('GIF search failed:', err) }
    setLoadingGifs(false)
  }

  function openGif() {
    const next = !gifOpen
    setGifOpen(next)
    if (next && !gifs.length) searchGifs('')
  }

  function pickGif(g) {
    if (!g.url) return
    onAttach({ url: g.url, type: 'gif' })
    setGifOpen(false)
    setQ('')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
      <button
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
        aria-label="Attach photo or video"
        style={styles.btn}
      >
        <i className="ti ti-photo" style={{ fontSize: '20px', color: uploading ? '#C9A84C' : '#777' }} aria-hidden="true" />
      </button>
      <input ref={fileRef} type="file" accept="image/*,video/*,image/gif" onChange={handleFile} style={{ display: 'none' }} />

      <button
        onClick={openGif}
        disabled={disabled}
        aria-label="Add a GIF"
        style={{ ...styles.gifBtn, ...(gifOpen ? styles.gifBtnActive : {}) }}
      >
        GIF
      </button>

      {gifOpen && (
        <div style={styles.popover}>
          <div style={styles.searchRow}>
            <i className="ti ti-search" style={{ fontSize: '14px', color: '#555' }} aria-hidden="true" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') searchGifs(q) }}
              placeholder="Search GIFs"
              style={styles.searchInput}
            />
            <button onClick={() => setGifOpen(false)} aria-label="Close" style={styles.close}>
              <i className="ti ti-x" style={{ fontSize: '15px', color: '#777' }} aria-hidden="true" />
            </button>
          </div>

          {!GIPHY_KEY ? (
            <div style={styles.note}>GIF search isn't set up yet. Add the Giphy key in Vercel to turn it on. You can still attach a GIF file with the photo button.</div>
          ) : loadingGifs ? (
            <div style={styles.note}>Loading...</div>
          ) : gifs.length === 0 ? (
            <div style={styles.note}>No GIFs found.</div>
          ) : (
            <div style={styles.grid}>
              {gifs.map(g => (
                <button key={g.id} onClick={() => pickGif(g)} style={styles.gifCell}>
                  <img src={g.url} alt="gif" style={styles.gifImg} />
                </button>
              ))}
            </div>
          )}
          <div style={styles.credit}>Powered by GIPHY</div>
        </div>
      )}
    </div>
  )
}

const styles = {
  btn: { background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px' },
  gifBtn: { background: 'transparent', border: '0.5px solid #333', borderRadius: '6px', color: '#777', fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px', padding: '4px 7px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  gifBtnActive: { borderColor: 'rgba(201,168,76,0.55)', color: '#C9A84C' },
  popover: { position: 'absolute', bottom: '38px', left: 0, width: '300px', background: '#161616', border: '0.5px solid #333', borderRadius: '10px', padding: '10px', zIndex: 300, boxShadow: '0 8px 24px rgba(0,0,0,0.6)' },
  searchRow: { display: 'flex', alignItems: 'center', gap: '7px', background: '#0A0A0A', border: '0.5px solid #333', borderRadius: '8px', padding: '7px 10px', marginBottom: '8px' },
  searchInput: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '13px', fontFamily: 'Montserrat, sans-serif' },
  close: { background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', padding: 0 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', maxHeight: '280px', overflowY: 'auto' },
  gifCell: { background: '#0A0A0A', border: 'none', borderRadius: '8px', padding: 0, cursor: 'pointer', overflow: 'hidden', height: '90px' },
  gifImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  note: { fontSize: '12px', color: '#888', lineHeight: 1.5, padding: '14px 6px', textAlign: 'center' },
  credit: { fontSize: '9px', color: '#444', textAlign: 'center', marginTop: '8px', letterSpacing: '0.5px' },
}
