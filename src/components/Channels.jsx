import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const CHANNEL = 'agentship'
const EMOJIS = ['\u2764\uFE0F', '\uD83D\uDC4D', '\uD83D\uDE02', '\uD83C\uDF89', '\uD83D\uDC4F']
const VIDEO_CAP = 25 * 1024 * 1024   // 25MB
const IMAGE_CAP = 10 * 1024 * 1024   // 10MB

export default function Channels() {
  const [currentUser, setCurrentUser] = useState(null)
  const [myRole, setMyRole] = useState('agent')
  const [members, setMembers] = useState([])
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [pendingMentions, setPendingMentions] = useState([])
  const [pendingAttachments, setPendingAttachments] = useState([])
  const [mentionQuery, setMentionQuery] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [replyingTo, setReplyingTo] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [pickerFor, setPickerFor] = useState(null)
  const [loading, setLoading] = useState(true)
  const endRef = useRef(null)
  const inputRef = useRef(null)
  const fileRef = useRef(null)

  const canModerate = myRole === 'admin' || myRole === 'leader'

  // Read the logged-in user straight from Supabase, independent of AuthContext.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUser(data?.session?.user ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null)
    })
    return () => { sub?.subscription?.unsubscribe() }
  }, [])

  // Load the member list (for the @ menu) and my own role (for delete rights).
  useEffect(() => {
    if (!currentUser) return
    supabase.from('profiles').select('id, first_name, last_name, role')
      .then(({ data }) => setMembers(data || []))
    supabase.from('profiles').select('role').eq('id', currentUser.id).single()
      .then(({ data }) => setMyRole(data?.role || 'agent'))
  }, [currentUser])

  const load = useCallback(async () => {
    const { data: msgs } = await supabase
      .from('messages')
      .select('id, body, parent_id, created_at, user_id, author_first, author_last, author_role, mentions, attachments, deleted_at')
      .eq('channel', CHANNEL)
      .order('created_at', { ascending: true })

    const { data: rxns } = await supabase
      .from('message_reactions')
      .select('message_id, emoji, user_id')

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

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ----- Mentions -----
  const labelFor = (p) => `@${p.first_name}${p.last_name ? ' ' + p.last_name : ''}`

  const mentionMatches = mentionQuery !== null
    ? members
        .filter(mm => mm.id !== currentUser?.id)
        .filter(mm => `${mm.first_name || ''} ${mm.last_name || ''}`.toLowerCase().includes(mentionQuery))
        .slice(0, 6)
    : []

  function onChange(e) {
    const val = e.target.value
    setText(val)
    const m = /(?:^|\s)@([\w]*)$/.exec(val)
    setMentionQuery(m ? m[1].toLowerCase() : null)
  }

  function pickMention(member) {
    const label = labelFor(member)
    setText(prev => prev.replace(/(^|\s)@([\w]*)$/, (full, pre) => `${pre}${label} `))
    setPendingMentions(prev => [...prev, { id: member.id, label }])
    setMentionQuery(null)
    inputRef.current?.focus()
  }

  // ----- Attachments -----
  async function onFiles(e) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!currentUser) return
    for (const file of files) {
      const isVideo = file.type.startsWith('video/')
      const cap = isVideo ? VIDEO_CAP : IMAGE_CAP
      if (file.size > cap) {
        alert(`${file.name} is too large. Limit is ${isVideo ? '25MB for video' : '10MB for images'}.`)
        continue
      }
      setUploading(true)
      const safe = file.name.replace(/[^\w.\-]/g, '_')
      const path = `${CHANNEL}/${currentUser.id}/${Date.now()}-${safe}`
      const { error } = await supabase.storage
        .from('channel-media').upload(path, file, { cacheControl: '3600', upsert: false })
      if (error) {
        console.error('Upload failed:', error)
        alert('Upload failed: ' + error.message)
        setUploading(false)
        continue
      }
      const { data } = supabase.storage.from('channel-media').getPublicUrl(path)
      setPendingAttachments(prev => [...prev, { url: data.publicUrl, type: file.type, name: file.name }])
      setUploading(false)
    }
  }

  function removeAttachment(idx) {
    setPendingAttachments(prev => prev.filter((_, i) => i !== idx))
  }

  // ----- Send -----
  async function send() {
    const body = text.trim()
    if ((!body && pendingAttachments.length === 0) || !currentUser) return
    const mentions = [...new Set(
      pendingMentions.filter(pm => body.includes(pm.label)).map(pm => pm.id)
    )]
    const attachments = pendingAttachments
    setText('')
    setPendingMentions([])
    setPendingAttachments([])
    setMentionQuery(null)
    const payload = { channel: CHANNEL, user_id: currentUser.id, body, mentions, attachments }
    if (replyingTo) payload.parent_id = replyingTo.id
    setReplyingTo(null)
    const { error } = await supabase.from('messages').insert(payload)
    if (error) { console.error('Send failed:', error); setText(body) }
    load()
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') { setMentionQuery(null); return }
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionMatches.length > 0) { e.preventDefault(); pickMention(mentionMatches[0]); return }
      e.preventDefault(); send()
    }
  }

  async function toggleReaction(message, emoji) {
    if (!currentUser) return
    setPickerFor(null)
    const mine = message.reactions?.[emoji]?.mine
    if (mine) {
      await supabase.from('message_reactions')
        .delete().match({ message_id: message.id, user_id: currentUser.id, emoji })
    } else {
      await supabase.from('message_reactions')
        .insert({ message_id: message.id, user_id: currentUser.id, emoji })
    }
    load()
  }

  async function deleteMessage(m) {
    if (!window.confirm('Delete this message for everyone?')) return
    setHoveredId(null)
    await supabase.from('messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: currentUser.id })
      .eq('id', m.id)
    load()
  }

  const initials = (m) =>
    `${(m.author_first?.[0] || '').toUpperCase()}${(m.author_last?.[0] || '').toUpperCase()}` || '?'
  const memberInitials = (p) =>
    `${(p.first_name?.[0] || '').toUpperCase()}${(p.last_name?.[0] || '').toUpperCase()}` || '?'
  const name = (m) =>
    `${m.author_first || 'Member'}${m.author_last ? ' ' + m.author_last : ''}`
  const roleTag = (role) => (role === 'leader' ? 'Leader' : role === 'admin' ? 'Admin' : null)
  const time = (iso) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const dayLabel = (iso) => {
    const d = new Date(iso)
    const today = new Date()
    const yest = new Date(); yest.setDate(today.getDate() - 1)
    if (d.toDateString() === today.toDateString()) return 'Today'
    if (d.toDateString() === yest.toDateString()) return 'Yesterday'
    return d.toLocaleDateString([], { month: 'long', day: 'numeric' })
  }

  // Highlight the @names that were actually tagged in this message.
  function renderBody(m) {
    const body = m.body || ''
    const labels = (m.mentions || [])
      .map(id => { const p = members.find(x => x.id === id); return p ? labelFor(p) : null })
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
    if (labels.length === 0) return body
    const nodes = []
    let remaining = body
    let key = 0
    while (remaining.length) {
      let bestIdx = -1, bestLabel = null
      for (const lab of labels) {
        const idx = remaining.indexOf(lab)
        if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestLabel = lab }
      }
      if (bestIdx === -1) { nodes.push(remaining); break }
      if (bestIdx > 0) nodes.push(remaining.slice(0, bestIdx))
      nodes.push(<span key={key++} style={styles.mention}>{bestLabel}</span>)
      remaining = remaining.slice(bestIdx + bestLabel.length)
    }
    return nodes
  }

  function renderAttachments(atts) {
    if (!atts || atts.length === 0) return null
    return (
      <div style={styles.attachGrid}>
        {atts.map((a, i) =>
          a.type?.startsWith('video/')
            ? <video key={i} src={a.url} controls style={styles.attachMedia} />
            : <img key={i} src={a.url} alt={a.name || ''} style={styles.attachMedia} />
        )}
      </div>
    )
  }

  const top = messages.filter(m => !m.parent_id)
  const repliesFor = (id) => messages.filter(m => m.parent_id === id)

  function renderMessage(m, reply) {
    const isSelf = currentUser && m.user_id === currentUser.id
    const tag = isSelf ? 'you' : null
    const rx = Object.entries(m.reactions || {})
    const mentionsMe = currentUser && (m.mentions || []).includes(currentUser.id)

    if (m.deleted_at) {
      return (
        <div style={{ ...styles.msg, ...(reply ? styles.msgReply : {}) }}>
          <div style={{ ...styles.avatar, ...(reply ? styles.avatarSm : {}), opacity: 0.4 }}>
            <i className="ti ti-trash" aria-hidden="true" style={{ fontSize: 14 }} />
          </div>
          <div style={styles.msgContent}>
            <div style={styles.deletedText}>This message was deleted</div>
          </div>
        </div>
      )
    }

    return (
      <div
        style={{ ...styles.msg, ...(reply ? styles.msgReply : {}), ...(mentionsMe ? styles.msgMentionsMe : {}) }}
        onMouseEnter={() => setHoveredId(m.id)}
        onMouseLeave={() => { setHoveredId(null); setPickerFor(null) }}
      >
        {hoveredId === m.id && (
          <div style={styles.actions}>
            {pickerFor === m.id ? (
              EMOJIS.map(e => (
                <button key={e} onClick={() => toggleReaction(m, e)} style={styles.actEmoji}>{e}</button>
              ))
            ) : (
              <>
                <button style={styles.actBtn} onClick={() => setPickerFor(m.id)} aria-label="React">
                  <i className="ti ti-heart" aria-hidden="true" />
                </button>
                <button style={styles.actBtn} onClick={() => { setReplyingTo(m); setPickerFor(null) }} aria-label="Reply">
                  <i className="ti ti-corner-up-left" aria-hidden="true" />
                </button>
                {canModerate && (
                  <button style={styles.actBtn} onClick={() => deleteMessage(m)} aria-label="Delete">
                    <i className="ti ti-trash" aria-hidden="true" />
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div style={{ ...styles.avatar, ...(reply ? styles.avatarSm : {}), ...(isSelf ? styles.avatarSelf : {}) }}>
          {initials(m)}
        </div>

        <div style={styles.msgContent}>
          <div style={styles.meta}>
            <span style={styles.author}>{name(m)}</span>
            {tag && <span style={styles.tag}>{tag}</span>}
            <span style={styles.time}>{time(m.created_at)}</span>
          </div>
          {m.body && (
            <div style={{ ...styles.text, ...(reply ? styles.textSm : {}) }}>{renderBody(m)}</div>
          )}
          {renderAttachments(m.attachments)}
          {rx.length > 0 && (
            <div style={styles.reactions}>
              {rx.map(([emoji, info]) => (
                <button
                  key={emoji}
                  onClick={() => toggleReaction(m, emoji)}
                  style={{ ...styles.rx, ...(info.mine ? styles.rxMine : {}) }}
                >
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
            <span style={styles.replyText}>
              Replying to <strong style={{ color: '#C9A84C' }}>{name(replyingTo)}</strong>
            </span>
            <button onClick={() => setReplyingTo(null)} style={styles.replyClose} aria-label="Cancel reply">
              <i className="ti ti-x" aria-hidden="true" />
            </button>
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div style={styles.attachPreviews}>
            {pendingAttachments.map((a, i) => (
              <div key={i} style={styles.attachPreviewItem}>
                {a.type?.startsWith('video/')
                  ? <video src={a.url} style={styles.attachThumb} />
                  : <img src={a.url} style={styles.attachThumb} alt="" />}
                <button style={styles.attachRemove} onClick={() => removeAttachment(i)} aria-label="Remove">
                  <i className="ti ti-x" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ position: 'relative' }}>
          {mentionMatches.length > 0 && (
            <div style={styles.mentionMenu}>
              {mentionMatches.map(mm => (
                <button key={mm.id} style={styles.mentionItem} onClick={() => pickMention(mm)}>
                  <span style={styles.mentionAvatar}>{memberInitials(mm)}</span>
                  <span style={styles.mentionName}>{mm.first_name} {mm.last_name}</span>
                  {roleTag(mm.role) && <span style={styles.tag}>{roleTag(mm.role)}</span>}
                </button>
              ))}
            </div>
          )}

          <div style={styles.composerInner}>
            <button style={styles.attachBtn} onClick={() => fileRef.current?.click()} aria-label="Attach">
              <i className="ti ti-paperclip" aria-hidden="true" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={onFiles}
              style={{ display: 'none' }}
            />
            <input
              ref={inputRef}
              value={text}
              onChange={onChange}
              onKeyDown={onKeyDown}
              placeholder="Message # Agentship"
              style={styles.input}
            />
            <button onClick={send} style={styles.send} aria-label="Send">
              <i className="ti ti-send" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div style={styles.note}>
          {uploading
            ? 'Uploading...'
            : 'Type @ to tag someone. Attach photos, videos, or GIFs with the clip.'}
        </div>
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
  msgMentionsMe: { background: 'rgba(201,168,76,0.06)', borderLeft: '2px solid rgba(201,168,76,0.55)', borderRadius: '6px', paddingLeft: '10px', marginLeft: '-12px' },
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
  mention: { color: '#C9A84C', fontWeight: '600', background: 'rgba(201,168,76,0.12)', borderRadius: '4px', padding: '0 3px' },
  deletedText: { fontSize: '13px', color: '#555', fontStyle: 'italic', padding: '4px 0' },
  attachGrid: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '8px' },
  attachMedia: { maxWidth: '280px', maxHeight: '260px', borderRadius: '10px', border: '0.5px solid #2a2a2a', objectFit: 'cover' },
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
  attachPreviews: { display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' },
  attachPreviewItem: { position: 'relative', width: '64px', height: '64px', borderRadius: '8px', overflow: 'hidden', border: '0.5px solid #333' },
  attachThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  attachRemove: { position: 'absolute', top: '2px', right: '2px', width: '18px', height: '18px', borderRadius: '50%', background: 'rgba(10,10,10,0.8)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  mentionMenu: { position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0, background: '#161616', border: '0.5px solid #333', borderRadius: '10px', padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '220px', overflowY: 'auto', zIndex: 5 },
  mentionItem: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '7px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Montserrat, sans-serif' },
  mentionAvatar: { width: '26px', height: '26px', borderRadius: '50%', background: '#2a2a2a', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },
  mentionName: { fontSize: '13px', color: '#fff', fontWeight: '500' },
  composerInner: { display: 'flex', alignItems: 'center', gap: '8px', background: '#1E1E1E', border: '0.5px solid #333', borderRadius: '12px', padding: '6px 6px 6px 10px' },
  attachBtn: { width: '38px', height: '38px', borderRadius: '9px', background: 'transparent', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', border: 'none', cursor: 'pointer', flexShrink: 0 },
  input: { flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontSize: '14px', fontFamily: 'Montserrat, sans-serif', padding: '10px 0' },
  send: { width: '38px', height: '38px', borderRadius: '9px', background: '#C9A84C', color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', border: 'none', cursor: 'pointer', flexShrink: 0 },
  note: { fontSize: '10px', color: '#444', textAlign: 'center', marginTop: '8px' },
}
