function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// One branded shell so every Agentship email matches the invitation email:
// white wordmark, gold rounded top edge on the card, gold divider and button.
function brandedEmail(p) {
  const title = esc(p.title)
  const whenText = esc(p.whenText)
  const whereText = esc(p.whereText)
  const ctaLabel = esc(p.ctaLabel)
  const ctaUrl = esc(p.ctaUrl)
  const introHtml = p.introHtml || ''
  const footerNote = esc(p.footerNote)
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0A0A0A;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0A;padding:26px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;font-family:Montserrat,Lato,Arial,sans-serif;">
          <tr><td style="background:#1E1E1E;border:1px solid #2a2a2a;border-top:3px solid #C9A84C;border-radius:14px;padding:40px;">
            <div style="text-align:center;">
              <div style="font-size:26px;color:#FFFFFF;letter-spacing:8px;font-weight:700;">AGENTSHIP</div>
              <div style="font-size:12px;color:#8a8a8a;font-style:italic;margin-top:8px;">Grow your business. Keep your brand.</div>
            </div>
            <div style="height:1px;background:#C9A84C;margin:26px 0 28px;font-size:0;line-height:0;">&nbsp;</div>
            <div style="font-size:24px;color:#ffffff;font-weight:700;">${title}</div>
            <div style="font-size:14px;color:#b0b0b0;line-height:1.7;margin-top:12px;">${introHtml}</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:22px;border:1px solid #2a2a2a;border-radius:10px;">
              <tr><td style="padding:18px 20px;">
                <div style="font-size:14px;color:#eaeaea;margin-bottom:10px;"><span style="color:#777;">When&nbsp;&nbsp;&nbsp;</span> ${whenText}</div>
                <div style="font-size:14px;color:#eaeaea;"><span style="color:#777;">Where&nbsp;</span> ${whereText}</div>
              </td></tr>
            </table>
            <div style="text-align:center;margin:30px 0 8px;">
              <a href="${ctaUrl}" style="display:inline-block;background:#C9A84C;color:#0A0A0A;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;padding:14px 34px;border-radius:8px;text-decoration:none;">${ctaLabel}</a>
            </div>
            <div style="height:1px;background:#242424;margin:28px 0 20px;font-size:0;line-height:0;">&nbsp;</div>
            <div style="font-size:12px;color:#777;line-height:1.7;">${footerNote}</div>
            <div style="font-size:12px;color:#777;line-height:1.7;margin-top:12px;">Questions? Contact us at <span style="color:#C9A84C;">operations@agentship.com</span></div>
          </td></tr>
          <tr><td style="text-align:center;font-size:11px;color:#555;padding-top:18px;">Agentship&nbsp;&nbsp;|&nbsp;&nbsp;Powered by Keller Williams</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

// "Starting soon" reminder to people who RSVP'd going.
function eventReminderHtml(d) {
  return brandedEmail({
    title: d.title,
    introHtml: `This event is starting in <span style="color:#C9A84C;font-weight:600;">${esc(d.leadPhrase || 'a few minutes')}</span>. Here are the details.`,
    whenText: d.whenText,
    whereText: d.whereText,
    ctaLabel: d.ctaLabel || 'View event',
    ctaUrl: d.ctaUrl || 'https://agentship-platform.vercel.app',
    footerNote: "You're receiving this because you RSVP'd going to this event. Manage your reminders anytime in Settings.",
  })
}
function eventReminderText(d) {
  return `${d.title}\n\nThis event starts in ${d.leadPhrase || 'a few minutes'}.\nWhen: ${d.whenText}\nWhere: ${d.whereText}\n\n${d.ctaLabel || 'View event'}: ${d.ctaUrl || 'https://agentship-platform.vercel.app'}\n\nYou're receiving this because you RSVP'd going to this event.`
}

// "You're invited" announcement sent to the team when an event is created.
function eventInviteHtml(d) {
  return brandedEmail({
    title: d.title,
    introHtml: `A new event has been added to the team calendar. Let everyone know if you'll be there by RSVPing on the platform.`,
    whenText: d.whenText,
    whereText: d.whereText,
    ctaLabel: d.ctaLabel || 'View & RSVP',
    ctaUrl: d.ctaUrl || 'https://agentship-platform.vercel.app',
    footerNote: "You're receiving this because you're on the Agentship team. Manage notifications anytime in Settings.",
  })
}
function eventInviteText(d) {
  return `${d.title}\n\nA new event has been added to the team calendar. Let everyone know if you'll be there.\nWhen: ${d.whenText}\nWhere: ${d.whereText}\n\n${d.ctaLabel || 'View & RSVP'}: ${d.ctaUrl || 'https://agentship-platform.vercel.app'}\n\nYou're receiving this because you're on the Agentship team.`
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Reuses the same hook secret as the push endpoint, so no new secret to set.
  if (req.headers['x-push-secret'] !== process.env.PUSH_HOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { subject, text, html, template, data, recipients } = req.body || {}

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return res.status(200).json({ sent: 0, total: 0 })
  }

  const from = process.env.EMAIL_FROM
  const apiKey = process.env.RESEND_API_KEY
  if (!from || !apiKey) {
    return res.status(500).json({ error: 'Email not configured' })
  }

  // Known templates render branded HTML; otherwise use the supplied text/html.
  let finalHtml = html
  let finalText = text
  if (template === 'event_reminder' && data) {
    finalHtml = eventReminderHtml(data)
    finalText = eventReminderText(data)
  } else if (template === 'event_invite' && data) {
    finalHtml = eventInviteHtml(data)
    finalText = eventInviteText(data)
  }

  const results = await Promise.allSettled(
    recipients.map((to) =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to,
          subject: subject || 'Agentship',
          ...(finalText ? { text: finalText } : {}),
          ...(finalHtml ? { html: finalHtml } : {}),
        }),
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text())
        return r.json()
      })
    )
  )

  const sent = results.filter((r) => r.status === 'fulfilled').length
  return res.status(200).json({ sent, total: recipients.length })
}
