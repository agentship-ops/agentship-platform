import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { enablePush, currentPermission, pushSupported } from '../lib/push'

const GOLD = '#C9A84C'

// Grouped to mirror the sidebar so the page reads like the platform.
// `key` matches a boolean column on public.notification_prefs.
const NOTIF_GROUPS = [
  {
    id: 'personal',
    label: 'Just for You',
    icon: 'ti-user',
    rows: [
      { key: 'dm', label: 'Direct messages', desc: 'Someone sends you a private message' },
      { key: 'mentions', label: "When you're @mentioned", desc: 'Someone tags you by name anywhere on the platform' },
      { key: 'replies', label: 'Replies and reactions', desc: 'Someone replies to or reacts to something you posted' },
    ],
  },
  {
    id: 'community',
    label: 'Community',
    icon: 'ti-users',
    rows: [
      { key: 'events', label: 'Events', desc: "A new event is posted, or one you RSVP'd to changes" },
      { key: 'bullpen', label: 'Bullpen', desc: 'A new announcement or post goes up in the Bullpen' },
      { key: 'referrals', label: 'Referrals', desc: 'A new referral opportunity is posted' },
    ],
  },
  {
    id: 'channels',
    label: 'Channels',
    icon: 'ti-messages',
    rows: [
      { key: 'channels', label: 'All channel messages', desc: "Every message posted in a channel you're in. Leave this off and you'll still get @mentions." },
    ],
  },
  {
    id: 'library',
    label: 'Training & Resources',
    icon: 'ti-folder',
    rows: [
      { key: 'training', label: 'New training added', desc: 'A video or course is added to the Training Library' },
      { key: 'resources', label: 'New resource added', desc: 'A script, sheet, or vendor doc is added to the Resource Library' },
    ],
  },
]

const PREF_KEYS = NOTIF_GROUPS.flatMap(g => g.rows.map(r => r.key))

