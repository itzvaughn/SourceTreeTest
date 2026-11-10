#!/usr/bin/env node
/*
 * Headless run of the simulation core.
 *   node test/run.js [ticks=20000] [seed=7] [key=value ...]
 * Prints one line per 1000 ticks and checks the null calibration of the
 * order spectrum (random points must read as indistinguishable from noise).
 */
const Sim = require('../sim.js');

const ticks = +(process.argv[2] || 20000);
const seed = +(process.argv[3] || 7);
const params = {};
const consts = {};
for (const kv of process.argv.slice(4)) {
  const [k, v] = kv.split('=');
  const val = v === 'true' ? true : v === 'false' ? false : +v;
  if (k.startsWith('K.')) consts[k.slice(2)] = val; else params[k] = val;
}
Object.assign(Sim.K, consts);

// --- null calibration -------------------------------------------------------
{
  const w = new Sim.World(1);
  const rnd = Sim.mulberry32(99);
  let maxAbs = 0, sum = 0, n = 0;
  for (let rep = 0; rep < 40; rep++) {
    const pts = [];
    for (let i = 0; i < 2500; i++) pts.push({ x: rnd() * Sim.W, y: rnd() * Sim.H });
    const sp = w.orderSpectrum(pts);
    for (let s = 0; s < Sim.NSCALE; s++) { maxAbs = Math.max(maxAbs, Math.abs(sp.z[s])); sum += sp.z[s]; n++; }
  }
  console.log(`null calibration: mean z = ${(sum / n).toFixed(2)}, max |z| = ${maxAbs.toFixed(2)} (expect ~0 and < ~4)`);
}

const w = new Sim.World(seed, params);
const t0 = Date.now();
const f = (v, d = 2) => v.toFixed(d);
const every = +(process.env.EVERY || 1000);
for (let i = 1; i <= ticks; i++) {
  w.step();
  if (i % every === 0) {
    const st = w.stats, tr = st.traits;
    const stages = st.stage.slice(0, 3).map(a => Array.from(a).map(v => Math.round(v * 9)).join('')).join(' ');
    const l1 = w.lv[1]; let ms = 0, me = 0, ag = 0; for (const h of l1) { ms += h.mass; me += h.meanE; ag += h.age; }
    const diag = l1.length ? ` | L1 mass=${f(ms / l1.length, 1)} E=${f(me / l1.length)} age=${Math.round(ag / l1.length)}` : '';
    console.log(
      `t=${String(i).padStart(6)} N=${String(w.lv[0].length).padStart(4)} L1=${String(w.lv[1].length).padStart(3)} L2=${String(w.lv[2].length).padStart(3)} L3=${String(w.lv[3].length).padStart(2)} L4=${w.lv[4].length}` +
      ` | cap=${f(tr.cap)} ext=${f(tr.ext)} bnd=${f(tr.bnd)} enc=${f(tr.enc)} mov=${f(tr.mov)}` +
      ` | extShare=${f(st.extShare)} in=${f(st.influx, 1)} diss=${f(st.diss, 1)}` +
      ` | stages ${stages} | bits=${Math.round(w.spec.total)} z=[${Array.from(w.spec.z).map(v => Math.round(v)).join(',')}]` + diag
    );
  }
}
const dt = (Date.now() - t0) / 1000;
console.log(`\n${ticks} ticks in ${dt.toFixed(1)}s (${Math.round(ticks / dt)} ticks/s)`);
console.log('milestones:');
for (const m of w.milestones) console.log(`  t=${String(m.t).padStart(6)}  ${m.label}`);
