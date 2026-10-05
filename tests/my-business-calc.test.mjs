// Run: node tests/my-business-calc.test.mjs  (acceptance tests 1-3 and 5 from the My Business brief)
import assert from 'node:assert/strict'
import { dealCalc, calc, defaults, R, fubActuals, plSum } from '../src/lib/myBusiness/calc.js'
const deal = (z) => ({ total_commission: 12000, is_zillow: z })
const c1 = dealCalc(deal(false), 'collective'); assert.equal(R(c1.take), 8400)
const c2 = dealCalc(deal(true), 'collective'); assert.equal(R(c2.zfee), 4800); assert.equal(R(c2.take), 4680); assert.equal(R(c2.split), 2520)
assert.equal(R(dealCalc(deal(false), 'program').take), 6000)
assert.equal(R(dealCalc(deal(true), 'program').take), 3600)
console.log('1. Deal math: pass')
const d = defaults('Test Agent'); d.profile.division = 'collective'
d.lbd.trips[0].c = '10000'; d.col[0].v = '5000'; d.bizExp[0].v = '1000'
d.biz = { price: '400000', rate: '3', zillow: 50, cap: '0' }
const k = calc(d)
assert.equal(R(k.income), 70000); assert.equal(R(k.need), 85000); assert.equal(R(k.blended), 6540)
assert.equal(k.tx, 13); assert.equal(k.breakEven, 12); assert.equal(R(k.plan.net), 70020)
console.log('2. Plan math: pass', { income: k.income, need: k.need, blended: k.blended, tx: k.tx, breakEven: k.breakEven, net: k.plan.net })
const f = defaults(); f.lbd.trips[0].c = '1'; f.col[0].v = '1'; f.biz = { price: '1', rate: '1', zillow: 0, cap: '' }
// force 40 closings through the funnel at standard rates
const ch = { closed: 40 }; ch.uc = 40 / .9; ch.clients = ch.uc / .75; ch.met = ch.clients / .5; ch.set = ch.met / .5; ch.nurture = ch.set / .25
assert.deepEqual([R(ch.uc), R(ch.clients), R(ch.met), R(ch.set), R(ch.nurture)], [44, 59, 119, 237, 948])
// and the same thing through calc(): pick inputs that give exactly 40 transactions
const g = defaults(); g.profile.division = 'program'; g.col[0].v = String(40 * 6000 / 12 - 3000 / 12); g.biz = { price: '400000', rate: '3', zillow: 0, cap: '0' }
const kg = calc(g); assert.equal(kg.tx, 40)
assert.deepEqual([R(kg.chain.uc), R(kg.chain.clients), R(kg.chain.met), R(kg.chain.set), R(kg.chain.nurture)], [44, 59, 119, 237, 948])
console.log('3. Funnel: pass')
const rows = [
  { closed_date: '2027-03-10', total_commission: 12000, is_zillow: true, lead_source: 'Zillow Flex' },
  { closed_date: '2027-03-20', total_commission: 12000, is_zillow: false, lead_source: 'Sphere' },
]
const act = fubActuals(rows, 2027); const s = plSum(d, act, 2, 2)
assert.equal(R(s.take), 4680 + 8400); assert.equal(R(s.zfee), 4800); assert.equal(act.months[2].closed, 2)
assert.ok(/zillow/i.test('Zillow Flex') && !/zillow/i.test('Sphere'))
console.log('5. Zillow flag drives the math: pass')
