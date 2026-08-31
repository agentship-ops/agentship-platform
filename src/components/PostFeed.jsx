import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import MediaPicker from './MediaPicker'

// One component drives both post spaces. Bullpen and Referrals share the same
// `posts` table keyed by `space`, the same way channels share `messages` keyed
// by `channel`. Reactions, comments, comment reactions, @mentions and media all
// mirror the channel model. Referrals add a claim action; Bullpen is admin-post.

const EMOJIS = ['❤️', '👍', '😂', '🎉', '👏']

const CONFIG = {
  bullpen: {
    title: 'Bullpen',
    subtitle: 'Updates and announcements from the team',
    tags: ['Welcome', 'Update', 'Celebrate'],
    placeholder: 'Share an update. Type @ to tag a teammate…',
    adminOnly: true,
    claim: false,
    readonlyNote: 'Only admins can post in the Bullpen. You can still react and comment.',
  },
  referrals: {
    title: 'Referrals',
    subtitle: 'Share and claim referral opportunities across the network',
    tags: ['Buyer', 'Seller', 'Seller/Buyer', 'Commercial'],
    placeholder: 'Post a referral. Type @ to tag a teammate…',
    adminOnly: false,
    claim: true,
    readonlyNote: '',
  },
}

export default function PostFeed({ space }) {
  const cfg = CONFIG[space] || CONFIG.referrals
  const { user, profile } = useAuth()
  const accountType = profile?.account_type ?? null
  const isStaff = accountType === 'admin' || accountType === 'leader'
  const canPost = !cfg.adminOnly || accountType === 'admin'

  const [members, setMembers] = useState([])
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)

  // Composer
  const [text, setText] = useState('')
  const [tag, setTag] = useState(cfg.tags[0])
  const [pending, setPending] = useState([])
  const [mentioned, setMentioned] = useState([])

  // Per-post comment drafts: { [postId]: { text, pending:[], mentioned:[] } }
  const [drafts, setDrafts] = useState({})
  const [openComments, setOpenComments] = useState(() => new Set())

  // Editing
  const [editingPost, setEditingPost] = useState(null)
  const [editPostText, setEditPostText] = useState('')
  const [editingComment, setEditingComment] = useState(null)
  const [editCommentText, setEditCommentText] = useState('')

  // Small UI state
  const [menuFor, setMenuFor] = useState(null)
  const [reactionPicker, setReactionPicker] = useState(null) // { scope, id }
  const [mentionBox, setMentionBox] = useState(null)          // { target, at, query }

  const composerRef = useRef(null)

  // Reset composer when switching between Bullpen and Referrals.
  useEffect(() => {
    setText(''); setPending([]); setMentioned([]); setTag(cfg.tags[0])
    setDrafts({}); setOpenComments(new Set()); setMentionBox(null); setMenuFor(null)
    setReactionPicker(null); setEditingPost(null); setEditingComment(null)
  }, [space]) // eslint-disable-line react-hooks/exhaustive-deps

  // Member list for @mentions and for looking up photo + title at render time.
  useEffect(() => {
    supabase.from('profiles').select('id, first_name, last_name, avatar_url, title')
      .then(({ data }) => setMembers(data || []))
  }, [])
  useEffect(() => {
    const ch = supabase
      .channel('rt-postfeed-profiles')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => {
        supabase.from('profiles').select('id, first_name, last_name, avatar_url, title')
          .then(({ data }) => setMembers(data || []))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const load = useCallback(async () => {
    const { data: ps } = await supabase
      .from('posts')
      .select('*')
      .eq('space', space)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })

    const ids = (ps || []).map(p => p.id)
    let prx = [], cs = [], crx = []
    if (ids.length) {
      const { data: r } = await supabase.from('post_reactions').select('post_id, emoji, user_id').in('post_id', ids)
      prx = r || []
      const { data: c } = await supabase.from('post_comments').select('*').in('post_id', ids).order('created_at', { ascending: true })
      cs = c || []
    }
    const cids = cs.map(c => c.id)
    if (cids.length) {
      const { data: cr } = await supabase.from('post_comment_reactions').select('comment_id, emoji, user_id').in('comment_id', cids)
      crx = cr || []
    }

    const aggregate = (rows, key) => {
      const by = {}
      rows.forEach(r => {
        const k = r[key]
        by[k] = by[k] || {}
        const cell = by[k][r.emoji] || { count: 0, mine: false }
        cell.count += 1
        if (user && r.user_id === user.id) cell.mine = true
        by[k][r.emoji] = cell
      })
      return by
    }
    const prBy = aggregate(prx, 'post_id')
    const crBy = aggregate(crx, 'comment_id')

    const commentsByPost = {}
    cs.forEach(c => {
      ;(commentsByPost[c.post_id] = commentsByPost[c.post_id] || []).push({ ...c, reactions: crBy[c.id] || {} })
    })

    setPosts((ps || []).map(p => ({ ...p, reactions: prBy[p.id] || {}, comments: commentsByPost[p.id] || [] })))
    setLoading(false)
  }, [space, user])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('rt-postfeed-' + space)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_reactions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comments' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_comment_reactions' }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, space])

  // ── Member helpers ──────────────────────────────────────────────────────
  const byId = {}
  members.forEach(m => { byId[m.id] = m })
  const token = (m) => `@${m.first_name || ''}${m.last_name ? ' ' + m.last_name : ''}`
  const nameOf = (obj) => `${obj.author_first || 'Member'}${obj.author_last ? ' ' + obj.author_last : ''}`
  const initialsOf = (obj) => `${(obj.author_first?.[0] || '').toUpperCase()}${(obj.author_last?.[0] || '').toUpperCase()}` || '?'
  const avatarOf = (obj) => byId[obj.user_id]?.avatar_url || null
  const titleOf = (obj) => byId[obj.user_id]?.title || ({ admin: 'Admin', leader: 'Leader', agent: 'Agent' })[obj.author_role] || ''

  function renderBody(body) {
    if (!body) return null
    const tokens = members.map(token).filter(t => t.length > 1)
    if (!tokens.length) return body
    const escaped = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length)
    const re = new RegExp(`(${escaped.join('|')})`, 'g')
    return body.split(re).map((part, i) =>
      tokens.includes(part) ? <span key={i} style={styles.mention}>{part}</span> : part
    )
  }

  // ── @mention detection (same rule as channels) ─────────────────────────
  function detect(value, caret) {
    const upto = value.slice(0, caret)
    const at = upto.lastIndexOf('@')
    if (at === -1) return null
    const before = at === 0 ? ' ' : upto[at - 1]
    if (!/\s/.test(before)) return null
    const query = upto.slice(at + 1)
    if (/\s/.test(query)) return null
    return { at, query }
  }
  const mentionMatches = mentionBox
    ? members.filter(m => {
        if (user && m.id === user.id) return false
        return `${m.first_name || ''} ${m.last_name || ''}`.toLowerCase().includes(mentionBox.query.toLowerCase())
      }).slice(0, 6)
    : []

  function onComposerChange(e) {
    const value = e.target.value
    setText(value)
    const d = detect(value, e.target.selectionStart ?? value.length)
    setMentionBox(d ? { target: 'post', at: d.at, query: d.query } : null)
  }
  function onCommentChange(postId, e) {
    const value = e.target.value
    setDrafts(prev => ({ ...prev, [postId]: { ...(prev[postId] || { pending: [], mentioned: [] }), text: value } }))
    const d = detect(value, e.target.selectionStart ?? value.length)
    setMentionBox(d ? { target: postId, at: d.at, query: d.query } : null)
  }
  function pickMention(m) {
    if (!mentionBox) return
    const insert = token(m) + ' '
    if (mentionBox.target === 'post') {
      const caret = mentionBox.at + 1 + mentionBox.query.length
      setText(prev => prev.slice(0, mentionBox.at) + insert + prev.slice(caret))
      setMentioned(prev => prev.some(x => x.id === m.id) ? prev : [...prev, m])
    } else {
      const pid = mentionBox.target
      setDrafts(prev => {
        const d = prev[pid] || { text: '', pending: [], mentioned: [] }
        const caret = mentionBox.at + 1 + mentionBox.query.length
        return {
          ...prev,
          [pid]: {
            ...d,
            text: d.text.slice(0, mentionBox.at) + insert + d.text.slice(caret),
            mentioned: d.mentioned.some(x => x.id === m.id) ? d.mentioned : [...d.mentioned, m],
          },
        }
      })
    }
    setMentionBox(null)
  }

  // ── Composer actions ───────────────────────────────────────────────────
  function addPending(att) { setPending(p => [...p, att]) }
  function removePending(i) { setPending(p => p.filter((_, j) => j !== i)) }

  async function submitPost() {
    const body = text.trim()
    if ((!body && pending.length === 0) || !user) return
    const ids = mentioned.filter(m => body.includes(token(m))).map(m => m.id)
    const payload = { space, user_id: user.id, body, tag }
    if (pending.length) payload.attachments = pending
    if (ids.length) payload.mentions = [...new Set(ids)]
    setText(''); setPending([]); setMentioned([]); setTag(cfg.tags[0]); setMentionBox(null)
    const { error } = await supabase.from('posts').insert(payload)
    if (error) { console.error('Post failed:', error); setText(body) }
    load()
  }

  function draftFor(postId) { return drafts[postId] || { text: '', pending: [], mentioned: [] } }
  function addCommentPending(postId, att) {
    setDrafts(prev => { const d = draftFor(postId); return { ...prev, [postId]: { ...d, pending: [...d.pending, att] } } })
  }
  function removeCommentPending(postId, i) {
    setDrafts(prev => { const d = draftFor(postId); return { ...prev, [postId]: { ...d, pending: d.pending.filter((_, j) => j !== i) } } })
  }
  async function submitComment(postId) {
    const d = draftFor(postId)
    const body = (d.text || '').trim()
    if ((!body && d.pending.length === 0) || !user) return
    const ids = d.mentioned.filter(m => body.includes(token(m))).map(m => m.id)
    const payload = { post_id: postId, user_id: user.id, body }
    if (d.pending.length) payload.attachments = d.pending
    if (ids.length) payload.mentions = [...new Set(ids)]
    setDrafts(prev => ({ ...prev, [postId]: { text: '', pending: [], mentioned: [] } }))
    setMentionBox(null)
    const { error } = await supabase.from('post_comments').insert(payload)
    if (error) console.error('Comment failed:', error)
    load()
  }

  // ── Reactions ──────────────────────────────────────────────────────────
  async function toggleReaction(scope, obj, emoji) {
    if (!user) return
    setReactionPicker(null)
    const mine = obj.reactions?.[emoji]?.mine
    const table = scope === 'post' ? 'post_reactions' : 'post_comment_reactions'
    const key = scope === 'post' ? { post_id: obj.id } : { comment_id: obj.id }
    if (mine) await supabase.from(table).delete().match({ ...key, user_id: user.id, emoji })
    else await supabase.from(table).insert({ ...key, user_id: user.id, emoji })
    load()
  }

  // ── Claim ──────────────────────────────────────────────────────────────
  async function claim(p) { await supabase.rpc('claim_referral', { p_post: p.id }); load() }
  async function unclaim(p) { await supabase.rpc('unclaim_referral', { p_post: p.id }); load() }

  // ── Edit / delete ──────────────────────────────────────────────────────
  const canEditPost = (p) => user && (p.user_id === user.id || isStaff)
  const canEditComment = (c) => user && (c.user_id === user.id || isStaff)

  function startEditPost(p) { setEditingPost(p.id); setEditPostText(p.body); setMenuFor(null) }
  async function saveEditPost(p) {
    const body = editPostText.trim()
    setEditingPost(null)
    await supabase.from('posts').update({ body }).eq('id', p.id)
    load()
  }
  async function deletePost(p) {
    if (!window.confirm('Delete this post? This cannot be undone.')) return
    setMenuFor(null)
    await supabase.from('posts').delete().eq('id', p.id)
    load()
  }
  async function togglePin(p) {
    setMenuFor(null)
    await supabase.from('posts').update({ pinned: !p.pinned }).eq('id', p.id)
    load()
  }
  function startEditComment(c) { setEditingComment(c.id); setEditCommentText(c.body) }
  async function saveEditComment(c) {
    const body = editCommentText.trim()
    setEditingComment(null)
    await supabase.from('post_comments').update({ body }).eq('id', c.id)
    load()
  }
  async function deleteComment(c) {
    if (!window.confirm('Delete this comment?')) return
    await supabase.from('post_comments').delete().eq('id', c.id)
    load()
  }

  function toggleComments(id) {
    setOpenComments(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const time = (iso) => {
    const d = new Date(iso), now = new Date()
    const mins = Math.floor((now - d) / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `${days}d`
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // ── Attachment rendering (same shapes as channels) ─────────────────────
  function renderAttachment(a, i) {
    if (a.type === 'video') return <video key={i} src={a.url} controls style={styles.mediaItem} />
    if (a.type === 'file') return (
      <a key={i} href={a.url} target="_blank" rel="noreferrer" style={styles.fileChip}>
        <i className="ti ti-paperclip" aria-hidden="true" /> {a.name || 'File'}
      </a>
    )
    return <img key={i} src={a.url} alt={a.name || 'attachment'} style={styles.mediaItem} />
  }

  function reactionRow(scope, obj) {
    const rx = Object.entries(obj.reactions || {})
    const small = scope === 'comment'
    return (
      <div style={{ ...styles.reactions, marginTop: small ? '6px' : '10px' }}>
        {rx.map(([emoji, info]) => (
          <button key={emoji} onClick={() => toggleReaction(scope, obj, emoji)}
            style={{ ...styles.rx, ...(small ? styles.rxSmall : {}), ...(info.mine ? styles.rxMine : {}) }}>
            <span style={styles.rxEmoji}>{emoji}</span> {info.count}
          </button>
        ))}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setReactionPicker(reactionPicker && reactionPicker.id === obj.id ? null : { scope, id: obj.id })}
            aria-label="Add reaction" style={{ ...styles.addRx, ...(small ? styles.addRxSmall : {}) }}>
            <i className="ti ti-mood-plus" aria-hidden="true" />
          </button>
          {reactionPicker && reactionPicker.id === obj.id && (
            <div style={styles.emojiPop}>
              {EMOJIS.map(e => (
                <button key={e} onClick={() => toggleReaction(scope, obj, e)} style={styles.emojiBtn}>{e}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  function mentionDropdown(target) {
    if (!mentionBox || mentionBox.target !== target || mentionMatches.length === 0) return null
    return (
      <div style={styles.mentionBox}>
        {mentionMatches.map(m => (
          <button key={m.id} onClick={() => pickMention(m)} style={styles.mentionRow}>
            {m.avatar_url
              ? <img src={m.avatar_url} alt="" style={{ ...styles.mentionAvatar, ...styles.avatarPhoto }} />
              : <span style={styles.mentionAvatar}>{`${(m.first_name?.[0] || '').toUpperCase()}${(m.last_name?.[0] || '').toUpperCase()}`}</span>}
            <span>{m.first_name} {m.last_name}</span>
          </button>
        ))}
      </div>
    )
  }

  function commentComposer(p) {
    const d = draftFor(p.id)
    const me = profile
    return (
      <div style={styles.commentComposeRow}>
        {me?.avatar_url
          ? <img src={me.avatar_url} alt="" style={{ ...styles.cAvatar, ...styles.avatarPhoto }} />
          : <span style={{ ...styles.cAvatar, ...styles.cAvatarSelf }}>{`${(me?.first_name?.[0] || '').toUpperCase()}${(me?.last_name?.[0] || '').toUpperCase()}`}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ position: 'relative' }}>
            <textarea
              value={d.text}
              onChange={(e) => onCommentChange(p.id, e)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(p.id) } }}
              rows={1}
              placeholder="Write a comment. Type @ to tag…"
              style={styles.commentInput}
            />
            {mentionDropdown(p.id)}
          </div>
          {d.pending.length > 0 && (
            <div style={styles.pendingRow}>
              {d.pending.map((a, i) => (
                <div key={i} style={styles.pendingItem}>
                  {(a.type === 'image' || a.type === 'gif')
                    ? <img src={a.url} alt="" style={styles.pendingThumb} />
                    : <div style={styles.pendingFile}><i className={`ti ${a.type === 'video' ? 'ti-video' : 'ti-paperclip'}`} aria-hidden="true" /> {a.name || a.type}</div>}
                  <button onClick={() => removeCommentPending(p.id, i)} style={styles.pendingX} aria-label="Remove"><i className="ti ti-x" aria-hidden="true" /></button>
                </div>
              ))}
            </div>
          )}
          <div style={styles.commentToolbar}>
            <MediaPicker pathPrefix={`post/${space}/comment`} onAttach={(att) => addCommentPending(p.id, att)} />
            <button onClick={() => submitComment(p.id)} style={styles.commentSend}>Comment</button>
          </div>
        </div>
      </div>
    )
  }

  function renderComment(c) {
    const photo = avatarOf(c)
    return (
      <div key={c.id} style={styles.commentRow}>
        {photo
          ? <img src={photo} alt={nameOf(c)} style={{ ...styles.cAvatar, ...styles.avatarPhoto }} />
          : <span style={styles.cAvatar}>{initialsOf(c)}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.commentBubble}>
            <span style={styles.commentName}>{nameOf(c)}</span>
            <span style={styles.commentTime}>{time(c.created_at)}</span>
            {editingComment === c.id ? (
              <div style={styles.editWrap}>
                <textarea style={styles.editInput} value={editCommentText} rows={2}
                  onChange={e => setEditCommentText(e.target.value)} autoFocus />
                <div style={styles.editBtns}>
                  <button style={styles.editSave} onClick={() => saveEditComment(c)}>Save</button>
                  <button style={styles.editCancel} onClick={() => setEditingComment(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                {c.body && <div style={styles.commentText}>{renderBody(c.body)}</div>}
                {(c.attachments || []).length > 0 && <div style={styles.media}>{c.attachments.map(renderAttachment)}</div>}
              </>
            )}
          </div>
          <div style={styles.commentUnder}>
            {reactionRow('comment', c)}
            {canEditComment(c) && editingComment !== c.id && (
              <div style={styles.commentActions}>
                {c.user_id === user?.id && c.body && (
                  <button style={styles.textAction} onClick={() => startEditComment(c)}>Edit</button>
                )}
                <button style={styles.textActionDanger} onClick={() => deleteComment(c)}>Delete</button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  function renderPost(p) {
    const photo = avatarOf(p)
    const open = openComments.has(p.id)
    const claimed = !!p.claimed_by
    const showMenu = canEditPost(p) || isStaff
    return (
      <div key={p.id} style={styles.card}>
        {p.pinned && (
          <div style={styles.pinned}><i className="ti ti-pin" aria-hidden="true" style={{ fontSize: 13 }} /> Pinned</div>
        )}
        <div style={styles.postHead}>
          {photo
            ? <img src={photo} alt={nameOf(p)} style={{ ...styles.avatar, ...styles.avatarPhoto }} />
            : <span style={{ ...styles.avatar, ...styles.avatarSelf }}>{initialsOf(p)}</span>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.authorLine}>
              <span style={styles.author}>{nameOf(p)}</span>
              {user && p.user_id === user.id && <span style={styles.youBadge}>you</span>}
            </div>
            <div style={styles.meta}>{[titleOf(p), time(p.created_at)].filter(Boolean).join(' · ')}</div>
          </div>
          {p.tag && <span style={styles.tag}>{p.tag}</span>}
          {showMenu && (
            <div style={{ position: 'relative' }}>
              <button aria-label="Post options" style={styles.dots} onClick={() => setMenuFor(menuFor === p.id ? null : p.id)}>
                <i className="ti ti-dots" aria-hidden="true" />
              </button>
              {menuFor === p.id && (
                <div style={styles.menu}>
                  {canEditPost(p) && p.body && (
                    <button style={styles.menuItem} onClick={() => startEditPost(p)}><i className="ti ti-edit" aria-hidden="true" /> Edit post</button>
                  )}
                  {isStaff && (
                    <button style={styles.menuItem} onClick={() => togglePin(p)}><i className="ti ti-pin" aria-hidden="true" /> {p.pinned ? 'Unpin' : 'Pin to top'}</button>
                  )}
                  <button style={{ ...styles.menuItem, color: '#e07070' }} onClick={() => deletePost(p)}><i className="ti ti-trash" aria-hidden="true" /> Delete</button>
                </div>
              )}
            </div>
          )}
        </div>

        {editingPost === p.id ? (
          <div style={{ ...styles.editWrap, marginTop: 12 }}>
            <textarea style={styles.editInput} value={editPostText} rows={3}
              onChange={e => setEditPostText(e.target.value)} autoFocus />
            <div style={styles.editBtns}>
              <button style={styles.editSave} onClick={() => saveEditPost(p)}>Save</button>
              <button style={styles.editCancel} onClick={() => setEditingPost(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            {p.body && <div style={styles.body}>{renderBody(p.body)}</div>}
            {(p.attachments || []).length > 0 && <div style={styles.media}>{p.attachments.map(renderAttachment)}</div>}
          </>
        )}

        {cfg.claim && (
          claimed ? (
            <div style={styles.claimed}>
              <i className="ti ti-circle-check" aria-hidden="true" style={{ fontSize: 16, color: '#6ec46e' }} />
              <span style={{ flex: 1 }}>Claimed by {p.claimed_first || 'a teammate'}{p.claimed_last ? ' ' + p.claimed_last : ''}</span>
              {(isStaff || p.claimed_by === user?.id || p.user_id === user?.id) && (
                <button style={styles.unclaim} onClick={() => unclaim(p)}>Unclaim</button>
              )}
            </div>
          ) : (
            <div style={{ margin: '0 0 12px' }}>
              <button style={styles.claimBtn} onClick={() => claim(p)}>
                <i className="ti ti-hand-grab" aria-hidden="true" /> Claim referral
              </button>
            </div>
          )
        )}

        {reactionRow('post', p)}

        <div style={styles.commentBar}>
          <button style={styles.commentToggle} onClick={() => toggleComments(p.id)}>
            <i className="ti ti-message-circle" aria-hidden="true" style={{ fontSize: 16 }} />
            {p.comments.length} {p.comments.length === 1 ? 'comment' : 'comments'}
          </button>
          {open && (
            <div style={{ marginTop: 4 }}>
              {p.comments.map(renderComment)}
              {commentComposer(p)}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.title}>{cfg.title}</h1>
        <div style={styles.sub}>{cfg.subtitle}</div>
      </div>

      <div style={styles.scroll}>
        {canPost ? (
          <div style={styles.composer}>
            <div style={styles.composerTop}>
              {profile?.avatar_url
                ? <img src={profile.avatar_url} alt="" style={{ ...styles.avatar, ...styles.avatarPhoto }} />
                : <span style={{ ...styles.avatar, ...styles.avatarSelf }}>{`${(profile?.first_name?.[0] || '').toUpperCase()}${(profile?.last_name?.[0] || '').toUpperCase()}`}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.tagRow}>
                  {cfg.tags.map(t => (
                    <button key={t} onClick={() => setTag(t)}
                      style={{ ...styles.tagPill, ...(t === tag ? styles.tagPillOn : {}) }}>{t}</button>
                  ))}
                </div>
                <div style={{ position: 'relative' }}>
                  <textarea
                    ref={composerRef}
                    value={text}
                    onChange={onComposerChange}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitPost() } }}
                    rows={2}
                    placeholder={cfg.placeholder}
                    style={styles.composerInput}
                  />
                  {mentionDropdown('post')}
                </div>
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
                <div style={styles.composerToolbar}>
                  <MediaPicker pathPrefix={`post/${space}`} onAttach={addPending} />
                  <button onClick={submitPost} style={styles.postBtn}>Post</button>
                </div>
              </div>
            </div>
          </div>
        ) : cfg.readonlyNote ? (
          <div style={styles.readonly}>
            <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 16, color: '#C9A84C' }} />
            <span>{cfg.readonlyNote}</span>
          </div>
        ) : null}

        {loading ? (
          <div style={styles.empty}>Loading…</div>
        ) : posts.length === 0 ? (
          <div style={styles.empty}>No posts yet.</div>
        ) : (
          posts.map(renderPost)
        )}
      </div>
    </div>
  )
}

const styles = {
  page: { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { flexShrink: 0, borderBottom: '1px solid #2a2a2a', padding: '18px 26px' },
  title: { fontSize: '22px', fontWeight: '700', color: '#fff', letterSpacing: '-0.3px' },
  sub: { fontSize: '12px', color: '#666', marginTop: '3px' },
  scroll: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 26px 40px', maxWidth: '720px', width: '100%' },

  composer: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '12px', padding: '14px', marginBottom: '14px' },
  composerTop: { display: 'flex', gap: '11px', alignItems: 'flex-start' },
  tagRow: { display: 'flex', gap: '6px', marginBottom: '9px', flexWrap: 'wrap' },
  tagPill: { padding: '4px 11px', borderRadius: '12px', border: '0.5px solid #333', background: 'transparent', color: '#888', fontSize: '11px', fontWeight: '500', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  tagPillOn: { border: '0.5px solid #C9A84C', color: '#C9A84C', background: 'rgba(201,168,76,0.12)' },
  composerInput: { width: '100%', background: '#0A0A0A', border: '0.5px solid #333', borderRadius: '9px', padding: '11px 13px', fontSize: '13px', color: '#fff', fontFamily: 'Montserrat, sans-serif', resize: 'none', outline: 'none', boxSizing: 'border-box' },
  composerToolbar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '9px' },
  postBtn: { padding: '7px 16px', borderRadius: '8px', border: 'none', background: '#C9A84C', color: '#0A0A0A', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  readonly: { display: 'flex', alignItems: 'center', gap: '8px', background: '#161616', border: '0.5px solid #2a2a2a', borderRadius: '12px', padding: '12px 14px', marginBottom: '14px', fontSize: '12px', color: '#888' },

  card: { background: '#1E1E1E', border: '0.5px solid #2a2a2a', borderRadius: '12px', padding: '16px', marginBottom: '14px' },
  pinned: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: '#C9A84C', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px' },
  postHead: { display: 'flex', alignItems: 'flex-start', gap: '11px', marginBottom: '12px' },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', background: '#2a2a2a', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0 },
  avatarSelf: { background: '#C9A84C', color: '#0A0A0A' },
  avatarPhoto: { objectFit: 'cover', background: 'transparent', display: 'block' },
  authorLine: { display: 'flex', alignItems: 'center', gap: '7px' },
  author: { fontSize: '14px', fontWeight: '600', color: '#fff' },
  youBadge: { fontSize: '9px', color: '#888', background: '#0A0A0A', border: '0.5px solid #333', padding: '2px 7px', borderRadius: '9px' },
  meta: { fontSize: '11px', color: '#777', marginTop: '1px' },
  tag: { fontSize: '10px', color: '#C9A84C', background: 'rgba(201,168,76,0.12)', padding: '3px 9px', borderRadius: '10px', fontWeight: '600', whiteSpace: 'nowrap' },
  dots: { background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: '18px', padding: '2px' },
  menu: { position: 'absolute', right: 0, top: '26px', background: '#1E1E1E', border: '0.5px solid #333', borderRadius: '9px', padding: '5px', minWidth: '140px', zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  menuItem: { width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 11px', fontSize: '12px', color: '#ddd', cursor: 'pointer', borderRadius: '6px', background: 'transparent', border: 'none', textAlign: 'left', fontFamily: 'Montserrat, sans-serif' },
  body: { fontSize: '14px', color: '#e8e8e8', lineHeight: 1.65, margin: '0 0 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  media: { display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '0 0 12px' },
  mediaItem: { maxWidth: '260px', maxHeight: '260px', borderRadius: '10px', display: 'block' },
  fileChip: { display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#C9A84C', textDecoration: 'underline', wordBreak: 'break-all' },
  mention: { color: '#C9A84C', fontWeight: 600 },

  claimed: { display: 'flex', alignItems: 'center', gap: '9px', margin: '0 0 12px', padding: '9px 12px', background: 'rgba(110,196,110,0.08)', border: '0.5px solid rgba(110,196,110,0.3)', borderRadius: '10px', fontSize: '12px', color: '#9bd89b' },
  unclaim: { background: 'transparent', border: 'none', color: '#888', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'Montserrat, sans-serif' },
  claimBtn: { display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '8px 15px', borderRadius: '9px', border: '0.5px solid #C9A84C', background: 'rgba(201,168,76,0.08)', color: '#C9A84C', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },

  reactions: { display: 'flex', gap: '7px', flexWrap: 'wrap', alignItems: 'center' },
  rx: { display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#0A0A0A', border: '0.5px solid #333', borderRadius: '14px', padding: '4px 10px', fontSize: '12px', color: '#ddd', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  rxSmall: { padding: '2px 8px', fontSize: '11px' },
  rxMine: { borderColor: 'rgba(201,168,76,0.55)', background: 'rgba(201,168,76,0.10)', color: '#fff' },
  rxEmoji: { fontSize: '12px', lineHeight: 1 },
  addRx: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '0.5px solid #333', borderRadius: '14px', width: '28px', height: '26px', color: '#888', cursor: 'pointer', fontSize: '14px' },
  addRxSmall: { width: '26px', height: '22px', fontSize: '13px' },
  emojiPop: { position: 'absolute', bottom: '32px', left: 0, display: 'flex', gap: '2px', background: '#161616', border: '0.5px solid #333', borderRadius: '10px', padding: '4px', zIndex: 20, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  emojiBtn: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '3px 5px', borderRadius: '6px' },

  commentBar: { borderTop: '0.5px solid #2a2a2a', paddingTop: '11px', marginTop: '12px' },
  commentToggle: { display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', border: 'none', color: '#888', fontSize: '12px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  commentRow: { display: 'flex', gap: '9px', padding: '8px 0' },
  cAvatar: { width: '28px', height: '28px', borderRadius: '50%', background: '#2a2a2a', color: '#999', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },
  cAvatarSelf: { background: '#C9A84C', color: '#0A0A0A' },
  commentBubble: { background: '#0A0A0A', borderRadius: '10px', padding: '9px 12px' },
  commentName: { fontSize: '12px', fontWeight: '600', color: '#fff' },
  commentTime: { fontSize: '10px', color: '#666', marginLeft: '7px' },
  commentText: { fontSize: '13px', color: '#ccc', marginTop: '3px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  commentUnder: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  commentActions: { display: 'flex', gap: '10px', marginTop: '6px' },
  textAction: { background: 'transparent', border: 'none', color: '#777', fontSize: '11px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  textActionDanger: { background: 'transparent', border: 'none', color: '#a55', fontSize: '11px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  commentComposeRow: { display: 'flex', gap: '9px', marginTop: '10px', alignItems: 'flex-start' },
  commentInput: { width: '100%', background: '#0A0A0A', border: '0.5px solid #333', borderRadius: '14px', padding: '9px 13px', fontSize: '12px', color: '#fff', fontFamily: 'Montserrat, sans-serif', resize: 'none', outline: 'none', boxSizing: 'border-box' },
  commentToolbar: { display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' },
  commentSend: { marginLeft: 'auto', padding: '6px 13px', borderRadius: '8px', border: 'none', background: '#C9A84C', color: '#0A0A0A', fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },

  pendingRow: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' },
  pendingItem: { position: 'relative' },
  pendingThumb: { width: '54px', height: '54px', objectFit: 'cover', borderRadius: '8px', display: 'block' },
  pendingFile: { display: 'flex', alignItems: 'center', gap: '6px', maxWidth: '160px', height: '54px', padding: '0 10px', background: '#161616', border: '0.5px solid #333', borderRadius: '8px', fontSize: '11px', color: '#ccc', overflow: 'hidden' },
  pendingX: { position: 'absolute', top: '-6px', right: '-6px', width: '18px', height: '18px', borderRadius: '50%', background: '#0A0A0A', border: '0.5px solid #444', color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', padding: 0 },

  mentionBox: { position: 'absolute', left: 0, right: 0, top: '100%', marginTop: '4px', background: '#161616', border: '0.5px solid #333', borderRadius: '10px', padding: '4px', zIndex: 30, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' },
  mentionRow: { width: '100%', display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: '7px', cursor: 'pointer', textAlign: 'left', fontFamily: 'Montserrat, sans-serif', color: '#fff', fontSize: '13px' },
  mentionAvatar: { width: '26px', height: '26px', borderRadius: '50%', background: '#2a2a2a', color: '#ccc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 },

  editWrap: { marginTop: '4px' },
  editInput: { width: '100%', background: '#1E1E1E', border: '0.5px solid #333', borderRadius: '8px', color: '#fff', fontSize: '13px', fontFamily: 'Montserrat, sans-serif', padding: '9px 12px', outline: 'none', resize: 'none', boxSizing: 'border-box' },
  editBtns: { display: 'flex', gap: '8px', marginTop: '6px' },
  editSave: { background: '#C9A84C', color: '#0A0A0A', border: 'none', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },
  editCancel: { background: 'transparent', color: '#888', border: '0.5px solid #333', borderRadius: '7px', padding: '6px 14px', fontSize: '12px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' },

  empty: { color: '#555', fontSize: '13px', padding: '30px 4px' },
}
