import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

// Full-page Direct Messages.
// Private 1:1 conversations with channel-parity features:
// real-time text, heart reactions, threaded replies, photo/video/GIF upload,
// and soft delete of your own messages. Privacy is enforced in the database
// (participant-only RLS), so this component only ever sees the caller's own
// conversations.

const GOLD = '#C9A84C'
const BUCKET = 'channel-media'

function initials(f, l) {
  return `${(f?.[0] ?? '').toUpperCase()}${(l?.[0] ?? '').toUpperCase()}` || '?'
}

function shortTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
  }
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 1) return 'Yest'
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function Messages({ onUnreadChange }) {
  const { user, profile } = useAuth()
  const me = user?.id

  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null) // { id, other: {id, first_name, last_name} }
  const [messages, setMessages] = useState([])
  const [reactions, setReactions] = useState({}) // messageId -> [{user_id}]
  const [reads, setReads] = useState({}) // conversationId -> last_read_at
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState(null)
  const [openThreads, setOpenThreads] = useState({}) // parentId -> bool
  const [showPicker, setShowPicker] = useState(false)
  const [people, setPeople] = useState([])
  const [search, setSearch] = useState('')
  const [uploading, setUploading] = useState(false)

  const scrollRef = useRef(null)
  const fileRef = useRef(null)

  // ---- Loaders -------------------------------------------------------------

  const loadConversations = useCallback(async () => {
    if (!me) return
    const { data: convs } = await supabase
      .from('dm_conversations')
      .select('*')
      .order('last_message_at', { ascending: false })
    if (!convs) return

    const otherIds = convs.map(c => (c.user_low === me ? c.user_high : c.user_low))
    let profilesById = {}
    if (otherIds.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', otherIds)
      ;(profs || []).forEach(p => { profilesById[p.id] = p })
    }

    const { data: readRows } = await supabase
      .from('dm_reads')
      .select('conversation_id, last_read_at')
      .eq('user_id', me)
    const readMap = {}
    ;(readRows || []).forEach(r => { readMap[r.conversation_id] = r.last_read_at })
    setReads(readMap)

    // last message per conversation for preview + unread comparison
    const convIds = convs.map(c => c.id)
    let previews = {}
    if (convIds.length) {
      const { data: recent } = await supabase
        .from('dm_messages')
        .select('conversation_id, body, attachments, user_id, created_at, deleted_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(400)
      ;(recent || []).forEach(m => {
        if (!previews[m.conversation_id]) previews[m.conversation_id] = m
      })
    }

    const shaped = convs.map(c => {
      const otherId = c.user_low === me ? c.user_high : c.user_low
      const last = previews[c.id]
      const lastRead = readMap[c.id]
      const unread = last && last.user_id !== me &&
        (!lastRead || new Date(last.created_at) > new Date(lastRead))
      return {
        id: c.id,
        last_message_at: c.last_message_at,
        other: profilesById[otherId] || { id: otherId, first_name: '', last_name: '' },
        preview: last ? previewText(last) : '',
        unread: !!unread,
      }
    })
    setConversations(shaped)

    const totalUnread = shaped.filter(c => c.unread).length
    if (onUnreadChange) onUnreadChange(totalUnread)
  }, [me, onUnreadChange])

  function previewText(m) {
    if (m.deleted_at) return 'Message deleted'
    if (m.body) return m.body
    const atts = m.attachments || []
    if (atts.length) return atts[0].type === 'video' ? 'Video' : 'Photo'
    return ''
  }

  const loadMessages = useCallback(async (convId) => {
    const { data } = await supabase
      .from('dm_messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true })
    setMessages(data || [])

    const ids = (data || []).map(m => m.id)
    if (ids.length) {
      const { data: rx } = await supabase
        .from('dm_message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', ids)
      const map = {}
      ;(rx || []).forEach(r => {
        map[r.message_id] = map[r.message_id] || []
        map[r.message_id].push(r)
      })
      setReactions(map)
    } else {
      setReactions({})
    }
  }, [])

  const markRead = useCallback(async (convId) => {
    if (!me) return
    await supabase.from('dm_reads').upsert(
      { conversation_id: convId, user_id: me, last_read_at: new Date().toISOString() },
      { onConflict: 'conversation_id,user_id' }
    )
    setConversations(prev => {
      const next = prev.map(c => c.id === convId ? { ...c, unread: false } : c)
      if (onUnreadChange) onUnreadChange(next.filter(c => c.unread).length)
      return next
    })
  }, [me, onUnreadChange])

  // ---- Effects -------------------------------------------------------------

  useEffect(() => { loadConversations() }, [loadConversations])

  useEffect(() => {
    if (!activeConv) return
    loadMessages(activeConv.id)
    markRead(activeConv.id)
  }, [activeConv, loadMessages, markRead])

  // realtime: open conversation messages + reactions
  useEffect(() => {
    if (!activeConv) return
    const ch = supabase
      .channel(`dm-${activeConv.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${activeConv.id}` },
        () => { loadMessages(activeConv.id); markRead(activeConv.id) })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'dm_message_reactions' },
        () => loadMessages(activeConv.id))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [activeConv, loadMessages, markRead])

  // realtime: conversation list (last_message_at bumps, new conversations)
  useEffect(() => {
    if (!me) return
    const ch = supabase
      .channel('dm-conv-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_conversations' },
        () => loadConversations())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [me, loadConversations])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  // ---- Actions -------------------------------------------------------------

  async function openPicker() {
    setShowPicker(true)
    setSearch('')
    if (!people.length) {
      const { data } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .neq('id', me)
        .order('first_name', { ascending: true })
      setPeople(data || [])
    }
  }

  async function startConversation(person) {
    const { data, error } = await supabase.rpc('get_or_create_dm', { other_user: person.id })
    if (error) { console.error(error); return }
    setShowPicker(false)
    setActiveConv({ id: data, other: person })
    loadConversations()
  }

  async function send() {
    const text = draft.trim()
    if (!text || !activeConv || !me) return
    const payload = {
      conversation_id: activeConv.id,
      user_id: me,
      body: text,
      parent_id: replyTo ? replyTo.id : null,
    }
    setDraft('')
    setReplyTo(null)
    const { error } = await supabase.from('dm_messages').insert(payload)
    if (error) console.error(error)
  }

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file || !activeConv || !me) return
    setUploading(true)
    const path = `dm/${activeConv.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
    if (upErr) { console.error(upErr); setUploading(false); return }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
    const type = file.type.startsWith('video') ? 'video' : 'image'
    await supabase.from('dm_messages').insert({
      conversation_id: activeConv.id,
      user_id: me,
      body: '',
      attachments: [{ url: pub.publicUrl, type, name: file.name }],
      parent_id: replyTo ? replyTo.id : null,
    })
    setReplyTo(null)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function toggleHeart(msg) {
    const mine = (reactions[msg.id] || []).find(r => r.user_id === me && r.emoji === 'heart')
    if (mine) {
      await supabase.from('dm_message_reactions')
        .delete().eq('message_id', msg.id).eq('user_id', me).eq('emoji', 'heart')
    } else {
      await supabase.from('dm_message_reactions')
        .insert({ message_id: msg.id, user_id: me, emoji: 'heart' })
    }
    loadMessages(activeConv.id)
  }

  async function softDelete(msg) {
    await supabase.from('dm_messages')
      .update({ deleted_at: new Date().toISOString(), deleted_by: me })
      .eq('id', msg.id)
    loadMessages(activeConv.id)
  }

  // ---- Derived -------------------------------------------------------------

  const topLevel = messages.filter(m => !m.parent_id)
  const repliesByParent = {}
  messages.filter(m => m.parent_id).forEach(m => {
    repliesByParent[m.parent_id] = repliesByParent[m.parent_id] || []
    repliesByParent[m.parent_id].push(m)
  })

  const filteredPeople = people.filter(p => {
    const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase()
    return name.includes(search.toLowerCase())
  })

  // ---- Render --------------------------------------------------------------

  return (
    <div style={styles.wrap}>
      {/* Conversation list */}
      <div style={styles.listCol}>
        <div style={styles.listHeader}>
          <span style={styles.listTitle}>Messages</span>
          <button onClick={openPicker} aria-label="New message" style={styles.iconBtn}>
            <i className="ti ti-edit" style={{ fontSize: '18px', color: GOLD }} aria-hidden="true" />
          </button>
        </div>

        {showPicker && (
          <div style={styles.picker}>
            <div style={styles.searchBox}>
              <i className="ti ti-search" style={{ fontSize: '14px', color: '#555' }} aria-hidden="true" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search people"
                style={styles.searchInput}
              />
              <button onClick={() => setShowPicker(false)} aria-label="Close" style={styles.iconBtn}>
                <i className="ti ti-x" style={{ fontSize: '15px', color: '#777' }} aria-hidden="true" />
              </button>
            </div>
            <div style={styles.pickerList}>
              {filteredPeople.map(p => (
                <button key={p.id} onClick={() => startConversation(p)} style={styles.pickerRow}>
                  <div style={styles.avatarSm}>{initials(p.first_name, p.last_name)}</div>
                  <span style={styles.pickerName}>{p.first_name} {p.last_name}</span>
                </button>
              ))}
              {!filteredPeople.length && <div style={styles.empty}>No one found</div>}
            </div>
          </div>
        )}

        <div style={styles.convScroll}>
          {conversations.map(c => {
            const active = activeConv?.id === c.id
            return (
              <button
                key={c.id}
                onClick={() => setActiveConv({ id: c.id, other: c.other })}
                style={{ ...styles.convRow, ...(active ? styles.convRowActive : {}) }}
              >
                <div style={styles.avatarMd}>{initials(c.other.first_name, c.other.last_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.convTop}>
                    <span style={styles.convName}>{c.other.first_name} {c.other.last_name?.[0] ? c.other.last_name[0] + '.' : ''}</span>
                    <span style={styles.convTime}>{shortTime(c.last_message_at)}</span>
                  </div>
                  <div style={{ ...styles.convPreview, color: c.unread ? GOLD : '#999' }}>{c.preview}</div>
                </div>
                {c.unread && <div style={styles.unreadDot} />}
              </button>
            )
          })}
          {!conversations.length && !showPicker && (
            <div style={styles.empty}>No conversations yet. Tap the pencil to start one.</div>
          )}
        </div>
      </div>

      {/* Thread pane */}
      <div style={styles.threadCol}>
        {!activeConv ? (
          <div style={styles.placeholder}>
            <i className="ti ti-message" style={{ fontSize: '34px', color: '#2a2a2a' }} aria-hidden="true" />
            <span style={{ fontSize: '13px', color: '#555' }}>Select a conversation</span>
          </div>
        ) : (
          <>
            <div style={styles.threadHeader}>
              <div style={styles.avatarSm}>{initials(activeConv.other.first_name, activeConv.other.last_name)}</div>
              <span style={styles.threadName}>{activeConv.other.first_name} {activeConv.other.last_name}</span>
            </div>

            <div ref={scrollRef} style={styles.messageScroll}>
              {topLevel.map(m => {
                const mine = m.user_id === me
                const hearts = (reactions[m.id] || []).filter(r => r.emoji === 'heart')
                const iHearted = hearts.some(r => r.user_id === me)
                const replies = repliesByParent[m.id] || []
                const threadOpen = openThreads[m.id]
                return (
                  <div key={m.id} style={{ ...styles.msgRow, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    <Bubble
                      m={m} mine={mine}
                      onHeart={() => toggleHeart(m)}
                      onReply={() => setReplyTo(m)}
                      onDelete={() => softDelete(m)}
                    />
                    {hearts.length > 0 && (
                      <div style={{ ...styles.reactionPill, borderColor: iHearted ? GOLD : '#333', color: iHearted ? GOLD : '#999' }}>
                        <i className="ti ti-heart" style={{ fontSize: '11px' }} aria-hidden="true" /> {hearts.length}
                      </div>
                    )}
                    {replies.length > 0 && (
                      <button
                        onClick={() => setOpenThreads(p => ({ ...p, [m.id]: !p[m.id] }))}
                        style={styles.threadToggle}
                      >
                        <i className="ti ti-arrow-back-up" style={{ fontSize: '13px' }} aria-hidden="true" />
                        {' '}{replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                      </button>
                    )}
                    {threadOpen && replies.map(r => {
                      const rMine = r.user_id === me
                      return (
                        <div key={r.id} style={{ ...styles.replyRow, alignItems: rMine ? 'flex-end' : 'flex-start' }}>
                          <Bubble
                            m={r} mine={rMine} small
                            onHeart={() => toggleHeart(r)}
                            onReply={() => setReplyTo(m)}
                            onDelete={() => softDelete(r)}
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
              {!topLevel.length && <div style={styles.empty}>Say hello.</div>}
            </div>

            {replyTo && (
              <div style={styles.replyBanner}>
                <span style={{ color: '#999', fontSize: '11px' }}>
                  Replying to {replyTo.deleted_at ? 'a message' : (replyTo.body || 'an attachment').slice(0, 40)}
                </span>
                <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" style={styles.iconBtn}>
                  <i className="ti ti-x" style={{ fontSize: '14px', color: '#777' }} aria-hidden="true" />
                </button>
              </div>
            )}

            <div style={styles.composer}>
              <button onClick={() => fileRef.current?.click()} aria-label="Attach photo" style={styles.iconBtn}>
                <i className="ti ti-photo" style={{ fontSize: '20px', color: uploading ? GOLD : '#777' }} aria-hidden="true" />
              </button>
              <input ref={fileRef} type="file" accept="image/*,video/*,image/gif" onChange={handleFile} style={{ display: 'none' }} />
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={`Message ${activeConv.other.first_name || ''}`}
                style={styles.composerInput}
              />
              <button onClick={send} aria-label="Send" style={styles.sendBtn}>
                <i className="ti ti-arrow-up" style={{ fontSize: '18px', color: '#0A0A0A' }} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Bubble({ m, mine, small, onHeart, onReply, onDelete }) {
  const [hover, setHover] = useState(false)
  const atts = m.attachments || []
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'center', gap: '6px', maxWidth: '68%' }}
    >
      <div style={{
        background: m.deleted_at ? 'transparent' : (mine ? GOLD : '#2a2a2a'),
        color: m.deleted_at ? '#666' : (mine ? '#0A0A0A' : '#f0f0f0'),
        fontSize: small ? '12px' : '13px',
        padding: atts.length && !m.body ? '4px' : '9px 13px',
        borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        border: m.deleted_at ? '0.5px dashed #444' : 'none',
        fontStyle: m.deleted_at ? 'italic' : 'normal',
        lineHeight: 1.4,
        wordBreak: 'break-word',
      }}>
        {m.deleted_at ? 'Message deleted' : (
          <>
            {atts.map((a, i) => a.type === 'video' ? (
              <video key={i} src={a.url} controls style={{ maxWidth: '220px', borderRadius: '10px', display: 'block' }} />
            ) : (
              <img key={i} src={a.url} alt={a.name || 'attachment'} style={{ maxWidth: '220px', borderRadius: '10px', display: 'block' }} />
            ))}
            {m.body && <span>{m.body}</span>}
          </>
        )}
      </div>
      {!m.deleted_at && hover && (
        <div style={{ display: 'flex', gap: '2px' }}>
          <button onClick={onHeart} aria-label="Heart" style={miniBtn}>
            <i className="ti ti-heart" style={{ fontSize: '14px', color: '#888' }} aria-hidden="true" />
          </button>
          <button onClick={onReply} aria-label="Reply" style={miniBtn}>
            <i className="ti ti-arrow-back-up" style={{ fontSize: '14px', color: '#888' }} aria-hidden="true" />
          </button>
          {mine && (
            <button onClick={onDelete} aria-label="Delete" style={miniBtn}>
              <i className="ti ti-trash" style={{ fontSize: '14px', color: '#888' }} aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const miniBtn = {
  width: '24px', height: '24px', borderRadius: '6px', background: 'transparent',
  border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const styles = {
  wrap: {
    display: 'grid',
    gridTemplateColumns: '240px 1fr',
    height: '100%',
    minHeight: 0,
  },
  listCol: {
    borderRight: '0.5px solid #2a2a2a',
    background: '#0f0f0f',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  listHeader: {
    padding: '18px 16px 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  listTitle: { fontSize: '17px', fontWeight: '600', color: '#fff' },
  picker: {
    borderBottom: '0.5px solid #2a2a2a',
    background: '#0A0A0A',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '10px 12px',
  },
  searchInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'Montserrat, sans-serif',
  },
  pickerList: { maxHeight: '220px', overflowY: 'auto', paddingBottom: '6px' },
  pickerRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '9px 14px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'Montserrat, sans-serif',
  },
  pickerName: { fontSize: '13px', color: '#fff', fontWeight: '500' },
  convScroll: { flex: 1, overflowY: 'auto', minHeight: 0 },
  convRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '12px 14px',
    background: 'transparent',
    border: 'none',
    borderLeft: '2px solid transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'Montserrat, sans-serif',
  },
  convRowActive: {
    background: 'rgba(201,168,76,0.06)',
    borderLeft: `2px solid ${GOLD}`,
  },
  convTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  convName: { fontSize: '13px', fontWeight: '500', color: '#fff' },
  convTime: { fontSize: '10px', color: '#555' },
  convPreview: {
    fontSize: '11px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    marginTop: '1px',
  },
  unreadDot: { width: '8px', height: '8px', borderRadius: '50%', background: GOLD, flexShrink: 0 },
  threadCol: { display: 'flex', flexDirection: 'column', minHeight: 0 },
  placeholder: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
  },
  threadHeader: {
    padding: '14px 20px',
    borderBottom: '0.5px solid #2a2a2a',
    display: 'flex',
    alignItems: 'center',
    gap: '11px',
    flexShrink: 0,
  },
  threadName: { fontSize: '14px', fontWeight: '600', color: '#fff' },
  messageScroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '18px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minHeight: 0,
  },
  msgRow: { display: 'flex', flexDirection: 'column', gap: '4px' },
  replyRow: { display: 'flex', flexDirection: 'column', marginTop: '4px', paddingLeft: '18px' },
  reactionPill: {
    background: '#1E1E1E',
    border: '0.5px solid #333',
    borderRadius: '12px',
    padding: '2px 8px',
    fontSize: '11px',
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    width: 'fit-content',
  },
  threadToggle: {
    background: 'transparent',
    border: 'none',
    color: '#777',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '2px 0',
    fontFamily: 'Montserrat, sans-serif',
    width: 'fit-content',
  },
  replyBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '8px 20px',
    borderTop: '0.5px solid #2a2a2a',
    background: '#0f0f0f',
  },
  composer: {
    padding: '14px 20px',
    borderTop: '0.5px solid #2a2a2a',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexShrink: 0,
  },
  composerInput: {
    flex: 1,
    background: '#0A0A0A',
    border: '0.5px solid #333',
    borderRadius: '20px',
    padding: '10px 15px',
    fontSize: '13px',
    color: '#fff',
    fontFamily: 'Montserrat, sans-serif',
  },
  sendBtn: {
    width: '34px',
    height: '34px',
    borderRadius: '50%',
    background: GOLD,
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBtn: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px',
  },
  avatarSm: {
    width: '32px', height: '32px', borderRadius: '50%', background: GOLD, color: '#0A0A0A',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0,
  },
  avatarMd: {
    width: '36px', height: '36px', borderRadius: '50%', background: '#2a2a2a', color: '#999',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0,
  },
  empty: { padding: '20px', fontSize: '12px', color: '#555', textAlign: 'center', lineHeight: 1.6 },
}
