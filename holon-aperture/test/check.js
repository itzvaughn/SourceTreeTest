#!/usr/bin/env node
/* Fast regression checks for the simulation core:  node test/check.js */
const assert = require('assert');
const Sim = require('../sim.js');

// 1. The order spectrum must read pure noise as noise.
{
  const w = new Sim.World(1), rnd = Sim.mulberry32(5);
  let max = 0, sum = 0, n = 0;
  for (let rep = 0; rep < 30; rep++) {
    const pts = [];
    for (let i = 0; i < 2000; i++) pts.push({ x: rnd() * Sim.W, y: rnd() * Sim.H });
    const sp = w.orderSpectrum(pts);
    for (const z of sp.z) { max = Math.max(max, Math.abs(z)); sum += z; n++; }
  }
  assert(Math.abs(sum / n) < 0.3, 'null spectrum is biased: mean z ' + sum / n);
  assert(max < 5, 'null spectrum has outliers: max |z| ' + max);
  console.log('ok  null calibration (mean z ' + (sum / n).toFixed(2) + ', max |z| ' + max.toFixed(2) + ')');
}

// 2. ...and a clumped pattern as order, at the scale of the clumps.
{
  const w = new Sim.World(1), rnd = Sim.mulberry32(9), pts = [];
  for (let c = 0; c < 40; c++) {
    const cx = 100 + rnd() * (Sim.W - 200), cy = 100 + rnd() * (Sim.H - 200);
    for (let i = 0; i < 50; i++) pts.push({ x: cx + (rnd() - 0.5) * 80, y: cy + (rnd() - 0.5) * 80 });
  }
  const sp = w.orderSpectrum(pts);
  assert(sp.total > 500 && sp.z[3] > 10, 'clumps not detected');
  console.log('ok  clumps detected (' + Math.round(sp.total) + ' bits)');
}

// 3. Same seed, same world.
{
  const a = new Sim.World(11), b = new Sim.World(11);
  for (let i = 0; i < 1500; i++) { a.step(); b.step(); }
  assert.strictEqual(a.lv[0].length, b.lv[0].length);
  assert.strictEqual(a.lv[0][10].x, b.lv[0][10].x);
  console.log('ok  deterministic (' + a.lv[0].length + ' motes at t=1500)');
}

// 4. The first rungs are climbed, in order, and the hierarchy is consistent.
{
  const w = new Sim.World(7);
  for (let i = 0; i < 6000; i++) w.step();
  const at = k => { const m = w.milestones.find(m => m.key === k); return m ? m.t : Infinity; };
  assert(at('s1l0') < at('s3l0'), 'crisis before externalising');
  assert(at('s3l0') <= at('s4l0'), 'membrane before crisis');
  assert(at('s4l0') < 6000, 'no Cell within 6000 ticks');
  for (let L = 1; L <= Sim.MAXL; L++) for (const h of w.lv[L]) {
    assert(h.alive && h.kids.length >= 2, 'degenerate holon at level ' + L);
    for (const k of h.kids) assert(k.parent === h && k.level === L - 1 && k.alive, 'broken parent link');
  }
  for (const m of w.lv[0]) assert(m.E > 0 && isFinite(m.x) && isFinite(m.y), 'bad mote state');
  console.log('ok  ladder: externalise t=' + at('s1l0') + ', crisis t=' + at('s3l0') + ', first Cell t=' + at('s4l0'));
}

// 5. Knock out a rung and everything above it stalls.
{
  const w = new Sim.World(7, { allowBond: false });
  for (let i = 0; i < 4000; i++) w.step();
  assert.strictEqual(w.lv[1].length, 0, 'Cells formed without coordination');
  console.log('ok  knockout: no coordination, no Cells');
}
// 6. The origin: from indistinguishable elements to a measured 2-dimensional sheet.
{
  const o = new Sim.Origin(7);
  assert.strictEqual(o.refine().classes, 1, 'elements distinguishable before any differentiation');
  o.step(); assert.strictEqual(o.refine().classes, 2, 'first differentiation should give exactly two classes');
  const done = Sim.Origin.run(7), again = Sim.Origin.run(7), st = done.status();
  assert.strictEqual(done.relations, again.relations); assert.strictEqual(done.x[100], again.x[100]);
  assert.strictEqual(done.singletons, done.N, 'not every element became distinguishable');
  assert(done.events > done.depth * 3, 'history is not a proper partial order');
  for (let i = 0; i < done.N; i++) if (done.state[i] === 2) assert.strictEqual(done.nb[i].length, 6, 'interior element without six relations');
  for (const seed of [1, 2, 3, 4, 5]) { const d = Sim.Origin.run(seed).dim; assert(d > 1.8 && d < 2.2, 'dimension ' + d + ' for seed ' + seed); }
  assert(st[6].assumed && st[7].assumed && !st[5].assumed, 'the assumed steps must be flagged as assumed');
  console.log('ok  origin: ' + done.relations + ' relations, ' + done.events + ' events over ' + done.depth + ' causal steps, dimension ' + done.dim.toFixed(2));
}

// 7. The chain is intact and every analogue it names has a detector.
{
  const chain = require('../chain.js'), w = new Sim.World(7), ana = w.analogues();
  const steps = chain.reduce((a, e) => a.concat(e.steps), []);
  assert.strictEqual(chain.length, 13); assert.strictEqual(steps.length, 120);
  for (let i = 1; i < chain[0].steps.length; i++) assert.strictEqual(chain[0].steps[i].origin, i);
  for (const s of steps) if (s.analogue) assert(ana[s.analogue], 'no detector for ' + s.analogue);
  assert.strictEqual(steps.filter(s => s.open).length, 6);
  for (let i = 0; i < 5000; i++) w.step();
  const on = Object.entries(w.analogues()).filter(([, v]) => v.on).map(([k]) => k);
  assert(on.includes('copy') && on.includes('select') && on.includes('assemble') && on.includes('divide'), 'expected analogues missing: ' + on);
  console.log('ok  chain: 120 steps in 13 epochs, ' + on.length + ' of ' + Object.keys(ana).length + ' analogues observed by t=5000');
}
console.log('all checks passed');
