import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import MediaPicker from './MediaPicker'

const CHANNEL = 'agentship'
const EMOJIS = ['\u2764\uFE0F', '\uD83D\uDC4D', '\uD83D\uDE02', '\uD83C\uDF89', '\uD83D\uDC4F']

export default function Channels() {
  const [currentUser, setCurrentUser] = useState(null)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState([])
  const [replyingTo, setReplyingTo] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [pickerFor, setPickerFor] = useState(null)
  const [loading, setLoading] = useState(true)
  const [myAccountType, setMyAccountType] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const endRef = useRef(null)
  const lastLenRef = useRef(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setCurrentUser(data?.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => setCurrentUser(session?.user ?? null))
    return () => { sub?.subscription?.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!currentUser) { setMyAccountType(null); return }
    supabase.from('profiles').select('account_type').eq('id', currentUser.id).single()
      .then(({ data }) => setMyAccountType(data?.account_type ?? null))
  }, [currentUser])

  const load = useCallback(async () => {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, body, parent_id, created_at, user_id, author_first, author_last, author_role, attachments')
      .eq('channel', CHANNEL)
      .order('created_at', { ascending: true })

    const { data: rxns } = await supabase.from('message_reactions').select('message_id, emoji, user_id')

    const byMsg = {}
    ;(rxns || []).forEach(r => {
      byMsg[r.message_id] = byMsg[r.message_id] || {}
      const cell = byMsg[r.message_id][r.emoji] || { count: 0, mine: false }
      cell.count += 1
      if (currentUser && r.user_id === currentUser.id) cell.mine = true
      byMsg[r.message_id][r.emoji] = cell
    })

    setMessages((msgs || []).map(m => ({ ...m, reactions: byMsg[m.id] || {} })))
    setLoading(false)
    if (currentUser) { supabase.rpc('mark_channel_read', { p_channel: CHANNEL }) }
  }, [currentUser])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('rt-channels')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  // Only auto-scroll when a new message arrives, so playing videos aren't yanked.
  useEffect(() => {
    if (messages.length > lastLenRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth' })
    lastLenRef.current = messages.length
  }, [messages])

  function addPending(att) { setPending(p => [...p, att]) }
  function removePending(i) { setPending(p => p.filter((_, j) => j !== i)) }

  async function send() {
    const body = text.trim()
    if ((!body && pending.length === 0) || !currentUser) return
    const payload = { channel: CHANNEL, user_id: currentUser.id, body }
    if (pending.length) payload.attachments = pending
    if (replyingTo) payload.parent_id = replyingTo.id
    setText(''); setPending([]); setReplyingTo(null)
    const { error } = await supabase.from('messages').insert(payload)
    if (error) { console.error('Send failed:', error); setText(body) }
    load()
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  async function toggleReaction(message, emoji) {
    if (!currentUser) return
    setPickerFor(null)
    const mine = message.reactions?.[emoji]?.mine
    if (mine) {
      await supabase.from('message_reactions').delete().match({ message_id: message.id, user_id: currentUser.id, emoji })
    } else {
      await supabase.from('message_reactions').insert({ message_id: message.id, user_id: currentUser.id, emoji })
    }
    load()
  }

  const isStaff = myAccountType === 'admin' || myAccountType === 'leader'
  function canDelete(m) { return isStaff || (currentUser && m.user_id === currentUser.id) }
  async function deleteMessage(m) {
    if (!window.confirm('Delete this message? This cannot be undone.')) return
    await supabase.from('messages').delete().eq('id', m.id)
    load()
  }

  function startEdit(m) { setEditingId(m.id); setEditText(m.body); setPickerFor(null) }
  function cancelEdit() { setEditingId(null); setEditText('') }
  async function saveEdit(m) {
    const body = editText.trim()
    if (!body) return
    setEditingId(null)
    await supabase.from('messages').update({ body }).eq('id', m.id)
    load()
  }

  const initials = (m) => `${(m.author_first?.[0] || '').toUpperCase()}${(m.author_last?.[0] || '').toUpperCase()}` || '?'
  const name = (m) => `${m.author_first || 'Member'}${m.author_last ? ' ' + m.author_last : ''}`
  const time = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const dayLabel = (iso) => {
    const d = new Date(iso)
    const today = new Date()
    const yest = new Date(); yest.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yest.toDateString()) return 'Yesterday'
    return d.toLocaleDateString([], { month: 'long', day: 'numeric' })
  }

  const top = messages.filter(m => !m.parent_id)
  const repliesFor = (id) => messages.filter(m => m.parent_id === id)

  function renderAttachment(a, i) {
    if (a.type === 'video') return <video key={i} src={a.url} controls style={styles.mediaItem} />
    if (a.type === 'file') return (
      <a key={i} href={a.url} target="_blank" rel="noreferrer" style={styles.fileChip}>
        <i className="ti ti-paperclip" aria-hidden="true" /> {a.name || 'File'}
      </a>
    )
    return <img key={i} src={a.url} alt={a.name || 'attachment'} style={styles.mediaItem} />
  }

  function renderMessage(m, reply) {
    const isSelf = currentUser && m.user_id === currentUser.id
    const tag = isSelf ? 'you' : null
    const rx = Object.entries(m.reactions || {})
    const atts = m.attachments || []
    return (
      <div style={{ ...styles.msg, ...(reply ? styles.msgReply : {}) }}
        onMouseEnter={() => setHoveredId(m.id)}
        onMouseLeave={() => { setHoveredId(null); setPickerFor(null) }}>
        {hoveredId === m.id && (
          <div style={styles.actions}>
            {pickerFor === m.id ? (
              EMOJIS.map(e => (<button key={e} onClick={() => toggleReaction(m, e)} style={styles.actEmoji}>{e}</button>))
            ) : (
              <>
                <button style={styles.actBtn} onClick={() => setPickerFor(m.id)} aria-label="React"><i className="ti ti-mood-smile" aria-hidden="true" /></button>
                <button style={styles.actBtn} onClick={() => { setReplyingTo(m); setPickerFor(null) }} aria-label="Reply"><i className="ti ti-corner-up-left" aria-hidden="true" /></button>
                {currentUser && m.user_id === currentUser.id && m.body && (
                  <button style={styles.actBtn} onClick={() => startEdit(m)} aria-label="Edit"><i className="ti ti-pencil" aria-hidden="true" /></button>
                )}
                {canDelete(m) && (
                  <button style={styles.actBtn} onClick={() => deleteMessage(m)} aria-label="Delete"><i className="ti ti-trash" aria-hidden="true" /></button>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ ...styles.avatar, ...(reply ? styles.avatarSm : {}), ...(isSelf ? styles.avatarSelf : {}) }}>{initials(m)}</div>

        <div style={styles.msgContent}>
          <div style={styles.meta}>
            <span style={styles.author}>{name(m)}</span>
            {tag && <span style={styles.tag}>{tag}</span>}
            <span style={styles.time}>{time(m.created_at)}</span>
          </div>
          {editingId === m.id ? (
            <div style={styles.editWrap}>
              <input style={styles.editInput} value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(m) } if (e.key === 'Escape') cancelEdit() }}
                autoFocus />
              <div style={styles.editBtns}>
                <button style={styles.editSave} onClick={() => saveEdit(m)}>Save</button>
                <button style={styles.editCancel} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <>
              {m.body && <div style={{ ...styles.text, ...(reply ? styles.textSm : {}) }}>{m.body}</div>}
              {atts.length > 0 && <div style={styles.media}>{atts.map((a, i) => renderAttachment(a, i))}</div>}
            </>
          )}
          {rx.length > 0 && (
            <div style={styles.reactions}>
              {rx.map(([emoji, info]) => (
                <button key={emoji} onClick={() => toggleReaction(m, emoji)} style={{ ...styles.rx, ...(info.mine ? styles.rxMine : {}) }}>
                  <span style={styles.rxEmoji}>{emoji}</span> {info.count}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>
            <span style={styles.hash}>#</span>
            <span style={styles.titleName}>Agentship</span>
          </div>
          <div style={styles.sub}>Everyone on the platform is here.</div>
        </div>
      </div>

      <div style={styles.stream}>
        {loading ? (
          <div style={styles.empty}>Loading...</div>
        ) : top.length === 0 ? (
          <div style={styles.empty}>No messages yet. Start the conversation.</div>
        ) : (
          top.map((m, i) => {
            const showDivider = i === 0 || dayLabel(m.created_at) !== dayLabel(top[i - 1].created_at)
            const replies = repliesFor(m.id)
            return (
              <div key={m.id}>
                {showDivider && (
                  <div style={styles.dayDivider}>
                    <span style={styles.dayLine} />
                    <span style={styles.dayLbl}>{dayLabel(m.created_at)}</span>
                    <span style={styles.dayLine} />
                  </div>
                )}
                {renderMessage(m, false)}
                {replies.length > 0 && (
                  <div style={styles.thread}>
                    {replies.map(r => <div key={r.id}>{renderMessage(r, true)}</div>)}
                    <div style={styles.threadFoot}>
                      <i className="ti ti-corner-up-left" aria-hidden="true" style={{ fontSize: 12 }} />
                      {' '}{replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      <div style={styles.composer}>
        {replyingTo && (
          <div style={styles.replyBar}>
            <span style={styles.replyText}>Replying to <strong style={{ color: '#C9A84C' }}>{name(replyingTo)}</strong></span>
            <button onClick={() => setReplyingTo(null)} style={styles.replyClose} aria-label="Cancel reply"><i className="ti ti-x" aria-hidden="true" /></button>
          </div>
        )}
        {pending.length > 0 && (
          <div style={styles.pendingRow}>
            {pending.map((a, i) => (
              <div key={i} style={styles.pendingItem}>
                {(a.type === 'image' || a.type === 'gif')
                  ? <img src={a.url} alt="" style={styles.pendingThumb} />
                  : <div style={styles.pendingFile}><i className={`ti ${a.type === 'video' ? 'ti-video' : 'ti-paperclip'}`} aria-hidden="true" /> {a.name || a.type}</div>}
                <button onClick={() => removePending(i)} style={styles.pendingX} aria-label="Remove"><i className="ti ti-x" aria-hidden="true" /></button>
              </div>
            ))}
          </div>
        )}
        <div style={styles.composerInner}>
          <MediaPicker pathPrefix={`channel/${CHANNEL}`} onAttach={addPending} />
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={onKeyDown} placeholder="Message # Agentship" style={styles.input} />
          <button onClick={send} style={styles.send} aria-label="Send"><i className="ti ti-send" aria-hidden="true" /></button>
        </div>
        <div style={styles.note}>Everyone on the platform can read and post here</div>
      </div>
    </div>
  )
}

const styles = {
  page: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { height: '62px', flexShrink: 0, borderBottom: '1px solid #2a2a2a', display: 'flex', alignItems: 'center', padding: '0 26px' },
  title: { display: 'flex', alignItems: 'baseline', gap: '8px' },
  hash: { fontSize: '19px', fontWeight: '700', color: '#C9A84C' },
  titleName: { fontSize: '17px', fontWeight: '700', color: '#fff', letterSpacing: '-0.2px' },
  sub: { fontSize: '11px', color: '#666', marginTop: '3px' },
  stream: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '22px 26px 8px', display: 'flex', flexDirection: 'column', gap: '2px' },
  empty: { color: '#555', fontSize: '13px', margin: 'auto', padding: '40px' },
  dayDivider: { display: 'flex', alignItems: 'center', gap: '12px', margin: '8px 0 18px' },
  dayLine: { flex: 1, height: '1px', background: '#2a2a2a' },
  dayLbl: { fontSize: '10px', fontWeight: '600', color: '#666', textTransform: 'uppercase', letterSpacing: '1px', padding: '3px 12px', border: '0.5px solid #2a2a2a', borderRadius: '12px' },
  msg: { display: 'flex', gap: '12px', padding: '7px 0', position: 'relative' },
  msgReply: { padding: '4px 0' },
  avatar: { width: '36px', height: '36px', borderRadius: '50%', background: '#2a2a2a', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 },
  avatarSm: { width: '28px', height: '28px', fontSize: '10px' },
  avatarSelf: { background: '#C9A84C', color: '#0A0A0A' },
  msgContent: { flex: 1, minWidth: 0 },
  meta: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' },
  author: { fontSize: '13px', fontWeight: '600', color: '#fff' },
  tag: { fontSize: '9px', fontWeight: '600', padding: '1px 7px', borderRadius: '10px', color: '#C9A84C', background: 'rgba(201,168,76,0.12)' },
  time: { fontSize: '10px', color: '#555' },
  text: { fontSize: '14px', lineHeight: 1.55, color: '#e8e8e8', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  textSm: { fontSize: '13px' },
  media: { marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' },
  mediaItem: { maxWidth: '260px', maxHeight: '260px', borderRadius: '10px', display: 'block' },
  fileChip: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#C9A84C', textDecoration: 'underline', marginTop: '6px', wordBreak: 'break-all' },
  editWrap: { marginTop: '2px' },
  editInput: { width: '100%', background: '#1E1E1E', border: '0.5px solid #333', borderRadius: '8px', color: '#fff', fontSize: '14px', fontFamily: 'Montserrat, sans-serif', padding: '9px 12px', outline: 'none' },
  editBtns: { display: 'flex', gap: '8px', marginTop: '6px' },
  editSave: { background: '#C9A84C', color: '#0A0A0A', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  editCancel: { background: 'transparent', color: '#888', border: '0.5px solid #333', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  actions: { position: 'absolute', top: '-6px', right: 0, display: 'flex', gap: '2px', background: '#161616', border: '0.5px solid #333', borderRadius: '8px', padding: '2px', zIndex: 2 },
  actBtn: { width: '28px', height: '28px', borderRadius: '6px', background: 'transparent', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '15px', border: 'none', cursor: 'pointer' },
  actEmoji: { width: '30px', height: '28px', borderRadius: '6px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  reactions: { display: 'flex', gap: '6px', marginTop: '7px', flexWrap: 'wrap' },
  rx: { display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#1a1a1a', border: '0.5px solid #333', borderRadius: '12px', padding: '3px 9px', fontSize: '11px', color: '#ccc', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  rxMine: { borderColor: 'rgba(201,168,76,0.55)', background: 'rgba(201,168,76,0.10)', color: '#fff' },
  rxEmoji: { fontSize: '12px', lineHeight: 1 },
  thread: { margin: '6px 0 4px 48px', borderLeft: '2px solid rgba(201,168,76,0.35)', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' },
  threadFoot: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#C9A84C', marginTop: '2px', opacity: 0.85 },
  composer: { flexShrink: 0, padding: '14px 26px 22px' },
  replyBar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#161616', border: '0.5px solid #333', borderRadius: '8px', padding: '8px 8px 8px 14px', marginBottom: '8px' },
  replyText: { fontSize: '12px', color: '#aaa' },
  replyClose: { width: '26px', height: '26px', borderRadius: '6px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '15px' },
  pendingRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' },
  pendingItem: { position: 'relative' },
  pendingThumb: { width: '54px', height: '54px', objectFit: 'cover', borderRadius: '8px', display: 'block' },
  pendingFile: { display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '160px', height: '54px', padding: '0 10px', background: '#161616', border: '0.5px solid #333', borderRadius: '8px', fontSize: '11px', color: '#ccc', overflow: 'hidden' },
  pendingX: { position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: '#0A0A0A', border: '0.5px solid #444', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', padding: 0 },
  composerInner: { display: 'flex', alignItems: 'center', gap: '10px', background: '#1E1E1E', border: '0.5px solid #333', borderRadius: '12px', padding: '6px 6px 6px 12px' },
  input: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'Montserrat, sans-serif', padding: '10px 0' },
  send: { width: '38px', height: '38px', borderRadius: '9px', background: '#C9A84C', color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', border: 'none', cursor: 'pointer', flexShrink: 0 },
  note: { fontSize: '10px', color: '#444', textAlign: 'center', marginTop: '8px' },
}
