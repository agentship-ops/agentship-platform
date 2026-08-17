import { useState, useEffect, useRef, useCallback } from 'react'

// Crop-and-zoom for headshots.
//
// Drag to move, slider (or scroll wheel) to zoom, and the circle shows exactly
// what will be saved. Output is always a 400x400 JPEG, which is why an 800KB
// camera original comes out around 50-70KB.
//
// No libraries — the preview is a CSS transform and the save is one canvas
// drawImage using the same numbers, so what you see is what gets written.

const BOX = 280        // preview square, in CSS pixels
const OUTPUT = 400     // saved image, in pixels
const MAX_ZOOM = 4

export default function ImageCropper({ file, onCancel, onDone }) {
  const [img, setImg] = useState(null)       // loaded HTMLImageElement
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const dragRef = useRef(null)
  const surfaceRef = useRef(null)

  // ── Load the chosen file ──────────────────────────────────────
  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => setImg(image)
    image.onerror = () => setError("That file couldn't be opened as an image.")
    image.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // Smallest scale that still covers the circle. Everything is a multiple of
  // this, so the frame can never show empty space.
  const baseScale = img ? Math.max(BOX / img.width, BOX / img.height) : 1
  const drawW = img ? img.width * baseScale * zoom : 0
  const drawH = img ? img.height * baseScale * zoom : 0

  // Keep the image covering the frame no matter how it's dragged or zoomed.
  const clamp = useCallback((next, w, h) => ({
    x: Math.min(0, Math.max(BOX - w, next.x)),
    y: Math.min(0, Math.max(BOX - h, next.y)),
  }), [])

  // Center it once the image is ready.
  useEffect(() => {
    if (!img) return
    const w = img.width * baseScale
    const h = img.height * baseScale
    setZoom(1)
    setOffset({ x: (BOX - w) / 2, y: (BOX - h) / 2 })
  }, [img, baseScale])

  // Re-clamp after a zoom change, anchored on the centre of the frame so the
  // face doesn't drift out of view as you zoom in.
  function applyZoom(nextZoom) {
    if (!img) return
    const z = Math.min(MAX_ZOOM, Math.max(1, nextZoom))
    const prevW = img.width * baseScale * zoom
    const prevH = img.height * baseScale * zoom
    const nextW = img.width * baseScale * z
    const nextH = img.height * baseScale * z

    // Which point of the image is currently under the centre of the frame
    const cx = (BOX / 2 - offset.x) / prevW
    const cy = (BOX / 2 - offset.y) / prevH

    const next = { x: BOX / 2 - cx * nextW, y: BOX / 2 - cy * nextH }
    setZoom(z)
    setOffset(clamp(next, nextW, nextH))
  }

  // ── Dragging (pointer events cover mouse and touch) ───────────
  function onPointerDown(e) {
    if (!img) return
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startY: e.clientY, origin: offset }
  }
  function onPointerMove(e) {
    if (!dragRef.current || !img) return
    const { startX, startY, origin } = dragRef.current
    const next = {
      x: origin.x + (e.clientX - startX),
      y: origin.y + (e.clientY - startY),
    }
    setOffset(clamp(next, drawW, drawH))
  }
  function onPointerUp(e) {
    dragRef.current = null
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  // Scroll to zoom, without scrolling the page behind it.
  useEffect(() => {
    const el = surfaceRef.current
    if (!el) return
    function onWheel(e) {
      e.preventDefault()
      applyZoom(zoom + (e.deltaY < 0 ? 0.12 : -0.12))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
    // Re-bound when zoom/offset change so the handler always sees current values.
  }, [zoom, offset, img, baseScale])

  // Escape cancels.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  // ── Save ──────────────────────────────────────────────────────
  async function handleSave() {
    if (!img) return
    setBusy(true)
    setError('')
    try {
      const factor = OUTPUT / BOX
      const canvas = document.createElement('canvas')
      canvas.width = OUTPUT
      canvas.height = OUTPUT
      const ctx = canvas.getContext('2d')

      // Matte behind the photo, so a transparent PNG doesn't save as black.
      ctx.fillStyle = '#1E1E1E'
      ctx.fillRect(0, 0, OUTPUT, OUTPUT)
      ctx.imageSmoothingQuality = 'high'

      // Same numbers as the preview, scaled up to the output size.
      ctx.drawImage(
        img,
        offset.x * factor,
        offset.y * factor,
        drawW * factor,
        drawH * factor,
      )

      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error('Could not process that image.'))),
          'image/jpeg',
          0.9,
        )
      })

      onDone(blob)
    } catch (err) {
      setError(err.message || 'Something went wrong preparing that image.')
      setBusy(false)
    }
  }

  return (
    <div style={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div style={styles.modal}>
        <div style={styles.head}>
          <div style={styles.title}>Frame your headshot</div>
          <div style={styles.sub}>Drag to move, use the slider to zoom.</div>
        </div>

        <div style={styles.stage}>
          <div
            ref={surfaceRef}
            style={{ ...styles.surface, cursor: img ? 'grab' : 'default' }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {img && (
              <img
                src={img.src}
                alt=""
                draggable={false}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: `${drawW}px`,
                  height: `${drawH}px`,
                  transform: `translate(${offset.x}px, ${offset.y}px)`,
                  userSelect: 'none',
                  pointerEvents: 'none',
                }}
              />
            )}
            {/* Darkens everything outside the circle so the crop is obvious */}
            <div style={styles.mask} />
          </div>
        </div>

        <div style={styles.zoomRow}>
          <span style={styles.zoomIcon}>
            <i className="ti ti-photo" aria-hidden="true" />
          </span>
          <input
            type="range"
            min="1"
            max={MAX_ZOOM}
            step="0.01"
            value={zoom}
            onChange={e => applyZoom(parseFloat(e.target.value))}
            style={styles.slider}
            aria-label="Zoom"
          />
          <span style={{ ...styles.zoomIcon, fontSize: '19px' }}>
            <i className="ti ti-photo" aria-hidden="true" />
          </span>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.actions}>
          <button onClick={onCancel} style={styles.btnGhost} disabled={busy}>Cancel</button>
          <button
            onClick={handleSave}
            style={{ ...styles.btnGold, opacity: !img || busy ? 0.5 : 1 }}
            disabled={!img || busy}
          >
            {busy ? 'Saving...' : 'Use This Photo'}
          </button>
        </div>
      </div>
    </div>
  )
}

