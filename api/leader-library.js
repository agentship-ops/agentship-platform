// Leader Portal Resource Library.
//
//   GET /api/leader-library          -> the list of active resources, each with
//                                        the file's last-updated date from Drive
//   GET /api/leader-library?id=<id>  -> the PDF itself
//
// Every request must carry the signed-in person's Supabase token, and the
// person must have leader_portal_access or be an admin. Files are read from
// Google Drive with the read-only service account in GOOGLE_SERVICE_ACCOUNT_JSON,
// which is shared (Viewer) on each division's Leader Resources folder only.
// Leaders never get a Drive link.

import crypto from 'node:crypto'

const DRIVE = 'https://www.googleapis.com/drive/v3/files'
let cachedToken = null // { token, expires }

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function googleToken() {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.token
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  const sa = JSON.parse(raw)
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = signer.sign(sa.private_key).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(`Google sign-in failed: ${data.error_description || data.error || r.status}`)
  cachedToken = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
  return cachedToken.token
}

// Returns the profile if the token belongs to someone allowed in the Leader Portal.
async function leaderFromRequest(req, sbUrl, sbKey) {
  const auth = req.headers.authorization || ''
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!jwt) return null
  const u = await fetch(`${sbUrl}/auth/v1/user`, { headers: { apikey: sbKey, Authorization: `Bearer ${jwt}` } })
  if (!u.ok) return null
  const user = await u.json()
  if (!user?.id) return null
  const p = await fetch(
    `${sbUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,account_type,leader_portal_access`,
    { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
  )
  if (!p.ok) return null
  const [profile] = await p.json()
  if (!profile) return null
  if (profile.leader_portal_access === true || profile.account_type === 'admin') return profile
  return null
}

async function resources(sbUrl, sbKey, id) {
  const filter = id ? `&id=eq.${encodeURIComponent(id)}` : ''
  const r = await fetch(
    `${sbUrl}/rest/v1/leader_resources?active=eq.true${filter}&order=category.asc,sort_order.asc,title.asc&select=*`,
    { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
  )
  if (!r.ok) throw new Error(`Could not read leader_resources (${r.status})`)
  return r.json()
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store')
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const sbUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!sbUrl || !sbKey) return res.status(500).json({ error: 'Server is missing its Supabase settings.' })

  try {
    const leader = await leaderFromRequest(req, sbUrl, sbKey)
    if (!leader) return res.status(403).json({ error: 'This library is only available in the Leader Portal.' })

    const id = typeof req.query?.id === 'string' ? req.query.id : ''

    if (!id) {
      const rows = await resources(sbUrl, sbKey)
      const token = await googleToken()
      const withDates = await Promise.all(rows.map(async row => {
        try {
          const r = await fetch(`${DRIVE}/${encodeURIComponent(row.drive_file_id)}?fields=modifiedTime,trashed&supportsAllDrives=true`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!r.ok) return { ...row, updated_at: null, available: false }
          const meta = await r.json()
          return { ...row, updated_at: meta.modifiedTime, available: !meta.trashed }
        } catch {
          return { ...row, updated_at: null, available: false }
        }
      }))
      // The Drive file id stays on the server.
      return res.status(200).json({ resources: withDates.map(({ drive_file_id, ...rest }) => rest) })
    }

    const [row] = await resources(sbUrl, sbKey, id)
    if (!row) return res.status(404).json({ error: 'That resource is no longer in the library.' })
    const token = await googleToken()
    const file = await fetch(`${DRIVE}/${encodeURIComponent(row.drive_file_id)}?alt=media&supportsAllDrives=true`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!file.ok) {
      return res.status(502).json({ error: 'Drive did not return the file. It may have been moved out of the Leader Resources folder or replaced instead of updated with Manage versions.' })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    res.setHeader('Content-Type', file.headers.get('content-type') || 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${row.title.replace(/[^\w .-]/g, '')}.pdf"`)
    return res.status(200).send(buf)
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Something went wrong opening the library.' })
  }
}
