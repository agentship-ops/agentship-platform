// Download PDF: the agent's own copy of their plan (includes private sections).
// Ported from the prototype's planDoc and buildPDF.
import { calc, ACT, LBD, PROTECTION, R, U, $f, $neg, num, laneName } from './calc'

export function planDoc(data, year) {
  const k = calc(data), p = k.plan
  const secs = []
  secs.push({ title: 'Your Goals', head: ['', ''], rows: [['Income goal', $f(k.income)], ['Transaction goal', String(k.tx || '-')], ['GCI goal', $f(p.gci)], ['Sales volume goal', $f(k.volume)], ['Break-even deals', String(k.breakEven || '-')], ['Take-home per deal', $f(k.blended)]] })
  secs.push({ title: 'Your Activity', head: ['', 'This year', 'Each month', 'Each week'], rows: ACT.map(([key, l]) => { const n = k.chain[key] || 0; return [l, String(R(n)), String(U(n / 12)), String(U(n / 52))] }), key: [5] })
  secs.push({ title: 'Your Planned P&L', head: ['', String(year)], rows: [['Gross commission (GCI)', $f(p.gci)], ['  Zillow referral fees', $neg(p.zfee)], ['  Agentship split', $neg(p.split)], ['Your commission income', $f(p.take)], ['  KW royalty and cap', $neg(p.kw)], ['  Business expenses', $neg(p.exp)], ['Net profit', $f(p.net)], ['Your income goal', $f(k.income)]], key: [3, 6] })
  const lbd = []
  LBD.forEach(([key]) => (data.lbd[key] || []).forEach(r => { if (String(r.d).trim() || num(r.c)) lbd.push([r.d || '-', r.t || '', $f(num(r.c))]) }))
  lbd.push(['Total', '', $f(k.a)])
  secs.push({ title: 'Life by Design', head: ['What', 'When', 'Cost'], rows: lbd, key: [lbd.length - 1] })
  secs.push({ title: 'Your Foundation', head: ['', ''], rows: [['Financial clarity score', k.score == null ? '-' : k.score + '%'], ['Protection in place', PROTECTION.filter(([q]) => data.protection[q] === 'Yes').length + ' of 4'], ['Personal net worth (start)', $f(k.pS.nw)], ['Business net worth (start)', $f(k.bS.nw)], ['Monthly cost of living', $f(k.monthly)], ['Yearly cost of living', $f(k.c)], ['Yearly business expenses', $f(k.bizYr)]] })
  secs.push({ title: 'Accountability', text: [['How I\'ll hold myself accountable', data.acc.self || 'Not answered yet.'], ['How I want my leader to hold me accountable', data.acc.leader || 'Not answered yet.']] })
  const name = data.profile.name
  return {
    title: `${name ? name + "'s" : 'My'} ${year} Business Plan`,
    sub: laneName(data.profile.division) + ', Agentship Business Planning Clinic',
    secs,
    file: `${(name || 'My').replace(/[^A-Za-z0-9 ]/g, '').trim().replace(/\s+/g, '-') || 'My'}-${year}-Business-Plan`,
  }
}

export async function buildPDF(D) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 54, gold = [201, 168, 76]
  let y = 64
  const room = n => { if (y + n > H - 60) { doc.addPage(); y = 60 } }
  doc.setFont('times', 'bold'); doc.setFontSize(26); doc.setTextColor(10); doc.text(D.title, M, y); y += 18
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(95); doc.text(D.sub, M, y); y += 12
  doc.setDrawColor(...gold); doc.setLineWidth(2); doc.line(M, y, W - M, y); y += 14
  D.secs.forEach(sec => {
    room(70); y += 14; doc.setFont('times', 'bold'); doc.setFontSize(17); doc.setTextColor(10); doc.text(sec.title, M, y); y += 6
    if (sec.rows) {
      autoTable(doc, {
        startY: y, margin: { left: M, right: M }, theme: 'plain', head: sec.head.some(h => h) ? [sec.head] : undefined, body: sec.rows,
        styles: { font: 'helvetica', fontSize: 10, cellPadding: { top: 4, bottom: 4, left: 2, right: 2 }, textColor: 20, lineColor: [227, 223, 211], lineWidth: { bottom: 0.5 } },
        headStyles: { fontStyle: 'bold', textColor: 95, fontSize: 9 },
        didParseCell: c => { c.cell.styles.halign = c.column.index === 0 ? 'left' : 'right'; if (c.section === 'body' && (sec.key || []).includes(c.row.index)) c.cell.styles.fontStyle = 'bold' },
      })
      y = doc.lastAutoTable.finalY + 4
    } else {
      sec.text.forEach(([q, a]) => {
        room(40); y += 12; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(95); doc.text(q, M, y); y += 14
        doc.setFont('times', 'normal'); doc.setFontSize(13); doc.setTextColor(10)
        doc.splitTextToSize(a, W - 2 * M).forEach(line => { room(16); doc.text(line, M, y); y += 16 })
      })
    }
  })
  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120)
    doc.text('Agentship empowers agents who empower their buyers and sellers.', M, H - 30)
    doc.text(`Page ${i} of ${pages}`, W - M, H - 30, { align: 'right' })
  }
  return doc
}

export async function downloadPlan(data, year) {
  const D = planDoc(data, year)
  const doc = await buildPDF(D)
  doc.save(D.file + '.pdf')
  return D.file + '.pdf'
}
