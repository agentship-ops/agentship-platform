import webpush from 'web-push'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (req.headers['x-push-secret'] !== process.env.PUSH_HOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { title, body, url, subscriptions } = req.body || {}

  if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
    return res.status(200).json({ sent: 0, total: 0 })
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VITE_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  )

  const payload = JSON.stringify({
    title: title || 'Agentship',
    body: body || '',
    url: url || '/',
  })

  const results = await Promise.allSettled(
    subscriptions.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return res.status(200).json({ sent, total: subscriptions.length })
}
