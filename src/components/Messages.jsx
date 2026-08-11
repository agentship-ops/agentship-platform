import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import MediaPicker from './MediaPicker'

// Full-page Direct Messages. Private 1:1 with channel-parity features:
// full emoji reactions, threaded replies, edit-after-send, photo/video/file/GIF
// with an optional caption, and per-person chat delete that stays deleted.

const GOLD = '#C9A84C'
const EMOJIS = ['❤️', '👍', '😂', '🎉', '👏']

function initials(f, l) {
  return `${(f?.[0] ?? '').toUpperCase()}${(l?.[0] ?? '').toUpperCase()}` || '?'
}

function shortTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()
  }
  const diffDays = Math.floor((now - d) / 86400000)
  if (diffDays === 1) return 'Yest'
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' })
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export default function Messages({ onUnreadChange }) {
  const [currentUser, setCurrentUser] = useState(null)
  const me = currentUser?.id

  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null) // { id, other, clearedAt }
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [hoveredId, setHoveredId] = useState(null)
  const [pickerFor, setPickerFor] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editText, setEditText] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [people, setPeople] = useState([])
  const [search, setSearch] = useState('')

  const endRef = useRef(null)
  const lastLenRef = useRef(0)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setCurrentUser(data?.session?.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setCurrentUser(session?.user ?? null))
    return () => { sub?.subscription?.unsubscribe() }
  }, [])

  // ---- Conversation list ---------------------------------------------------

  const loadConversations = useCallback(async () => {
    if (!me) return
    const { data: convs } = await supabase
      .from('dm_conversations').select('*').order('last_message_at', { ascending: false })
    if (!convs) return

    const otherIds = convs.map(c => (c.user_low === me ? c.user_high : c.user_low))
    const profilesById = {}
    if (otherIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, first_name, last_name').in('id', otherIds)
      ;(profs || []).forEach(p => { profilesById[p.id] = p })
    }

    const { data: readRows } = await supabase.from('dm_reads').select('conversation_id, last_read_at').eq('user_id', me)
    const readMap = {}
    ;(readRows || []).forEach(r => { readMap[r.conversation_id] = r.last_read_at })

    const { data: clearedRows } = await supabase.from('dm_cleared').select('conversation_id, cleared_at').eq('user_id', me)
    const clearedMap = {}
    ;(clearedRows || []).forEach(r => { clearedMap[r.conversation_id] = r.cleared_at })

    const convIds = convs.map(c => c.id)
    const previews = {}
    if (convIds.length) {
      const { data: recent } = await supabase
        .from('dm_messages')
        .select('conversation_id, body, attachments, user_id, created_at, deleted_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false })
        .limit(400)
      ;(recent || []).forEach(m => { if (!previews[m.conversation_id]) previews[m.conversation_id] = m })
    }

    const shaped = convs.map(c => {
      const otherId = c.user_low === me ? c.user_high : c.user_low
      const last = previews[c.id]
      const lastRead = readMap[c.id]
      const clearedAt = clearedMap[c.id]
      const unread = last && last.user_id !== me && (!lastRead || new Date(last.created_at) > new Date(lastRead))
      return {
        id: c.id,
        last_message_at: c.last_message_at,
        clearedAt,
        other: profilesById[otherId] || { id: otherId, first_name: '', last_name: '' },
        preview: last ? previewText(last) : '',
        unread: !!unread,
      }
    }).filter(c => !c.clearedAt || new Date(c.last_message_at) > new Date(c.clearedAt))

    setConversations(shaped)
    if (onUnreadChange) onUnreadChange(shaped.filter(c => c.unread).length)
  }, [me, onUnreadChange])

  function previewText(m) {
    if (m.deleted_at) return 'Message deleted'
    if (m.body) return m.body
    const atts = m.attachments || []
    if (atts.length) return atts[0].type === 'video' ? 'Video' : atts[0].type === 'file' ? (atts[0].name || 'File') : atts[0].type === 'gif' ? 'GIF' : 'Photo'
    return ''
  }

  // ---- Messages ------------------------------------------------------------

  const loadMessages = useCallback(async (conv) => {
    if (!conv) return
    let query = supabase.from('dm_messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true })
    if (conv.clearedAt) query = query.gt('created_at', conv.clearedAt)
    const { data } = await query

    const msgs = data || []
    const ids = msgs.map(m => m.id)
    const byMsg = {}
    if (ids.length) {
      const { data: rx } = await supabase.from('dm_message_reactions').select('message_id, emoji, user_id').in('message_id', ids)
      ;(rx || []).forEach(r => {
        byMsg[r.message_id] = byMsg[r.message_id] || {}
        const cell = byMsg[r.message_id][r.emoji] || { count: 0, mine: false }
        cell.count += 1
        if (r.user_id === me) cell.mine = true
        byMsg[r.message_id][r.emoji] = cell
      })
    }
    setMessages(msgs.map(m => ({ ...m, reactions: byMsg[m.id] || {} })))
  }, [me])

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

  async function openConversation(entry) {
    // Always look up the person's own cleared point so deleted history never returns.
    const { data } = await supabase
      .from('dm_cleared').select('cleared_at')
      .eq('conversation_id', entry.id).eq('user_id', me).maybeSingle()
    const conv = { id: entry.id, other: entry.other, clearedAt: data?.cleared_at || null }
    setActiveConv(conv)
    setEditingId(null); setReplyTo(null); setPending([])
    lastLenRef.current = 0
    loadMessages(conv)
    markRead(conv.id)
  }

  // ---- Effects -------------------------------------------------------------

  useEffect(() => { loadConversations() }, [loadConversations])

  useEffect(() => {
    if (!activeConv) return
    const ch = supabase
      .channel(`dm-${activeConv.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_messages', filter: `conversation_id=eq.${activeConv.id}` },
        () => { loadMessages(activeConv); markRead(activeConv.id) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_message_reactions' },
        () => loadMessages(activeConv))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [activeConv, loadMessages, markRead])

  useEffect(() => {
    if (!me) return
    const ch = supabase.channel('dm-conv-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dm_conversations' }, () => loadConversations())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [me, loadConversations])

  // Only auto-scroll when a new message arrives, so playing videos don't get yanked.
  useEffect(() => {
    if (messages.length > lastLenRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth' })
    lastLenRef.current = messages.length
  }, [messages])

  // ---- Actions -------------------------------------------------------------

  async function openPeople() {
    setShowPicker(true); setSearch('')
    if (!people.length) {
      const { data } = await supabase.from('profiles').select('id, first_name, last_name').neq('id', me).order('first_name', { ascending: true })
      setPeople(data || [])
    }
  }

  async function startConversation(person) {
    const { data, error } = await supabase.rpc('get_or_create_dm', { other_user: person.id })
    if (error) { console.error(error); return }
    setShowPicker(false)
    openConversation({ id: data, other: person })
    loadConversations()
  }

  function addPending(att) { setPending(p => [...p, att]) }
  function removePending(i) { setPending(p => p.filter((_, j) => j !== i)) }

  async function send() {
    const body = draft.trim()
    if ((!body && pending.length === 0) || !activeConv || !me) return
    const payload = { conversation_id: activeConv.id, user_id: me, body }
    if (pending.length) payload.attachments = pending
    if (replyTo) payload.parent_id = replyTo.id
    setDraft(''); setPending([]); setReplyTo(null)
    const { error } = await supabase.from('dm_messages').insert(payload)
    if (error) { console.error('Send failed:', error); setDraft(body) }
    loadMessages(activeConv)
  }

  async function toggleReaction(m, emoji) {
    if (!me) return
    setPickerFor(null)
    const mine = m.reactions?.[emoji]?.mine
    if (mine) {
      await supabase.from('dm_message_reactions').delete().match({ message_id: m.id, user_id: me, emoji })
    } else {
      await supabase.from('dm_message_reactions').insert({ message_id: m.id, user_id: me, emoji })
    }
    loadMessages(activeConv)
  }

  function startEdit(m) { setEditingId(m.id); setEditText(m.body); setPickerFor(null) }
  function cancelEdit() { setEditingId(null); setEditText('') }
  async function saveEdit(m) {
    const body = editText.trim()
    if (!body) return
    setEditingId(null)
    await supabase.from('dm_messages').update({ body, edited_at: new Date().toISOString() }).eq('id', m.id)
    loadMessages(activeConv)
  }

  async function softDelete(m) {
    if (!window.confirm('Delete this message?')) return
    await supabase.from('dm_messages').update({ deleted_at: new Date().toISOString(), deleted_by: me }).eq('id', m.id)
    loadMessages(activeConv)
  }

  async function deleteChat() {
    if (!activeConv) return
    if (!window.confirm('Delete this chat? It is removed for you only, and the old messages will not come back. It reappears empty if they message you again.')) return
    await supabase.from('dm_cleared').upsert(
      { conversation_id: activeConv.id, user_id: me, cleared_at: new Date().toISOString() },
      { onConflict: 'conversation_id,user_id' }
    )
    setActiveConv(null); setMessages([])
    loadConversations()
  }

  // ---- Derived -------------------------------------------------------------

  const topLevel = messages.filter(m => !m.parent_id)
  const repliesByParent = {}
  messages.filter(m => m.parent_id).forEach(m => {
    repliesByParent[m.parent_id] = repliesByParent[m.parent_id] || []
    repliesByParent[m.parent_id].push(m)
  })

  const filteredPeople = people.filter(p =>
    `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase().includes(search.toLowerCase()))

  function renderAttachment(a, i, mine) {
    if (a.type === 'video') return <video key={i} src={a.url} controls style={styles.media} />
    if (a.type === 'file') return (
      <a key={i} href={a.url} target="_blank" rel="noreferrer" style={{ ...styles.fileChip, color: mine ? '#0A0A0A' : '#e8e8e8' }}>
        <i className="ti ti-paperclip" aria-hidden="true" /> {a.name || 'File'}
      </a>
    )
    return <img key={i} src={a.url} alt={a.name || 'attachment'} style={styles.media} />
  }

  // render function (not a nested component) so videos aren't remounted on reload
  function renderMessage(m, isReply) {
    const mine = m.user_id === me
    const rx = Object.entries(m.reactions || {})
    const editing = editingId === m.id
    const atts = m.attachments || []
    const canEdit = mine && m.body && !m.deleted_at

    return (
      <div
        key={m.id}
        style={{ ...styles.row, alignItems: mine ? 'flex-end' : 'flex-start' }}
        onMouseEnter={() => setHoveredId(m.id)}
        onMouseLeave={() => { setHoveredId(null); setPickerFor(null) }}
      >
        <div style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', alignItems: 'center', gap: '6px', maxWidth: '72%' }}>
          {editing ? (
            <div style={styles.editWrap}>
              <input
                style={styles.editInput} value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(m) } if (e.key === 'Escape') cancelEdit() }}
                autoFocus
              />
              <div style={styles.editBtns}>
                <button style={styles.editSave} onClick={() => saveEdit(m)}>Save</button>
                <button style={styles.editCancel} onClick={cancelEdit}>Cancel</button>
              </div>
            </div>
          ) : (
            <div style={{
              background: m.deleted_at ? 'transparent' : (mine ? GOLD : '#2a2a2a'),
              color: m.deleted_at ? '#666' : (mine ? '#0A0A0A' : '#f0f0f0'),
              fontSize: isReply ? '12px' : '13px',
              padding: atts.length && !m.body ? '4px' : '9px 13px',
              borderRadius: mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              border: m.deleted_at ? '0.5px dashed #444' : 'none',
              fontStyle: m.deleted_at ? 'italic' : 'normal',
              lineHeight: 1.4, wordBreak: 'break-word',
              display: 'flex', flexDirection: 'column', gap: atts.length && m.body ? '6px' : 0,
            }}>
              {m.deleted_at ? 'Message deleted' : (
                <>
                  {atts.map((a, i) => renderAttachment(a, i, mine))}
                  {m.body && <span>{m.body}{m.edited_at && <span style={{ ...styles.editedTag, color: mine ? 'rgba(10,10,10,0.55)' : '#888' }}>edited</span>}</span>}
                </>
              )}
            </div>
          )}

          {!m.deleted_at && !editing && hoveredId === m.id && (
            <div style={styles.actions}>
              {pickerFor === m.id ? (
                EMOJIS.map(e => (<button key={e} onClick={() => toggleReaction(m, e)} style={styles.actEmoji}>{e}</button>))
              ) : (
                <>
                  <button style={styles.actBtn} onClick={() => setPickerFor(m.id)} aria-label="React"><i className="ti ti-mood-smile" aria-hidden="true" /></button>
                  <button style={styles.actBtn} onClick={() => { setReplyTo(m); setPickerFor(null) }} aria-label="Reply"><i className="ti ti-corner-up-left" aria-hidden="true" /></button>
                  {canEdit && <button style={styles.actBtn} onClick={() => startEdit(m)} aria-label="Edit"><i className="ti ti-pencil" aria-hidden="true" /></button>}
                  {mine && <button style={styles.actBtn} onClick={() => softDelete(m)} aria-label="Delete"><i className="ti ti-trash" aria-hidden="true" /></button>}
                </>
              )}
            </div>
          )}
        </div>

        {rx.length > 0 && (
          <div style={{ ...styles.reactions, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
            {rx.map(([emoji, info]) => (
              <button key={emoji} onClick={() => toggleReaction(m, emoji)} style={{ ...styles.rx, ...(info.mine ? styles.rxMine : {}) }}>
                <span style={styles.rxEmoji}>{emoji}</span> {info.count}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ---- Render --------------------------------------------------------------

  return (
    <div style={styles.wrap}>
      <div style={styles.listCol}>
        <div style={styles.listHeader}>
          <span style={styles.listTitle}>Messages</span>
          <button onClick={openPeople} aria-label="New message" style={styles.iconBtn}>
            <i className="ti ti-edit" style={{ fontSize: '18px', color: GOLD }} aria-hidden="true" />
          </button>
        </div>

        {showPicker && (
          <div style={styles.picker}>
            <div style={styles.searchBox}>
              <i className="ti ti-search" style={{ fontSize: '14px', color: '#555' }} aria-hidden="true" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search people" style={styles.searchInput} />
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
              <button key={c.id} onClick={() => openConversation(c)} style={{ ...styles.convRow, ...(active ? styles.convRowActive : {}) }}>
                <div style={styles.avatarMd}>{initials(c.other.first_name, c.other.last_name)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.convTop}>
                    <span style={styles.convName}>{c.other.first_name} {c.other.last_name}</span>
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
              <div style={{ flex: 1 }} />
              <button onClick={deleteChat} aria-label="Delete chat" style={styles.iconBtn}>
                <i className="ti ti-trash" style={{ fontSize: '17px', color: '#777' }} aria-hidden="true" />
              </button>
            </div>

            <div style={styles.messageScroll}>
              {topLevel.map(m => {
                const replies = repliesByParent[m.id] || []
                return (
                  <div key={m.id}>
                    {renderMessage(m, false)}
                    {replies.length > 0 && (
                      <div style={styles.thread}>
                        {replies.map(r => renderMessage(r, true))}
                        <div style={styles.threadFoot}>
                          <i className="ti ti-corner-up-left" aria-hidden="true" style={{ fontSize: 12 }} />
                          {' '}{replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              {!topLevel.length && <div style={styles.empty}>Say hello.</div>}
              <div ref={endRef} />
            </div>

            {replyTo && (
              <div style={styles.replyBanner}>
                <span style={{ color: '#aaa', fontSize: '12px' }}>
                  Replying to <strong style={{ color: GOLD }}>{replyTo.deleted_at ? 'a message' : (replyTo.body || 'an attachment').slice(0, 40)}</strong>
                </span>
                <button onClick={() => setReplyTo(null)} aria-label="Cancel reply" style={styles.iconBtn}>
                  <i className="ti ti-x" style={{ fontSize: '14px', color: '#777' }} aria-hidden="true" />
                </button>
              </div>
            )}

            {pending.length > 0 && (
              <div style={styles.pendingRow}>
                {pending.map((a, i) => (
                  <div key={i} style={styles.pendingItem}>
                    {(a.type === 'image' || a.type === 'gif')
                      ? <img src={a.url} alt="" style={styles.pendingThumb} />
                      : <div style={styles.pendingFile}><i className={`ti ${a.type === 'video' ? 'ti-video' : 'ti-paperclip'}`} aria-hidden="true" /> {a.name || a.type}</div>}
                    <button onClick={() => removePending(i)} style={styles.pendingX} aria-label="Remove">
                      <i className="ti ti-x" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div style={styles.composer}>
              <MediaPicker pathPrefix={`dm/${activeConv.id}`} onAttach={addPending} />
              <input
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
                placeholder={`Message ${activeConv.other.first_name || ''}`}
                style={styles.composerInput}
              />
              <button onClick={send} aria-label="Send" style={styles.sendBtn}>
                <i className="ti ti-send" style={{ fontSize: '18px', color: '#0A0A0A' }} aria-hidden="true" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  wrap: { display: 'grid', gridTemplateColumns: '240px 1fr', height: '100%', minHeight: 0 },
  listCol: { borderRight: '0.5px solid #2a2a2a', background: '#0f0f0f', display: 'flex', flexDirection: 'column', minHeight: 0 },
  listHeader: { padding: '18px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  listTitle: { fontSize: '17px', fontWeight: '600', color: '#fff' },
  picker: { borderBottom: '0.5px solid #2a2a2a', background: '#0A0A0A' },
  searchBox: { display: 'flex', alignItems: 'center', gap: '7px', padding: '10px 12px' },
  searchInput: { flex: 1, background: 'transparent', border: 'none', color: '#fff', fontSize: '13px', fontFamily: 'Montserrat, sans-serif', outline: 'none' },
  pickerList: { maxHeight: '240px', overflowY: 'auto', paddingBottom: '6px' },
  pickerRow: { width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'Montserrat, sans-serif' },
  pickerName: { fontSize: '13px', color: '#fff', fontWeight: '500' },
  convScroll: { flex: 1, overflowY: 'auto', minHeight: 0 },
  convRow: { width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', background: 'transparent', border: 'none', borderLeft: '2px solid transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'Montserrat, sans-serif' },
  convRowActive: { background: 'rgba(201,168,76,0.06)', borderLeft: `2px solid ${GOLD}` },
  convTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' },
  convName: { fontSize: '13px', fontWeight: '500', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  convTime: { fontSize: '10px', color: '#555', flexShrink: 0 },
  convPreview: { fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: '1px' },
  unreadDot: { width: '8px', height: '8px', borderRadius: '50%', background: GOLD, flexShrink: 0 },
  threadCol: { display: 'flex', flexDirection: 'column', minHeight: 0 },
  placeholder: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' },
  threadHeader: { padding: '14px 20px', borderBottom: '0.5px solid #2a2a2a', display: 'flex', alignItems: 'center', gap: '11px', flexShrink: 0 },
  threadName: { fontSize: '14px', fontWeight: '600', color: '#fff' },
  messageScroll: { flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0 },
  row: { display: 'flex', flexDirection: 'column', gap: '4px' },
  media: { maxWidth: '220px', borderRadius: '10px', display: 'block' },
  fileChip: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', textDecoration: 'underline', wordBreak: 'break-all' },
  editedTag: { fontSize: '10px', marginLeft: '6px' },
  actions: { display: 'flex', gap: '2px', background: '#161616', border: '0.5px solid #333', borderRadius: '8px', padding: '2px' },
  actBtn: { width: '26px', height: '26px', borderRadius: '6px', background: 'transparent', color: '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', border: 'none', cursor: 'pointer' },
  actEmoji: { width: '28px', height: '26px', borderRadius: '6px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  reactions: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  rx: { display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#1a1a1a', border: '0.5px solid #333', borderRadius: '12px', padding: '3px 9px', fontSize: '11px', color: '#ccc', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  rxMine: { borderColor: 'rgba(201,168,76,0.55)', background: 'rgba(201,168,76,0.10)', color: '#fff' },
  rxEmoji: { fontSize: '12px', lineHeight: 1 },
  thread: { margin: '6px 0 4px 24px', borderLeft: '2px solid rgba(201,168,76,0.35)', paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '6px' },
  threadFoot: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: GOLD, marginTop: '2px', opacity: 0.85 },
  editWrap: { minWidth: '220px' },
  editInput: { width: '100%', background: '#1E1E1E', border: '0.5px solid #333', borderRadius: '8px', color: '#fff', fontSize: '13px', fontFamily: 'Montserrat, sans-serif', padding: '9px 12px', outline: 'none' },
  editBtns: { display: 'flex', gap: '8px', marginTop: '6px' },
  editSave: { background: GOLD, color: '#0A0A0A', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  editCancel: { background: 'transparent', color: '#888', border: '0.5px solid #333', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  replyBanner: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px', borderTop: '0.5px solid #2a2a2a', background: '#0f0f0f' },
  pendingRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '10px 20px', borderTop: '0.5px solid #2a2a2a', background: '#0f0f0f' },
  pendingItem: { position: 'relative' },
  pendingThumb: { width: '54px', height: '54px', objectFit: 'cover', borderRadius: '8px', display: 'block' },
  pendingFile: { display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '160px', height: '54px', padding: '0 10px', background: '#1E1E1E', border: '0.5px solid #333', borderRadius: '8px', fontSize: '11px', color: '#ccc', overflow: 'hidden' },
  pendingX: { position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: '#0A0A0A', border: '0.5px solid #444', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', padding: 0 },
  composer: { padding: '14px 20px', borderTop: '0.5px solid #2a2a2a', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  composerInput: { flex: 1, background: '#0A0A0A', border: '0.5px solid #333', borderRadius: '20px', padding: '10px 15px', fontSize: '13px', color: '#fff', fontFamily: 'Montserrat, sans-serif', outline: 'none' },
  sendBtn: { width: '34px', height: '34px', borderRadius: '50%', background: GOLD, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconBtn: { background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px' },
  avatarSm: { width: '32px', height: '32px', borderRadius: '50%', background: GOLD, color: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 },
  avatarMd: { width: '36px', height: '36px', borderRadius: '50%', background: '#2a2a2a', color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0 },
  empty: { padding: '20px', fontSize: '12px', color: '#555', textAlign: 'center', lineHeight: 1.6 },
}