const GOLD = '#C9A84C'

const styles = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 500,
    background: 'rgba(0,0,0,0.78)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
  },
  modal: {
    width: '100%', maxWidth: '360px',
    background: '#141414', border: '1px solid #2a2a2a',
    borderRadius: '16px', padding: '22px',
    boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
    fontFamily: 'Montserrat, sans-serif',
  },
  head: { marginBottom: '18px' },
  title: { fontSize: '15px', fontWeight: '700', color: '#fff' },
  sub: { fontSize: '11.5px', color: '#777', marginTop: '4px' },

  stage: { display: 'flex', justifyContent: 'center' },
  surface: {
    position: 'relative',
    width: `${BOX}px`, height: `${BOX}px`,
    overflow: 'hidden',
    borderRadius: '10px',
    background: '#0A0A0A',
    touchAction: 'none',
  },
  mask: {
    position: 'absolute', inset: 0, pointerEvents: 'none',
    // Circular window: dark everywhere except the middle circle
    background: `radial-gradient(circle at center, transparent 0 ${BOX / 2 - 2}px, rgba(10,10,10,0.72) ${BOX / 2 - 1}px)`,
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
  },

  zoomRow: {
    display: 'flex', alignItems: 'center', gap: '12px',
    margin: '18px 2px 4px',
  },
  zoomIcon: { fontSize: '14px', color: '#5a5a5a', flexShrink: 0, lineHeight: 1 },
  slider: {
    flex: 1, accentColor: GOLD, cursor: 'pointer', height: '4px',
  },

  error: {
    marginTop: '12px', padding: '9px 12px', borderRadius: '8px',
    background: 'rgba(224,112,112,0.09)', border: '1px solid rgba(224,112,112,0.22)',
    color: '#e07070', fontSize: '12px', lineHeight: 1.5,
  },

  actions: {
    display: 'flex', gap: '10px', justifyContent: 'flex-end',
    marginTop: '18px',
  },
  btnGold: {
    padding: '10px 18px', borderRadius: '8px', background: GOLD,
    color: '#0A0A0A', fontSize: '12.5px', fontWeight: '700',
    border: 'none', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
  },
  btnGhost: {
    padding: '10px 16px', borderRadius: '8px', background: 'transparent',
    color: '#888', border: '1px solid #2a2a2a', fontSize: '12.5px',
    fontWeight: '600', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
  },
}