export default function Settings() {
  const { user, profile, updateProfile, signOut } = useAuth()

  // ── Profile ──────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState(null) // { ok, text }

  // ── Photo ────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false)
  const [photoMsg, setPhotoMsg] = useState(null)
  const fileRef = useRef(null)

  // ── Password ─────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState(null)

  // ── Notifications ────────────────────────────────────────────
  const [prefs, setPrefs] = useState(null)
  const [perm, setPerm] = useState(currentPermission())
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMsg, setPushMsg] = useState('')

  // Hydrate the profile form once the profile arrives.
  useEffect(() => {
    if (!profile) return
    setFirstName(profile.first_name ?? '')
    setLastName(profile.last_name ?? '')
    setPhone(profile.phone ?? '')
  }, [profile])

  const loadPrefs = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('notification_prefs')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (data) {
      setPrefs(data)
    } else {
      // No row yet (user created before the migration backfill). Create one.
      const { data: created } = await supabase
        .from('notification_prefs')
        .insert({ user_id: user.id })
        .select()
        .maybeSingle()
      setPrefs(created ?? defaultPrefs(user.id))
    }
  }, [user])

  useEffect(() => { loadPrefs() }, [loadPrefs])

  function defaultPrefs(uid) {
    return {
      user_id: uid,
      dm: true, mentions: true, replies: true,
      events: true, bullpen: true, referrals: true,
      channels: false,
      training: true, resources: true,
    }
  }

  const initials =
    `${(profile?.first_name?.[0] ?? '').toUpperCase()}${(profile?.last_name?.[0] ?? '').toUpperCase()}` || '?'

  const displayTitle = profile?.title?.trim()
    || ({ admin: 'Admin', leader: 'Leader', agent: 'Agent' })[profile?.account_type]
    || 'Agent'

  // ── Photo actions ────────────────────────────────────────────
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    if (!file.type.startsWith('image/')) {
      setPhotoMsg({ ok: false, text: 'Please choose an image file (JPG or PNG).' })
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoMsg({ ok: false, text: 'That image is over 5MB. Please choose a smaller one.' })
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setUploading(true)
    setPhotoMsg(null)

    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${user.id}/headshot.${ext}`

      // Clear out any previous headshot so a jpg → png swap doesn't leave
      // an orphaned file behind in the bucket.
      const { data: existing } = await supabase.storage.from('avatars').list(user.id)
      const stale = (existing || [])
        .filter(f => f.name !== `headshot.${ext}`)
        .map(f => `${user.id}/${f.name}`)
      if (stale.length) await supabase.storage.from('avatars').remove(stale)

      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)

      // Cache-bust so the new photo appears immediately instead of the
      // browser serving the old one from cache at the same URL.
      const { error: profErr } = await updateProfile({ avatar_url: `${publicUrl}?v=${Date.now()}` })
      if (profErr) throw profErr

      setPhotoMsg({ ok: true, text: 'Photo updated.' })
    } catch (err) {
      setPhotoMsg({ ok: false, text: err.message || 'Upload failed. Please try again.' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function removePhoto() {
    if (!user) return
    setUploading(true)
    setPhotoMsg(null)
    try {
      const { data: existing } = await supabase.storage.from('avatars').list(user.id)
      if (existing?.length) {
        await supabase.storage.from('avatars').remove(existing.map(f => `${user.id}/${f.name}`))
      }
      const { error } = await updateProfile({ avatar_url: null })
      if (error) throw error
      setPhotoMsg({ ok: true, text: 'Photo removed.' })
    } catch (err) {
      setPhotoMsg({ ok: false, text: err.message || 'Could not remove the photo.' })
    } finally {
      setUploading(false)
    }
  }

  // ── Profile save ─────────────────────────────────────────────
  async function saveProfile() {
    if (!firstName.trim() || !lastName.trim()) {
      setProfileMsg({ ok: false, text: 'First and last name are both required.' })
      return
    }
    setSavingProfile(true)
    setProfileMsg(null)

    const { error } = await updateProfile({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
    })

    setSavingProfile(false)
    setProfileMsg(error
      ? { ok: false, text: error.message }
      : { ok: true, text: 'Saved.' })
  }

  // ── Password change ──────────────────────────────────────────
  async function changePassword() {
    setPwMsg(null)

    if (!currentPw || !newPw || !confirmPw) {
      setPwMsg({ ok: false, text: 'Please fill in all three password fields.' })
      return
    }
    if (newPw.length < 8) {
      setPwMsg({ ok: false, text: 'Your new password needs to be at least 8 characters.' })
      return
    }
    if (newPw !== confirmPw) {
      setPwMsg({ ok: false, text: "Those new passwords don't match." })
      return
    }
    if (newPw === currentPw) {
      setPwMsg({ ok: false, text: 'Your new password must be different from your current one.' })
      return
    }

    setSavingPw(true)

    // Supabase lets you set a new password without proving the old one, so we
    // verify the current password first by signing in with it. This keeps a
    // walk-up on an unlocked laptop from changing someone's password.
    const { error: reauthErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPw,
    })
    if (reauthErr) {
      setSavingPw(false)
      setPwMsg({ ok: false, text: 'That current password is not correct.' })
      return
    }

    const { error } = await supabase.auth.updateUser({ password: newPw })
    setSavingPw(false)

    if (error) {
      setPwMsg({ ok: false, text: error.message })
      return
    }

    setCurrentPw(''); setNewPw(''); setConfirmPw('')
    setPwMsg({ ok: true, text: 'Password updated. Use it next time you sign in.' })
  }

  // ── Notifications ────────────────────────────────────────────
  async function togglePref(key) {
    if (!prefs || !user) return
    const next = !prefs[key]
    setPrefs(p => ({ ...p, [key]: next })) // optimistic

    const { error } = await supabase
      .from('notification_prefs')
      .upsert(
        { user_id: user.id, [key]: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      )

    if (error) setPrefs(p => ({ ...p, [key]: !next })) // roll back
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
  const groupSummary = (rows) => {
    if (!prefs) return ''
    const on = rows.filter(r => prefs[r.key]).length
    if (on === 0) return 'OFF'
    return `${on} ON`
  }

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>

        <div style={styles.pgTitle}>Settings</div>
        <div style={styles.pgSub}>Manage your photo, password, and what you get notified about.</div>

        {/* ══ PROFILE ══ */}
        <div style={styles.card}>
          <div style={styles.cHead}>
            <div style={styles.cKicker}>Profile</div>
            <div style={styles.cTitle}>Your photo and name</div>
          </div>
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
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFile}
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
                  JPG or PNG · Max 5MB · A square headshot works best. Your photo shows next to
                  your name in the sidebar, in channels and messages, and in the directory.
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

            {profileMsg && <Banner ok={profileMsg.ok} text={profileMsg.text} />}

            <div style={styles.save}>
              <button
                onClick={saveProfile}
                disabled={savingProfile}
                style={{ ...styles.btnGold, opacity: savingProfile ? 0.55 : 1 }}
              >
                {savingProfile ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>

        {/* ══ ACCOUNT ══ */}
        <div style={styles.card}>
          <div style={styles.cHead}>
            <div style={styles.cKicker}>Account</div>
            <div style={styles.cTitle}>Login and password</div>
          </div>
          <div style={styles.cBody}>

            <Field label="Email Address" locked note="Your Agentship email is your login and can't be changed here.">
              <input style={{ ...styles.input, ...styles.inputLocked }} value={user?.email ?? ''} disabled />
            </Field>

            <div style={styles.rule} />

            <Field label="Current Password">
              <input
                style={styles.input}
                type="password"
                autoComplete="current-password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                placeholder="Enter your current password"
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
                  placeholder="At least 8 characters"
                />
              </Field>
              <Field label="Confirm New Password">
                <input
                  style={styles.input}
                  type="password"
                  autoComplete="new-password"
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Re-enter new password"
                />
              </Field>
            </div>

            {pwMsg && <Banner ok={pwMsg.ok} text={pwMsg.text} />}

            <div style={styles.save}>
              <button
                onClick={changePassword}
                disabled={savingPw}
                style={{ ...styles.btnGold, opacity: savingPw ? 0.55 : 1 }}
              >
                {savingPw ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>

        {/* ══ NOTIFICATIONS ══ */}
        <div style={styles.card}>
          <div style={styles.cHead}>
            <div style={styles.cKicker}>Notifications</div>
            <div style={styles.cTitle}>Choose what reaches you</div>
          </div>

          {/* master device switch */}
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

          {/* groups */}
          {NOTIF_GROUPS.map((g, gi) => (
            <div
              key={g.id}
              style={{
                ...styles.group,
                borderBottom: gi === NOTIF_GROUPS.length - 1 ? 'none' : '1px solid #1a1a1a',
              }}
            >
              <div style={styles.groupHead}>
                <i className={`ti ${g.icon}`} aria-hidden="true" style={styles.groupIcon} />
                <span style={styles.groupName}>{g.label}</span>
                <span style={styles.groupCount}>{groupSummary(g.rows)}</span>
              </div>

              <div style={styles.groupRows}>
                {g.rows.map((r, ri) => (
                  <div
                    key={r.key}
                    style={{ ...styles.row, borderTop: ri === 0 ? 'none' : '1px solid #181818' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={styles.rowLabel}>{r.label}</div>
                      <div style={styles.rowDesc}>{r.desc}</div>
                    </div>
                    <Toggle
                      on={!!prefs?.[r.key]}
                      dim={!pushOn}
                      onClick={() => togglePref(r.key)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ══ SIGN OUT ══ */}
        <div style={styles.signOutCard}>
          <div>
            <div style={styles.soLabel}>Sign out</div>
            <div style={styles.soDesc}>
              You'll need your Agentship email and password to sign back in.
            </div>
          </div>
          <button onClick={signOut} style={styles.btnDanger}>
            <i className="ti ti-logout" aria-hidden="true" style={{ fontSize: '16px' }} />
            Sign Out
          </button>
        </div>

      </div>
    </div>
  )
}

/* ── small pieces ───────────────────────────────────────────── */

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

function Toggle({ on, onClick, dim }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      style={{
        ...styles.toggle,
        background: on ? GOLD : '#262626',
        opacity: dim ? 0.45 : 1,
      }}
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

/* ── styles ─────────────────────────────────────────────────── */

const styles = {
  page: { padding: '34px 44px 60px', overflowY: 'auto' },
  wrap: { maxWidth: '660px' },

  pgTitle: { fontSize: '22px', fontWeight: '800', color: '#fff', fontFamily: 'Montserrat, sans-serif' },
  pgSub: { fontSize: '13px', color: '#555', marginTop: '4px' },

  card: {
    background: '#111',
    border: '1px solid #222',
    borderRadius: '14px',
    marginTop: '24px',
    overflow: 'hidden',
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
  btnDanger: {
    padding: '10px 20px', background: 'transparent', color: '#e07070',
    border: '1px solid rgba(224,112,112,0.3)', borderRadius: '8px',
    fontSize: '13px', fontWeight: '700', fontFamily: 'Montserrat, sans-serif',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
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

  group: {},
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
    cursor: 'pointer', flexShrink: 0, border: 'none',
    transition: 'background 0.18s',
  },
  knob: {
    width: '18px', height: '18px', borderRadius: '50%',
    transition: 'transform 0.18s', display: 'block',
  },

  signOutCard: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: '20px', background: '#111', border: '1px solid #2a2a2a',
    borderRadius: '14px', padding: '18px 24px', marginTop: '24px',
    maxWidth: '660px',
  },
  soLabel: { fontSize: '14px', fontWeight: '700', color: '#fff' },
  soDesc: { fontSize: '11.5px', color: '#555', marginTop: '3px' },

  banner: {
    marginTop: '12px', padding: '10px 14px', borderRadius: '8px',
    fontSize: '12.5px', display: 'flex', alignItems: 'center',
    gap: '8px', lineHeight: 1.45, fontFamily: 'Montserrat, sans-serif',
  },
}
