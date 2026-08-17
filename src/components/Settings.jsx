import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { enablePush, currentPermission, pushSupported } from '../lib/push'
import { RULES, isValidPassword } from '../lib/passwordRules'
import ImageCropper from './ImageCropper'

const GOLD = '#C9A84C'

// Reached from the account menu on your photo, top right. Three short screens
// rather than one long page — Profile, Account, Notifications. Sign out lives
// in the menu itself, not down here.
const TABS = [
  { id: 'profile', label: 'Profile', view: 'settings-profile' },
  { id: 'account', label: 'Account', view: 'settings-account' },
  { id: 'notifications', label: 'Notifications', view: 'settings-notifications' },
]

// `key` matches a boolean column on public.notification_prefs.
const NOTIF_GROUPS = [
  {
    id: 'personal', label: 'Just for You', icon: 'ti-user',
    rows: [
      { key: 'dm', label: 'Direct messages', desc: 'Someone sends you a private message' },
      { key: 'mentions', label: "When you're @mentioned", desc: 'Someone tags you by name anywhere on the platform' },
      { key: 'replies', label: 'Replies and reactions', desc: 'Someone replies to or reacts to something you posted' },
    ],
  },
  {
    id: 'community', label: 'Community', icon: 'ti-users',
    rows: [
      { key: 'events', label: 'Events', desc: "A new event is posted, or one you RSVP'd to changes" },
      { key: 'bullpen', label: 'Bullpen', desc: 'A new announcement or post goes up in the Bullpen' },
      { key: 'referrals', label: 'Referrals', desc: 'A new referral opportunity is posted' },
    ],
  },
  {
    id: 'channels', label: 'Channels', icon: 'ti-messages',
    rows: [
      { key: 'channels', label: 'All channel messages', desc: "Every message posted in a channel you're in. Leave this off and you'll still get @mentions." },
    ],
  },
  {
    id: 'library', label: 'Training & Resources', icon: 'ti-folder',
    rows: [
      { key: 'training', label: 'New training added', desc: 'A video or course is added to the Training Library' },
      { key: 'resources', label: 'New resource added', desc: 'A script, sheet, or vendor doc is added to the Resource Library' },
    ],
  },
]

export default function Settings({ section = 'profile', onSectionChange }) {
  const { user, profile, updateProfile } = useAuth()

  const active = TABS.some(t => t.id === section) ? section : 'profile'

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <div style={styles.pgTitle}>
          {active === 'profile' ? 'Profile' : active === 'account' ? 'Account' : 'Notifications'}
        </div>
        <div style={styles.pgSub}>
          {active === 'profile' && 'Your photo, name, and phone number.'}
          {active === 'account' && 'How you sign in.'}
          {active === 'notifications' && 'Choose what reaches you.'}
        </div>

        <div style={styles.tabs}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => onSectionChange && onSectionChange(t.view)}
              style={{
                ...styles.tab,
                ...(active === t.id ? styles.tabOn : {}),
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {active === 'profile' && (
          <ProfileSection user={user} profile={profile} updateProfile={updateProfile} />
        )}
        {active === 'account' && <AccountSection user={user} />}
        {active === 'notifications' && <NotificationsSection user={user} />}
      </div>
    </div>
  )
}

/* ══════════════════ PROFILE ══════════════════ */

function ProfileSection({ user, profile, updateProfile }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const [pendingFile, setPendingFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [photoMsg, setPhotoMsg] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!profile) return
    setFirstName(profile.first_name ?? '')
    setLastName(profile.last_name ?? '')
    setPhone(profile.phone ?? '')
  }, [profile])

  const initials =
    `${(profile?.first_name?.[0] ?? '').toUpperCase()}${(profile?.last_name?.[0] ?? '').toUpperCase()}` || '?'
  const displayTitle = profile?.title?.trim()
    || ({ admin: 'Admin', leader: 'Leader', agent: 'Agent' })[profile?.account_type]
    || 'Agent'

  // Pick a file → open the cropper. Nothing is uploaded until it's framed.
  function pickFile(e) {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    setPhotoMsg(null)

    if (!file.type.startsWith('image/')) {
      setPhotoMsg({ ok: false, text: 'Please choose an image file (JPG or PNG).' })
      return
    }
    // Generous, because the cropper shrinks whatever comes in down to 400px.
    if (file.size > 15 * 1024 * 1024) {
      setPhotoMsg({ ok: false, text: 'That image is over 15MB. Please choose a smaller one.' })
      return
    }
    setPendingFile(file)
  }

  // The cropper hands back a 400x400 JPEG, so the stored file is always
  // headshot.jpg regardless of what was chosen.
  async function handleCropped(blob) {
    setPendingFile(null)
    if (!user) return
    setUploading(true)
    setPhotoMsg(null)

    try {
      const path = `${user.id}/headshot.jpg`

      // Clear anything else in this person's folder so old files don't linger.
      const { data: existing } = await supabase.storage.from('avatars').list(user.id)
      const stale = (existing || [])
        .filter(f => f.name !== 'headshot.jpg' && f.name !== '.emptyFolderPlaceholder')
        .map(f => `${user.id}/${f.name}`)
      if (stale.length) await supabase.storage.from('avatars').remove(stale)

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

      // Cache-buster, or the browser keeps serving the previous photo from the
      // identical URL.
      const { error: profErr } = await updateProfile({ avatar_url: `${publicUrl}?v=${Date.now()}` })
      if (profErr) throw profErr

      setPhotoMsg({ ok: true, text: 'Photo updated.' })
    } catch (err) {
      setPhotoMsg({ ok: false, text: err.message || 'Upload failed. Please try again.' })
    } finally {
      setUploading(false)
    }
  }

  async function removePhoto() {
    if (!user) return
    setUploading(true)
    setPhotoMsg(null)
    try {
      const { data: existing } = await supabase.storage.from('avatars').list(user.id)
      const paths = (existing || [])
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => `${user.id}/${f.name}`)
      if (paths.length) await supabase.storage.from('avatars').remove(paths)
      const { error } = await updateProfile({ avatar_url: null })
      if (error) throw error
      setPhotoMsg({ ok: true, text: 'Photo removed.' })
    } catch (err) {
      setPhotoMsg({ ok: false, text: err.message || 'Could not remove the photo.' })
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!firstName.trim() || !lastName.trim()) {
      setMsg({ ok: false, text: 'First and last name are both required.' })
      return
    }
    setSaving(true)
    setMsg(null)
    const { error } = await updateProfile({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
    })
    setSaving(false)
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Saved.' })
  }

  return (
    <>
      {pendingFile && (
        <ImageCropper
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onDone={handleCropped}
        />
      )}

      <div style={styles.card}>
        <div style={styles.cBody}>
          <div style={styles.photoRow}>
            <div style={styles.photoWrap}>
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Your headshot" style={styles.photoImg} />
              ) : (
                <div style={styles.photoInitials}>{initials}</div>
              )}
              <div style={styles.photoBadge}>
                <i className="ti ti-camera" aria-hidden="true" />
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={styles.photoName}>
                {profile ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}` : 'Agent'}
              </div>
              <div style={styles.photoRole}>{displayTitle}</div>

              <div style={styles.photoActions}>
                <input
                  ref={fileRef}
                  id="headshot-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/heic"
                  onChange={pickFile}
                  style={{ display: 'none' }}
                />
                <label
                  htmlFor="headshot-input"
                  style={{
                    ...styles.btnGold,
                    display: 'inline-block',
                    opacity: uploading ? 0.55 : 1,
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    pointerEvents: uploading ? 'none' : 'auto',
                  }}
                >
                  {uploading ? 'Working...' : profile?.avatar_url ? 'Change Photo' : 'Upload Photo'}
                </label>
                {profile?.avatar_url && !uploading && (
                  <button onClick={removePhoto} style={styles.btnOutline}>Remove</button>
                )}
              </div>

              <div style={styles.hint}>
                After you pick a photo you can drag and zoom to frame your face in the circle.
                Shows next to your name in channels, messages, and the directory.
              </div>

              {photoMsg && <Banner ok={photoMsg.ok} text={photoMsg.text} />}
            </div>
          </div>

          <div style={styles.rule} />

          <div style={styles.fRow}>
            <Field label="First Name">
              <input style={styles.input} value={firstName} onChange={e => setFirstName(e.target.value)} />
            </Field>
            <Field label="Last Name">
              <input style={styles.input} value={lastName} onChange={e => setLastName(e.target.value)} />
            </Field>
          </div>

          <Field label="Mobile Phone" note="Shown in the directory so the team can reach you.">
            <input
              style={styles.input}
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="(770) 555-0142"
            />
          </Field>

          <Field label="Title" locked note="Set by Agentship. Reach out if this needs to change.">
            <input style={{ ...styles.input, ...styles.inputLocked }} value={displayTitle} disabled />
          </Field>

          {msg && <Banner ok={msg.ok} text={msg.text} />}

          <div style={styles.save}>
            <button onClick={save} disabled={saving} style={{ ...styles.btnGold, opacity: saving ? 0.55 : 1 }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ══════════════════ ACCOUNT ══════════════════ */

function AccountSection({ user }) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  const meetsRules = isValidPassword(newPw)
  const matches = confirmPw.length > 0 && newPw === confirmPw

  async function changePassword() {
    setMsg(null)

    if (!currentPw || !newPw || !confirmPw) {
      setMsg({ ok: false, text: 'Please fill in all three password fields.' })
      return
    }
    if (!meetsRules) {
      setMsg({ ok: false, text: 'Your new password does not meet all the requirements yet.' })
      return
    }
    if (newPw !== confirmPw) {
      setMsg({ ok: false, text: "Those new passwords don't match." })
      return
    }
    if (newPw === currentPw) {
      setMsg({ ok: false, text: 'Your new password must be different from your current one.' })
      return
    }

    setSaving(true)

    // Supabase lets a live session set a new password without proving the old
    // one. Verifying first stops a walk-up on an unlocked laptop.
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPw,
    })
    if (reauthErr) {
      setSaving(false)
      setMsg({ ok: false, text: 'That current password is not correct.' })
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSaving(false)

    if (error) {
      setMsg({ ok: false, text: error.message })
      return
    }

    setCurrentPw(''); setNewPw(''); setConfirmPw('')
    setMsg({ ok: true, text: 'Password updated. Use it next time you sign in.' })
  }

  return (
    <>
      <div style={styles.card}>
        <div style={styles.cBody}>
          <div style={styles.signInAs}>
            <i className="ti ti-mail" aria-hidden="true" style={{ fontSize: '16px', color: '#666' }} />
            <div>
              <div style={styles.signInLabel}>You sign in as</div>
              <div style={styles.signInValue}>{user?.email}</div>
            </div>
            <i className="ti ti-lock" aria-hidden="true" style={{ marginLeft: 'auto', fontSize: '14px', color: '#4a4a4a' }} />
          </div>
          <div style={styles.signInNote}>
            Your Agentship email is your login and can't be changed here.
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.cHead}>
          <div style={styles.cKicker}>Password</div>
          <div style={styles.cTitle}>Change your password</div>
        </div>
        <div style={styles.cBody}>
          <Field label="Current Password">
            <input
              style={styles.input}
              type="password"
              autoComplete="current-password"
              value={currentPw}
              onChange={e => setCurrentPw(e.target.value)}
            />
          </Field>

          <div style={styles.fRow}>
            <Field label="New Password">
              <input
                style={styles.input}
                type="password"
                autoComplete="new-password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
              />
            </Field>
            <Field label="Confirm New Password">
              <input
                style={{
                  ...styles.input,
                  ...(confirmPw.length > 0 && !matches ? { borderColor: 'rgba(224,112,112,0.5)' } : {}),
                }}
                type="password"
                autoComplete="new-password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
              />
            </Field>
          </div>

          <PasswordChecklist password={newPw} />

          {confirmPw.length > 0 && !matches && (
            <div style={styles.mismatch}>These two don't match yet</div>
          )}

          {msg && <Banner ok={msg.ok} text={msg.text} />}

          <div style={styles.save}>
            <button onClick={changePassword} disabled={saving} style={{ ...styles.btnGold, opacity: saving ? 0.55 : 1 }}>
              {saving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/* ══════════════════ NOTIFICATIONS ══════════════════ */

function NotificationsSection({ user }) {
  const [prefs, setPrefs] = useState(null)
  const [perm, setPerm] = useState(currentPermission())
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  const loadPrefs = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      setPrefs(data)
      return
    }
    const { data: created } = await supabase
      .from('notification_prefs')
      .insert({ user_id: user.id })
      .select()
      .maybeSingle()
    setPrefs(created ?? {
      user_id: user.id,
      dm: true, mentions: true, replies: true,
      events: true, bullpen: true, referrals: true,
      channels: false, training: true, resources: true,
    })
  }, [user])

  useEffect(() => { loadPrefs() }, [loadPrefs])

  async function togglePref(key) {
    if (!prefs || !user) return
    const next = !prefs[key]
    setPrefs(p => ({ ...p, [key]: next }))
    const { error } = await supabase
      .from('notification_prefs')
      .upsert(
        { user_id: user.id, [key]: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )
    if (error) setPrefs(p => ({ ...p, [key]: !next }))
  }

  async function turnOnPush() {
    setPushBusy(true)
    setPushMsg('Setting up...')
    const res = await enablePush()
    setPushMsg(res.message)
    setPerm(currentPermission())
    setPushBusy(false)
  }

  const pushOn = perm === 'granted'
  const groupSummary = rows => {
    if (!prefs) return ''
    const on = rows.filter(r => prefs[r.key]).length
    return on === 0 ? 'OFF' : `${on} ON`
  }

  return (
    <div style={styles.card}>
      <div style={styles.master}>
        <div style={styles.masterIcon}>
          <i className="ti ti-device-mobile" aria-hidden="true" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.masterLabel}>Push notifications on this device</div>
          <div style={styles.masterDesc}>
            Alerts reach you even when Agentship is closed. Everything below only applies
            while this is on.
          </div>
          {pushMsg && <div style={styles.pushMsg}>{pushMsg}</div>}
        </div>

        {pushOn ? (
          <span style={styles.pillOn}>
            <i className="ti ti-check" aria-hidden="true" style={{ fontSize: '13px' }} /> On
          </span>
        ) : (
          <button
            onClick={turnOnPush}
            disabled={pushBusy || !pushSupported() || perm === 'denied'}
            style={{
              ...styles.btnGold,
              flexShrink: 0,
              opacity: pushBusy || !pushSupported() || perm === 'denied' ? 0.55 : 1,
            }}
          >
            {perm === 'denied' ? 'Blocked in device settings' : pushBusy ? 'Setting up...' : 'Turn On'}
          </button>
        )}
      </div>

      {NOTIF_GROUPS.map((g, gi) => (
        <div
          key={g.id}
          style={{ borderBottom: gi === NOTIF_GROUPS.length - 1 ? 'none' : '1px solid #1a1a1a' }}
        >
          <div style={styles.groupHead}>
            <i className={`ti ${g.icon}`} aria-hidden="true" style={styles.groupIcon} />
            <span style={styles.groupName}>{g.label}</span>
            <span style={styles.groupCount}>{groupSummary(g.rows)}</span>
          </div>
          <div style={styles.groupRows}>
            {g.rows.map((r, ri) => (
              <div key={r.key} style={{ ...styles.row, borderTop: ri === 0 ? 'none' : '1px solid #181818' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={styles.rowLabel}>{r.label}</div>
                  <div style={styles.rowDesc}>{r.desc}</div>
                </div>
                <Toggle on={!!prefs?.[r.key]} dim={!pushOn} onClick={() => togglePref(r.key)} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ══════════════════ small pieces ══════════════════ */

function Field({ label, children, note, locked }) {
  return (
    <div style={styles.field}>
      <label style={styles.fieldLabel}>{label}</label>
      {children}
      {note && (
        <div style={styles.fieldNote}>
          {locked && <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: '12px', color: '#555' }} />}
          {note}
        </div>
      )}
    </div>
  )
}

function PasswordChecklist({ password }) {
  return (
    <div style={styles.checklist}>
      {RULES.map(rule => {
        const met = rule.test(password || '')
        return (
          <div key={rule.id} style={styles.checkRow}>
            <span style={{ ...styles.checkDot, ...(met ? styles.checkDotMet : {}) }}>
              {met ? '✓' : ''}
            </span>
            <span style={{ ...styles.checkLabel, ...(met ? styles.checkLabelMet : {}) }}>
              {rule.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function Toggle({ on, onClick, dim }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{ ...styles.toggle, background: on ? GOLD : '#262626', opacity: dim ? 0.45 : 1 }}
    >
      <span
        style={{
          ...styles.knob,
          background: on ? '#fff' : '#6a6a6a',
          transform: on ? 'translateX(18px)' : 'translateX(0)',
        }}
      />
    </button>
  )
}

function Banner({ ok, text }) {
  return (
    <div
      style={{
        ...styles.banner,
        background: ok ? 'rgba(110,196,110,0.08)' : 'rgba(224,112,112,0.08)',
        border: `1px solid ${ok ? 'rgba(110,196,110,0.25)' : 'rgba(224,112,112,0.25)'}`,
        color: ok ? '#6ec46e' : '#e07070',
      }}
    >
      <i
        className={`ti ${ok ? 'ti-circle-check' : 'ti-alert-circle'}`}
        aria-hidden="true"
        style={{ fontSize: '15px', flexShrink: 0 }}
      />
      <span>{text}</span>
    </div>
  )
}

/* ══════════════════ styles ══════════════════ */

const styles = {
  page: { padding: '34px 44px 60px', overflowY: 'auto' },
  wrap: { maxWidth: '640px' },

  pgTitle: { fontSize: '22px', fontWeight: '800', color: '#fff', fontFamily: 'Montserrat, sans-serif' },
  pgSub: { fontSize: '13px', color: '#555', marginTop: '4px' },

  tabs: { display: 'flex', gap: '4px', margin: '22px 0 0', borderBottom: '1px solid #202020' },
  tab: {
    padding: '10px 16px', fontSize: '12.5px', fontWeight: '600', color: '#6a6a6a',
    border: 'none', background: 'none', fontFamily: 'Montserrat, sans-serif',
    cursor: 'pointer', borderBottom: '2px solid transparent', marginBottom: '-1px',
  },
  tabOn: { color: GOLD, borderBottomColor: GOLD },

  card: {
    background: '#111', border: '1px solid #222', borderRadius: '14px',
    marginTop: '22px', overflow: 'hidden',
  },
  cHead: { padding: '17px 24px 14px', borderBottom: '1px solid #1e1e1e' },
  cKicker: {
    fontSize: '10px', fontWeight: '700', letterSpacing: '0.12em',
    color: '#555', textTransform: 'uppercase',
  },
  cTitle: { fontSize: '15px', fontWeight: '700', color: '#fff', marginTop: '3px' },
  cBody: { padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: '18px' },

  photoRow: { display: 'flex', alignItems: 'flex-start', gap: '20px' },
  photoWrap: { position: 'relative', width: '76px', height: '76px', flexShrink: 0 },
  photoImg: {
    width: '76px', height: '76px', borderRadius: '50%',
    objectFit: 'cover', border: '2px solid #2a2a2a', display: 'block',
  },
  photoInitials: {
    width: '76px', height: '76px', borderRadius: '50%',
    background: GOLD, color: '#0A0A0A',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '23px', fontWeight: '700',
  },
  photoBadge: {
    position: 'absolute', bottom: '-2px', right: '-2px',
    width: '25px', height: '25px', borderRadius: '50%',
    background: '#1e1e1e', border: '2px solid #111',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '13px', color: GOLD,
  },
  photoName: { fontSize: '15px', fontWeight: '700', color: '#fff' },
  photoRole: { fontSize: '12px', color: '#555', marginTop: '4px' },
  photoActions: { display: 'flex', gap: '9px', marginTop: '12px', alignItems: 'center' },

  hint: { fontSize: '11px', color: '#454545', marginTop: '9px', lineHeight: 1.55 },
  rule: { height: '1px', background: '#1e1e1e' },

  field: { display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 },
  fieldLabel: {
    fontSize: '10px', fontWeight: '700', color: '#555',
    textTransform: 'uppercase', letterSpacing: '0.09em',
  },
  fieldNote: {
    fontSize: '11px', color: '#484848', display: 'flex',
    alignItems: 'center', gap: '6px', lineHeight: 1.4,
  },
  fRow: { display: 'flex', gap: '14px' },

  input: {
    width: '100%', background: '#0d0d0d', border: '1px solid #2a2a2a',
    borderRadius: '8px', padding: '11px 14px', fontSize: '13px',
    fontWeight: '500', color: '#fff', fontFamily: 'Montserrat, sans-serif',
  },
  inputLocked: { background: '#0a0a0a', color: '#5a5a5a', borderColor: '#1c1c1c', cursor: 'not-allowed' },

  signInAs: {
    display: 'flex', alignItems: 'center', gap: '13px',
    padding: '15px 16px', background: '#0d0d0d',
    border: '1px solid #1e1e1e', borderRadius: '10px',
  },
  signInLabel: {
    fontSize: '10px', fontWeight: '700', color: '#555',
    textTransform: 'uppercase', letterSpacing: '0.09em',
  },
  signInValue: { fontSize: '13.5px', fontWeight: '600', color: '#e8e8e8', marginTop: '3px' },
  signInNote: { fontSize: '11px', color: '#484848', lineHeight: 1.5, marginTop: '-6px' },

  save: { display: 'flex', justifyContent: 'flex-end' },

  btnGold: {
    padding: '9px 17px', borderRadius: '8px', background: GOLD, color: '#0A0A0A',
    fontSize: '12px', fontWeight: '700', fontFamily: 'Montserrat, sans-serif',
    border: 'none', cursor: 'pointer',
  },
  btnOutline: {
    padding: '9px 17px', borderRadius: '8px', background: 'transparent',
    color: '#666', border: '1px solid #2a2a2a', fontSize: '12px',
    fontWeight: '600', fontFamily: 'Montserrat, sans-serif', cursor: 'pointer',
  },

  master: {
    display: 'flex', alignItems: 'center', gap: '16px',
    padding: '18px 24px', background: 'rgba(201,168,76,0.05)',
    borderBottom: '1px solid #1e1e1e',
  },
  masterIcon: {
    width: '38px', height: '38px', borderRadius: '10px',
    background: 'rgba(201,168,76,0.12)', color: GOLD,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '19px', flexShrink: 0,
  },
  masterLabel: { fontSize: '14px', fontWeight: '700', color: '#fff' },
  masterDesc: { fontSize: '11.5px', color: '#666', marginTop: '3px', lineHeight: 1.45 },
  pushMsg: { fontSize: '11px', color: '#aaa', marginTop: '7px', lineHeight: 1.5 },
  pillOn: {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '6px 13px', borderRadius: '20px',
    background: 'rgba(110,196,110,0.1)', border: '1px solid rgba(110,196,110,0.28)',
    color: '#6ec46e', fontSize: '11px', fontWeight: '700', flexShrink: 0,
  },

  groupHead: { display: 'flex', alignItems: 'center', gap: '11px', padding: '16px 24px 8px' },
  groupIcon: { fontSize: '17px', color: GOLD },
  groupName: { fontSize: '13px', fontWeight: '700', color: '#fff' },
  groupCount: {
    marginLeft: 'auto', fontSize: '10px', color: '#444',
    fontWeight: '600', letterSpacing: '0.04em',
  },
  groupRows: { padding: '0 24px 14px' },
  row: { display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 0 12px 28px' },
  rowLabel: { fontSize: '13px', fontWeight: '600', color: '#ededed' },
  rowDesc: { fontSize: '11px', color: '#5a5a5a', marginTop: '3px', lineHeight: 1.45 },

  toggle: {
    width: '42px', height: '24px', borderRadius: '12px',
    display: 'flex', alignItems: 'center', padding: '3px',
    cursor: 'pointer', flexShrink: 0, border: 'none', transition: 'background 0.18s',
  },
  knob: {
    width: '18px', height: '18px', borderRadius: '50%',
    transition: 'transform 0.18s', display: 'block',
  },

  checklist: {
    display: 'flex', flexDirection: 'column', gap: '7px',
    padding: '13px 15px', background: '#0d0d0d',
    border: '1px solid #1e1e1e', borderRadius: '8px',
  },
  checkRow: { display: 'flex', alignItems: 'center', gap: '9px' },
  checkDot: {
    width: '15px', height: '15px', borderRadius: '50%',
    border: '1px solid #333', color: '#0A0A0A',
    fontSize: '9px', fontWeight: '700',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, lineHeight: 1,
  },
  checkDotMet: { background: GOLD, borderColor: GOLD },
  checkLabel: { fontSize: '11.5px', color: '#6a6a6a', fontFamily: 'Montserrat, sans-serif' },
  checkLabelMet: { color: GOLD },
  mismatch: {
    fontSize: '11.5px', color: '#e07070',
    fontFamily: 'Montserrat, sans-serif', marginTop: '-8px',
  },

  banner: {
    marginTop: '12px', padding: '10px 14px', borderRadius: '8px',
    fontSize: '12.5px', display: 'flex', alignItems: 'center',
    gap: '8px', lineHeight: 1.45, fontFamily: 'Montserrat, sans-serif',
  },
}
