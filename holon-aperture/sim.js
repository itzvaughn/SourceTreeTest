/*
 * Holon Aperture — simulation core.
 *
 * One rule set, applied at every level of organisation:
 *   I   embody      a holon harvests free energy with its own body
 *   II  externalise it deposits structure into the world that does the work for it
 *   III coordinate  peers bond through that structure and synchronise
 *   IV  crisis      flat consensus cost grows as n^(1+beta) and overtakes the benefit
 *   V   transcend   a coalition in crisis closes a membrane and becomes one holon
 *   VI  recurse     the new holon starts again at I, one level up
 *
 * Everything that exists pays a persistence cost every tick. Structure decays.
 * Nothing is scripted: stages are measured, not set.
 *
 * No DOM access in this file. It runs unchanged in Node (see test/run.js).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HolonSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var GW = 192, GH = 128, CS = 10, W = GW * CS, H = GH * CS, MAXL = 4;
  var HC = 16, HW = W / HC, HH = H / HC;
  var R0 = 3.2, L0 = 8;
  var NSCALE = 7; // dyadic coarse-graining scales: 10u .. 640u blocks
  var LN2 = Math.LN2;

  var LEVEL_NAMES = ['Mote', 'Cell', 'Body', 'Colony', 'Biome'];
  var LEVEL_PLURAL = ['Motes', 'Cells', 'Bodies', 'Colonies', 'Biomes'];
  var RING = 64, RCOS = new Float32Array(RING), RSIN = new Float32Array(RING);
  for (var ri = 0; ri < RING; ri++) { RCOS[ri] = Math.cos(ri * 2 * Math.PI / RING); RSIN[ri] = Math.sin(ri * 2 * Math.PI / RING); }
  var POW17 = [1, 1.7, 2.89, 4.913, 8.352];
  var STAGE_NAMES = ['Embody', 'Externalise', 'Coordinate', 'Crisis', 'Transcend', 'Recurse'];

  // ---- tunable physics (fixed; the user-facing dials scale these) -------------
  var K = {
    sun: 0.00065,       // free-energy inflow rate per bare cell
    harvest: 0.06,      // fraction of local F a body can take per tick at full capacity
    kappa: 5.0,         // how much structure can multiply local energy capture
    kharv: 0.9,         // how much standing on structure adds to a body's own harvest
    ks: 0.10,           // structure density at half effect
    synergy: 2.0,       // extra structure per unit energy when builders are coordinated
    m0: 0.0030,         // bare cost of existing
    mcap: 0.0040,       // cost of embodied capacity
    mmov: 0.0012,       // cost of motility
    cbond: 0.00015,     // upkeep per bond
    ccons: 0.00034,     // flat-consensus cost coefficient
    consLevel: 1.5,     // consensus cost multiplier per level
    shelter: 0.50,      // fraction of bare cost removed per enclosing membrane
    cmem: 0.0018,       // membrane upkeep ~ sqrt(mass)
    chub: 0.0002,       // hub (hierarchical) coordination cost, linear in mass
    hrim: 0.042,         // harvest rate of a membrane sample point at full capacity
    dep0: 0.0006,       // mote deposit rate at ext = 1
    depH: 0.0005,       // per-mote deposit rate of higher holons at ext = 1
    decay: 0.004,       // structure decay per tick at level 0
    decayLevel: 0.62,   // decay multiplier per level (bigger works last longer)
    build: 0.12,        // one-off membrane build cost per mote
    Ebirth: 0.55, Erep: 1.35, Erepcost: 0.10,
    stressT: 0.25,      // consensus cost / income that counts as a scaling crisis
    Emax: 3.0,          // storage limit of one mote; surplus is shed as heat
    matter: 5000,       // conserved stock of body-matter: births draw on it, deaths return it
    maxMotes: 5200
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }


  /*
   * Origin: the pre-geometric prologue. It enacts the first six steps of the
   * chain with nothing but elements and relations, and stops where the chain
   * itself stops being derivable.
   *
   *   N elements with no properties and no relations are indistinguishable:
   *   every permutation is a symmetry. One is marked (unexplained: it is the
   *   seed's first random draw). Relations then form under two constraints
   *   (a relation always closes a triple; an edge belongs to at most two
   *   triples) by two rewrite rules:
   *     extend  a related pair on the rim recruits an unrelated element
   *     close   a rim element with six relations seals its two rim neighbours
   *   Composing rule applications gives a history; which application needed
   *   which gives a causal partial order and a clock; shortest relation paths
   *   give distance, and ball growth gives a dimension.
   *
   * Whether an element is distinguishable is decided by colour refinement
   * (1-WL): two elements differ if their relational neighbourhoods differ at
   * some depth. That is a lower bound on true distinguishability.
   */
  function Origin(seed, n) {
    var N = this.N = n || 320, i;
    this.rand = mulberry32(((seed >>> 0) ^ 0x51ED270B) >>> 0);
    this.nb = []; for (i = 0; i < N; i++) this.nb.push([]);
    this.x = new Float64Array(N); this.y = new Float64Array(N);
    this.fx = new Float64Array(N); this.fy = new Float64Array(N);
    this.state = new Uint8Array(N);            // 0 unrelated, 1 rim, 2 interior
    this.bn = new Int32Array(N).fill(-1); this.bp = new Int32Array(N).fill(-1);
    this.last = new Int32Array(N);             // causal depth of the last event touching an element
    this.marked = -1; this.related = 0; this.relations = 0; this.events = 0; this.depth = 0;
    this.extends = 0; this.closes = 0; this.blen = 0; this.bstart = 0; this.phase = 0;
    this.cls = new Int32Array(N); this.single = new Uint8Array(N); this.hue = new Float32Array(N).fill(-1);
    this.hueN = 0; this.classes = 1; this.singletons = 0;
    this.sx = 0; this.sy = 0; this.dim = 0; this.ecc = 0;
    this.cx = 0; this.cy = 0; this.scale = 1;
    for (i = 0; i < N; i++) { // unrelated elements have no position; this cloud is only for display
      var a = this.rand() * 6.2832, r = 3 + 9 * Math.sqrt(this.rand());
      this.x[i] = Math.cos(a) * r; this.y[i] = Math.sin(a) * r;
    }
  }
  Origin.prototype.link = function (a, b) { this.nb[a].push(b); this.nb[b].push(a); this.relations++; };
  Origin.prototype.event = function (d) { this.events++; if (d > this.depth) this.depth = d; };

  Origin.prototype.step = function () {
    var r = this.rand, a, b, c, d, i;
    if (this.phase === 0) { this.marked = 0; this.phase = 1; this.event(0); return { type: 'differentiate', a: 0 }; }
    if (this.phase === 1) {
      for (i = 0; i < 3; i++) { this.x[i] = Math.cos(i * 2.0944) * 0.58; this.y[i] = Math.sin(i * 2.0944) * 0.58; this.state[i] = 1; this.last[i] = 1; this.sx += this.x[i]; this.sy += this.y[i]; }
      this.link(0, 1); this.link(1, 2); this.link(2, 0);
      this.bn[0] = 1; this.bn[1] = 2; this.bn[2] = 0; this.bp[0] = 2; this.bp[1] = 0; this.bp[2] = 1;
      this.related = 3; this.blen = 3; this.bstart = 0; this.phase = 2; this.event(1);
      return { type: 'relate', a: 0, b: 1, c: 2 };
    }
    if (this.phase !== 2) return null;
    if (this.related >= this.N) { this.phase = 3; return null; }
    // pick a rim pair, preferring crowded ones so notches fill before they become fjords
    var best = -1, bs = -1;
    for (var t = 0; t < 4; t++) {
      var k = (r() * this.blen) | 0, u = this.bstart;
      while (k-- > 0) u = this.bn[u];
      var sc = this.nb[u].length + this.nb[this.bn[u]].length + r() * 0.5;
      if (sc > bs) { bs = sc; best = u; }
    }
    a = best; b = this.bn[a]; c = this.related++;
    var mx = (this.x[a] + this.x[b]) / 2, my = (this.y[a] + this.y[b]) / 2;
    var ox = mx - this.sx / (this.related - 1), oy = my - this.sy / (this.related - 1), ol = Math.sqrt(ox * ox + oy * oy);
    if (ol < 1e-3) { ox = this.y[b] - this.y[a]; oy = this.x[a] - this.x[b]; ol = Math.sqrt(ox * ox + oy * oy) + 1e-9; }
    this.x[c] = mx + ox / ol * 0.8 + (r() - 0.5) * 0.1; this.y[c] = my + oy / ol * 0.8 + (r() - 0.5) * 0.1;
    this.sx += this.x[c]; this.sy += this.y[c];
    this.link(a, c); this.link(b, c);
    this.bn[a] = c; this.bp[c] = a; this.bn[c] = b; this.bp[b] = c; this.state[c] = 1; this.blen++;
    d = 1 + Math.max(this.last[a], this.last[b]); this.last[a] = this.last[b] = this.last[c] = d;
    this.extends++; this.event(d);
    var queue = [a, b, c], closed = 0;
    while (queue.length) {
      var v = queue.pop();
      if (this.state[v] !== 1 || this.nb[v].length < 6 || this.blen <= 3) continue;
      var p = this.bp[v], q = this.bn[v];
      if (this.nb[p].indexOf(q) >= 0) continue;
      this.link(p, q); this.bn[p] = q; this.bp[q] = p; this.state[v] = 2; this.blen--;
      if (this.bstart === v) this.bstart = p;
      d = 1 + Math.max(this.last[p], this.last[v], this.last[q]); this.last[p] = this.last[v] = this.last[q] = d;
      this.closes++; closed++; this.event(d);
      queue.push(p, q);
    }
    this.relax(1);
    return { type: 'extend', a: a, b: b, c: c, closed: closed };
  };

  // positions follow from relations alone: unit springs on relations, short-range repulsion
  Origin.prototype.relax = function (iters) {
    var n = this.related, x = this.x, y = this.y, fx = this.fx, fy = this.fy, i, j, k, dx, dy, d, f;
    for (var it = 0; it < iters; it++) {
      for (i = 0; i < n; i++) { fx[i] = 0; fy[i] = 0; }
      for (i = 0; i < n; i++) {
        var nb = this.nb[i];
        for (k = 0; k < nb.length; k++) {
          j = nb[k]; if (j < i) continue;
          dx = x[j] - x[i]; dy = y[j] - y[i]; d = Math.sqrt(dx * dx + dy * dy) + 1e-9;
          f = 0.14 * (d - 1) / d; fx[i] += dx * f; fy[i] += dy * f; fx[j] -= dx * f; fy[j] -= dy * f;
        }
        for (j = i + 1; j < n; j++) {
          dx = x[j] - x[i]; if (dx > 1.5 || dx < -1.5) continue;
          dy = y[j] - y[i]; if (dy > 1.5 || dy < -1.5) continue;
          var d2 = dx * dx + dy * dy; if (d2 > 2.25) continue;
          d = Math.sqrt(d2) + 1e-9; f = 0.07 * (1.5 - d) / d;
          fx[i] -= dx * f; fy[i] -= dy * f; fx[j] += dx * f; fy[j] += dy * f;
        }
      }
      for (i = 0; i < n; i++) {
        var mx = fx[i], my = fy[i]; if (mx > 0.4) mx = 0.4; else if (mx < -0.4) mx = -0.4; if (my > 0.4) my = 0.4; else if (my < -0.4) my = -0.4;
        x[i] += mx; y[i] += my;
      }
    }
  };

  // colour refinement: which elements can be told apart by their relations
  Origin.prototype.refine = function () {
    var N = this.N, n = this.related, cls = this.cls, i, k, round;
    if (this.phase === 0) { this.classes = 1; this.singletons = 0; return this; }
    for (i = 0; i < N; i++) cls[i] = i < n ? (i === this.marked ? 1 : 0) : 2;
    if (n === 0) { this.classes = 2; this.singletons = 1; this.single[0] = 1; if (this.hue[0] < 0) this.hue[0] = (this.hueN++ * 0.61803) % 1; return this; }
    var count = 0, next = new Int32Array(n);
    for (round = 0; round < 60; round++) {
      var map = new Map(), id = 0;
      for (i = 0; i < n; i++) {
        var nb = this.nb[i], cs = [];
        for (k = 0; k < nb.length; k++) cs.push(cls[nb[k]]);
        cs.sort(function (p, q) { return p - q; });
        var key = cls[i] + ':' + cs.join(',');
        var v = map.get(key); if (v === undefined) { v = id++; map.set(key, v); }
        next[i] = v;
      }
      for (i = 0; i < n; i++) cls[i] = next[i];
      if (id === count) break;
      count = id;
    }
    var size = new Int32Array(count + 1), s = 0;
    for (i = 0; i < n; i++) size[cls[i]]++;
    for (i = 0; i < n; i++) {
      var one = size[cls[i]] === 1; this.single[i] = one ? 1 : 0;
      if (one) { s++; if (this.hue[i] < 0) this.hue[i] = (this.hueN++ * 0.61803) % 1; }
    }
    this.singletons = s; this.classes = count + (n < N ? 1 : 0);
    return this;
  };

  // distance from shortest relation paths; dimension from how balls grow
  Origin.prototype.measure = function () {
    var n = this.related, dist = new Int32Array(n), vol = [], src, i, k, r;
    if (n < 30) { this.dim = 0; this.ecc = 0; return this; }
    var eccMin = 1e9;
    for (src = 0; src < 3; src++) {
      dist.fill(-1); dist[src] = 0;
      var q = [src], h = 0, ecc = 0;
      while (h < q.length) { var u = q[h++], nb = this.nb[u]; for (k = 0; k < nb.length; k++) { var w = nb[k]; if (dist[w] < 0) { dist[w] = dist[u] + 1; if (dist[w] > ecc) ecc = dist[w]; q.push(w); } } }
      if (ecc < eccMin) eccMin = ecc;
      for (i = 0; i < n; i++) if (dist[i] >= 0) vol[dist[i]] = (vol[dist[i]] || 0) + 1 / 3;
    }
    this.ecc = eccMin;
    var rmax = Math.floor(eccMin * 0.7), sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0, cum = vol[0] || 1;
    for (r = 1; r <= rmax; r++) {
      cum += vol[r] || 0;
      if (r < 2) continue;
      var lx = Math.log(r + 0.5), ly = Math.log(cum);
      sx += lx; sy += ly; sxx += lx * lx; sxy += lx * ly; m++;
    }
    this.dim = m >= 3 ? (m * sxy - sx * sy) / (m * sxx - sx * sx) : 0;
    return this;
  };

  Origin.prototype.finish = function () {
    this.relax(80);
    var n = this.related, cx = 0, cy = 0, rad = 0, i;
    for (i = 0; i < n; i++) { cx += this.x[i]; cy += this.y[i]; }
    cx /= n; cy /= n;
    for (i = 0; i < n; i++) { var dx = this.x[i] - cx, dy = this.y[i] - cy, d = Math.sqrt(dx * dx + dy * dy); if (d > rad) rad = d; }
    this.cx = cx; this.cy = cy; this.scale = H * 0.46 / (rad + 0.5);
    this.refine(); this.measure();
    return this;
  };
  Origin.prototype.wx = function (i) { return W / 2 + (this.x[i] - this.cx) * this.scale; };
  Origin.prototype.wy = function (i) { return H / 2 + (this.y[i] - this.cy) * this.scale; };

  // one entry per step of the chain's first epoch: has this run done it, and what was measured
  Origin.prototype.status = function () {
    var o = this, w = o.depth ? o.events / o.depth : 0;
    return [
      { done: o.phase >= 1, text: o.phase < 1 ? o.N + ' elements, no properties, no relations. Any one could be swapped for any other.' : o.related < 3 ? 'One element is marked off. Nothing explains which: it is the first random draw of the seed.' : o.singletons + ' of ' + o.N + ' elements can now be told apart by their relations alone.' },
      { done: o.relations >= 3, text: o.relations + ' relations under two constraints: every relation closes a triple, and a pair is shared by at most two triples. ' + o.blen + ' places the structure can grow from.' },
      { done: o.extends > 0 && o.closes > 0, text: 'Two rewrite rules. Extend: a related pair recruits an unrelated element (' + o.extends + ' times). Close: an element with six relations seals its neighbours (' + o.closes + ' times).' },
      { done: o.events >= 12, text: o.events + ' rule applications composed into one history.' },
      { done: o.depth >= 6 && o.events > o.depth, text: 'Which application needed which gives a partial order: ' + o.events + ' events, ' + o.depth + ' causal steps deep, so about ' + w.toFixed(1) + ' share each instant.' },
      { done: o.dim > 0, text: o.dim > 0 ? 'Shortest relation paths give distance. Balls grow as r^' + o.dim.toFixed(2) + ' across a radius of ' + o.ecc + ' steps: a candidate ' + Math.round(o.dim) + '-dimensional geometry.' : 'Not enough related elements yet to measure how balls grow.' },
      { done: o.phase >= 3, assumed: true, text: 'Assumed, not derived. The sheet is laid onto a ' + GW + ' × ' + GH + ' field and called space. The clock of that world is its own tick, not this causal order.' },
      { done: o.phase >= 3, assumed: true, text: 'Assumed, not derived. An energy field with fixed rules (inflow, diffusion, harvest, decay) is put in by hand. No quantum theory is simulated.' }
    ];
  };
  Origin.run = function (seed, n) { var o = new Origin(seed, n); o.step(); o.step(); while (o.step()) { /* grow */ } return o.finish(); };

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function hueDist(a, b) { var d = Math.abs(a - b); return d > 0.5 ? 1 - d : d; }

  function defaultParams() {
    return {
      sun: 1, entropy: 1, persist: 1, mut: 1, beta: 1, spont: 1,
      allowExt: true, allowBond: true, allowEnc: true, maxLevel: MAXL
    };
  }

  function World(seed, params) {
    this.p = defaultParams();
    if (params) for (var k in params) this.p[k] = params[k];
    this.reset(seed);
  }

  World.prototype.reset = function (seed) {
    this.seed = (seed >>> 0) || 1;
    this.rand = mulberry32(this.seed);
    this.t = 0;
    this.nextId = 1;
    this.F = new Float32Array(GW * GH);
    this.A = new Float32Array(GW * GH);     // attractiveness (for taxis + rendering)
    this.Stot = new Float32Array(GW * GH);
    this.Sig = new Float32Array(GW * GH);   // structure response 0..1
    this.inflow = new Float32Array(GW * GH);
    this.weather = new Float32Array(GW * GH).fill(1);
    this.S = [];
    var L;
    for (L = 0; L <= MAXL; L++) this.S.push(new Float32Array((GW >> L) * (GH >> L)));
    // the field starts where the relational sheet was laid down
    var o = this.origin = Origin.run(this.seed), i, sig = o.scale / CS * 0.8, rad = Math.ceil(sig * 2.2), fmax = 0;
    for (var k = 0; k < o.related; k++) {
      var ox = o.wx(k) / CS, oy = o.wy(k) / CS, x0 = Math.max(0, Math.floor(ox - rad)), x1 = Math.min(GW - 1, Math.ceil(ox + rad));
      for (var gy = Math.max(0, Math.floor(oy - rad)); gy <= Math.min(GH - 1, Math.ceil(oy + rad)); gy++)
        for (var gx = x0; gx <= x1; gx++) { var ddx = gx + 0.5 - ox, ddy = gy + 0.5 - oy; this.F[gx + gy * GW] += Math.exp(-(ddx * ddx + ddy * ddy) / (2 * sig * sig)); }
    }
    for (i = 0; i < GW * GH; i++) if (this.F[i] > fmax) fmax = this.F[i];
    for (i = 0; i < GW * GH; i++) this.F[i] = 0.05 + 0.30 * this.F[i] / fmax + 0.03 * this.rand();
    this.tot = { nucleated: 0, influx: 0, rim: 0, fission: new Float64Array(MAXL + 1), transcend: new Float64Array(MAXL + 1), collapse: new Float64Array(MAXL + 1) };
    this.lv = [];
    for (L = 0; L <= MAXL; L++) this.lv.push([]);
    this.hashHead = new Int32Array(HW * HH);
    this.hashNext = new Int32Array(K.maxMotes + 512);
    this.pending = [];
    this.events = [];
    this.milestones = [];
    this.mileSet = {};
    this.history = [];
    this.histStride = 64;
    this.coals = [];
    for (L = 0; L <= MAXL; L++) this.coals.push([]);
    this.acc = this._newAcc();
    this.stats = this._emptyStats();
    this.counts = new Float64Array(GW * GH);
    this.spec = { bits: new Float64Array(NSCALE), z: new Float64Array(NSCALE), total: 0, perMote: 0 };
    this.blockZ = [];
    for (var s = 0; s < NSCALE; s++) this.blockZ.push(new Float32Array((GW >> s) * (GH >> s)));
    this.births = 0; this.deaths = 0;
  };

  World.prototype._newAcc = function () {
    return {
      ticks: 0, influx: 0, diss: 0,
      intakeAll: new Float64Array(MAXL + 1), intakeExt: new Float64Array(MAXL + 1),
      intakeBody: 0,
      crisis: new Float64Array(MAXL + 1), freeBonded: new Float64Array(MAXL + 1),
      transcend: new Float64Array(MAXL + 1), collapse: new Float64Array(MAXL + 1),
      fission: new Float64Array(MAXL + 1), rim: new Float64Array(MAXL + 1)
    };
  };

  World.prototype._emptyStats = function () {
    var st = {
      n: new Float64Array(MAXL + 1), massTop: new Float64Array(MAXL + 1),
      stage: [], reached: [], topLevel: 0,
      influx: 0, diss: 0, stored: 0, structure: 0,
      traits: { cap: 0, ext: 0, bnd: 0, enc: 0, mov: 0 },
      extShare: 0, bodyShare: 1, coh: new Float64Array(MAXL + 1), bonded: new Float64Array(MAXL + 1),
      lineages: 0, meanDepth: 0, transcends: 0, collapses: 0, genomeBits: 0,
      maxGen: new Float64Array(MAXL + 1), meanAge: new Float64Array(MAXL + 1), rimShare: 0, memberAge: 0
    };
    for (var L = 0; L <= MAXL; L++) { st.stage.push(new Float64Array(6)); st.reached.push([false, false, false, false, false, false]); }
    return st;
  };

  function mk(level, id) {
    return {
      id: id, level: level, alive: true,
      x: 0, y: 0, vx: 0, vy: 0, fx: 0, fy: 0,
      E: 0, dE: 0, meanE: 0, mass: 1, inc: 0, age: 0,
      cap: 0, ext: 0, bnd: 0, enc: 0, mov: 0, fis: 0, hue: 0, om: 0,
      th: 0, dth: 0, cosAcc: 0, coord: 0,
      parent: null, kids: level > 0 ? [] : null, bonds: [],
      coalN: 1, crisis: false, stress: 0,
      R: level === 0 ? R0 : 0, lastFis: 0, mark: 0, flash: 0, gen: 0, hx: 0, hy: 0, ci: 0, sn: 0, cs: 1
    };
  }

  World.prototype.gauss = function () {
    var u = this.rand() + 1e-12, v = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v);
  };

  World.prototype.mutateInto = function (c, a) {
    var s = 0.05 * this.p.mut, r = this.rand;
    c.cap = clamp01(a.cap + this.gauss() * s);
    c.ext = clamp01(a.ext + this.gauss() * s);
    c.bnd = clamp01(a.bnd + this.gauss() * s);
    c.enc = clamp01(a.enc + this.gauss() * s);
    c.mov = clamp01(a.mov + this.gauss() * s);
    c.fis = clamp01(a.fis + this.gauss() * s);
    c.om = clamp01(a.om + this.gauss() * s * 0.5);
    var h = a.hue + this.gauss() * 0.010 * this.p.mut;
    c.hue = h - Math.floor(h);
    if (r() < 0.03 * this.p.mut) { // rare large jump in one trait
      var which = (r() * 5) | 0, d = (r() - 0.5) * 0.5;
      if (which === 0) c.cap = clamp01(c.cap + d);
      else if (which === 1) c.ext = clamp01(c.ext + d);
      else if (which === 2) c.bnd = clamp01(c.bnd + d);
      else if (which === 3) c.enc = clamp01(c.enc + d);
      else c.mov = clamp01(c.mov + d);
    }
  };

  // ---- events / milestones ---------------------------------------------------
  World.prototype.emit = function (type, level, x, y, r, n) {
    if (this.events.length < 400) this.events.push({ t: this.t, type: type, level: level, x: x, y: y, r: r, n: n });
  };
  World.prototype.milestone = function (key, level, stage, label) {
    if (this.mileSet[key]) return;
    this.mileSet[key] = true;
    var m = { t: this.t, key: key, level: level, stage: stage, label: label };
    this.milestones.push(m);
    this.emit('milestone', level, 0, 0, 0, this.milestones.length - 1);
  };

  // ---- bonds -----------------------------------------------------------------
  function bonded(a, b) { return a.bonds.indexOf(b) >= 0; }
  function bond(a, b) { a.bonds.push(b); b.bonds.push(a); }
  function unbond(a, b) {
    var i = a.bonds.indexOf(b); if (i >= 0) a.bonds.splice(i, 1);
    i = b.bonds.indexOf(a); if (i >= 0) b.bonds.splice(i, 1);
  }
  function unbondAll(a) {
    for (var i = 0; i < a.bonds.length; i++) {
      var b = a.bonds[i], j = b.bonds.indexOf(a);
      if (j >= 0) b.bonds.splice(j, 1);
    }
    a.bonds.length = 0;
  }

  World.prototype.removeKid = function (Hn, k) {
    var i = Hn.kids.indexOf(k);
    if (i >= 0) Hn.kids.splice(i, 1);
    if (Hn.alive && Hn.kids.length < (Hn.level === 1 ? 3 : 2)) this.pending.push(Hn);
  };

  World.prototype.dissolve = function (Hn) {
    if (!Hn.alive) return;
    Hn.alive = false;
    for (var i = 0; i < Hn.kids.length; i++) Hn.kids[i].parent = null;
    unbondAll(Hn);
    if (Hn.parent) this.removeKid(Hn.parent, Hn);
    Hn.parent = null;
    this.acc.collapse[Hn.level]++;
    this.emit('dissolve', Hn.level, Hn.x, Hn.y, Hn.R, Hn.kids.length);
    Hn.kids = [];
  };

  World.prototype.killMote = function (m) {
    if (!m.alive) return;
    m.alive = false;
    unbondAll(m);
    if (m.parent) { this.removeKid(m.parent, m); m.parent = null; }
    var gx = (m.x / CS) | 0, gy = (m.y / CS) | 0;
    var ci = gx + gy * GW;
    var back = 0.08 + (m.E > 0 ? m.E * 0.6 : 0);
    this.F[ci] = Math.min(1.6, this.F[ci] + back);
    this.deaths++;
  };

  // ---- spawning --------------------------------------------------------------
  World.prototype.spawnMote = function (x, y, E) {
    var m = mk(0, this.nextId++), r = this.rand;
    m.x = x; m.y = y; m.E = E; m.meanE = E;
    m.cap = r();
    m.mov = r();
    m.ext = r();
    m.bnd = r();
    m.enc = r();
    m.fis = r();
    m.hue = r();
    m.om = r();
    m.th = r() * 6.2832;
    this.lv[0].push(m);
    return m;
  };

  World.prototype.nucleate = function () {
    // Spontaneous symmetry breaking: a fluctuation of the free-energy field
    // condenses into a body with a maximally uncommitted genome.
    var rate = (this.t < 400 ? 1.6 : 0.15) * this.p.spont;
    var n = Math.floor(rate) + (this.rand() < rate - Math.floor(rate) ? 1 : 0);
    for (var i = 0; i < n; i++) {
      if (this.lv[0].length >= K.maxMotes) return;
      var gx = (this.rand() * GW) | 0, gy = (this.rand() * GH) | 0, ci = gx + gy * GW;
      var f = this.F[ci];
      if (this.rand() > (this.t > 400 ? f * f : f * 3)) continue;
      this.F[ci] = Math.max(0, f - 0.2);
      var m = this.spawnMote((gx + this.rand()) * CS, (gy + this.rand()) * CS, K.Ebirth);
      this.tot.nucleated++;
      if (this.lv[0].length === 1) this.milestone('life', 0, 0, 'First mote condenses out of the field');
      if (m && this.t < 3) m.th = 0;
    }
  };

  // ---- fields ----------------------------------------------------------------
  World.prototype.stepFields = function () {
    var F = this.F, t = this.t, p = this.p;
    var x, y, i, inflow = this.inflow;
    // slow travelling modulation of the energy supply (weather)
    if ((t & 63) === 1) {
      var ph = t * 0.00035, wt = this.weather;
      for (y = 0; y < GH; y++) {
        var wy = Math.sin(y * 0.071 + ph * 1.3) * 0.5, c2 = Math.cos(y * 0.052 + ph * 0.7);
        for (x = 0; x < GW; x++) wt[x + y * GW] = 1 + 0.32 * (Math.sin(x * 0.043 - ph) * c2 + wy * Math.sin(x * 0.021 + ph * 0.5));
      }
    }
    // total structure, its response, and the energy it captures
    if ((t & 3) === 1) {
      var St = this.Stot, A = this.A, Sg = this.Sig, wt2 = this.weather;
      var S0b = this.S[0], S1 = this.S[1], S2 = this.S[2], S3 = this.S[3], S4 = this.S[4];
      var sun = K.sun * p.sun, kap = K.kappa, iks = 1 / K.ks, top = this.top | 0;
      for (y = 0; y < GH; y++) {
        for (x = 0; x < GW; x++) {
          i = x + y * GW;
          var s = S0b[i];
          if (top >= 1) {
            s += S1[(x >> 1) + (y >> 1) * (GW >> 1)];
            if (top >= 2) s += S2[(x >> 2) + (y >> 2) * (GW >> 2)] + S3[(x >> 3) + (y >> 3) * (GW >> 3)] + S4[(x >> 4) + (y >> 4) * (GW >> 4)];
          }
          St[i] = s;
          var sg = 0;
          if (s > 1e-5) { var xs = s * iks; sg = xs / (xs + 1); }
          Sg[i] = sg;
          inflow[i] = sun * wt2[i] * (1 + kap * sg);
          A[i] = F[i] * (1 + 0.8 * sg);
        }
      }
    }
    var n = GW * GH;
    for (i = 0; i < n; i++) { var f = F[i]; if (f < 1) F[i] = f + inflow[i] * (1 - f); else F[i] = f * 0.995; }
    // free energy diffuses: dense bodies act as sinks that drain a catchment
    var d = 0.2, row = this._row || (this._row = new Float32Array(GW)), prev = this._prev || (this._prev = new Float32Array(GW));
    for (x = 0; x < GW; x++) prev[x] = F[x];
    for (y = 1; y < GH - 1; y++) {
      var o = y * GW;
      for (x = 0; x < GW; x++) row[x] = F[o + x];
      for (x = 1; x < GW - 1; x++) {
        i = o + x;
        F[i] = row[x] + d * ((row[x - 1] + row[x + 1] + prev[x] + F[i + GW]) * 0.25 - row[x]) * 4 * 0.25;
      }
      var tmp = prev; prev = row; row = tmp;
    }
    this._row = row; this._prev = prev;
    // structure decays: this is the entropy every level builds against
    if ((t & 1) === 0) {
      var lost = 0;
      for (var L = 0; L <= MAXL; L++) {
        if (L > 0 && this.lv[L].length === 0 && (t & 31) !== 0) continue;
        var S = this.S[L], k = 1 - 2 * K.decay * p.entropy * Math.pow(K.decayLevel, L), area = 1 << (2 * L);
        if (k < 0) k = 0;
        var sum = 0;
        for (i = 0; i < S.length; i++) { var v = S[i]; if (v > 1e-5) { sum += v; S[i] = v * k; } else if (v !== 0) S[i] = 0; }
        lost += sum * (1 - k) * area;
      }
      this.structLost = lost;
    }
    // level-0 structure spreads slightly so neighbours share it
    if ((t & 7) === 0) {
      var S0 = this.S[0];
      for (y = 1; y < GH - 1; y++) {
        for (x = 1; x < GW - 1; x++) {
          i = x + y * GW;
          var c = S0[i], nb = S0[i - 1] + S0[i + 1] + S0[i - GW] + S0[i + GW];
          if (c > 0 || nb > 0) S0[i] = c + 0.10 * (nb * 0.25 - c);
        }
      }
    }
  };

  function hillf(s) { if (s <= 0) return 0; var x = s / K.ks; return x / (x + 1); }

  // ---- the tick --------------------------------------------------------------
  World.prototype.step = function () {
    var p = this.p, rand = this.rand, lv = this.lv, acc = this.acc;
    var motes = lv[0], i, j, L, a, b, n, dx, dy, d2, d, f;
    this.t++;
    acc.ticks++;

    this.stepFields();
    this.nucleate();

    // (C) geometry of higher holons, bottom-up
    var top = 0;
    for (L = 1; L <= MAXL; L++) {
      var arr = lv[L];
      if (arr.length) top = L;
      for (i = 0; i < arr.length; i++) {
        var Hn = arr[i], kids = Hn.kids, sx = 0, sy = 0, sm = 0, se = 0, si = 0, sr = 0;
        for (j = 0; j < kids.length; j++) {
          var kd = kids[j], w = kd.mass;
          sx += kd.x * w; sy += kd.y * w; sm += w; se += kd.meanE * w; si += kd.inc * w; sr += kd.R * kd.R;
        }
        if (sm > 0) { Hn.x = sx / sm; Hn.y = sy / sm; Hn.meanE = se / sm; Hn.inc = si / sm; }
        Hn.mass = sm; Hn.E = se;
        Hn.R = L === 1 ? 3.4 * Math.sqrt(kids.length) + 3 : 1.08 * Math.sqrt(sr) + 4;
        Hn.fx = 0; Hn.fy = 0; Hn.dE = 0; Hn.age++;
      }
    }
    this.top = top;

    // (D) spatial hash for motes
    var head = this.hashHead, next = this.hashNext;
    head.fill(-1);
    n = motes.length;
    var A = this.A, noise = 0.05 * (0.4 + 0.6 * p.entropy);
    for (i = 0; i < n; i++) {
      a = motes[i];
      var hx = (a.x / HC) | 0, hy = (a.y / HC) | 0, hi = hx + hy * HW;
      next[i] = head[hi]; head[hi] = i;
      a.hx = hx; a.hy = hy;
      // self-propulsion up the attractiveness gradient
      var gx = (a.x / CS) | 0, gy = (a.y / CS) | 0;
      var ci = gx + gy * GW;
      a.ci = ci;
      var gxm = gx > 0 ? ci - 1 : ci, gxp = gx < GW - 1 ? ci + 1 : ci;
      var gym = gy > 0 ? ci - GW : ci, gyp = gy < GH - 1 ? ci + GW : ci;
      var grx = A[gxp] - A[gxm], gry = A[gyp] - A[gym];
      var gm = Math.sqrt(grx * grx + gry * gry);
      var prop = a.mov * (a.parent ? 0.035 : 0.11);
      if (gm > 1e-4) { var gk = prop * Math.min(1, gm * 8) / gm; a.fx = grx * gk; a.fy = gry * gk; }
      else { a.fx = 0; a.fy = 0; }
      a.fx += (rand() - 0.5) * 2 * noise;
      a.fy += (rand() - 0.5) * 2 * noise;
      a.dE = 0; a.dth = 0; a.cosAcc = 0;
      a.sn = Math.sin(a.th); a.cs = Math.cos(a.th);
    }

    // (E) pair interactions: exclusion + bond formation (half-shell traversal)
    var S0 = this.S[0], allowBond = p.allowBond, tryBond = (this.t & 1) === 0;
    for (i = 0; i < n; i++) {
      a = motes[i];
      var ax = a.x, ay = a.y, ap = a.parent, ahx = a.hx, ahy = a.hy;
      for (var nb = 0; nb < 5; nb++) {
        if (nb === 0) j = next[i];
        else {
          var cx = ahx + (nb === 1 ? 1 : nb === 2 ? -1 : nb === 3 ? 0 : 1), cy = ahy + (nb === 1 ? 0 : 1);
          if (cx < 0 || cx >= HW || cy >= HH) continue;
          j = head[cx + cy * HW];
        }
        while (j >= 0) {
          b = motes[j];
          dx = b.x - ax; dy = b.y - ay; d2 = dx * dx + dy * dy;
          if (d2 < 121) {
            var same = ap === b.parent;
            var dmin = same ? 6.4 : 10.5;
            d = Math.sqrt(d2) + 1e-6;
            if (d < dmin) {
              f = 0.16 * (dmin - d) / d;
              a.fx -= dx * f; a.fy -= dy * f; b.fx += dx * f; b.fy += dy * f;
            }
            if (tryBond && same && a.bonds.length < 5 && b.bonds.length < 5) {
              var pr;
              if (ap) pr = 0.06;
              else if (allowBond) {
                var hd = hueDist(a.hue, b.hue) / 0.14;
                pr = 0.14 * a.bnd * b.bnd * Math.exp(-hd * hd) * (0.06 + 0.94 * hillf(S0[a.ci] * 1.5));
              } else pr = 0;
              if (pr > 0 && rand() < pr && !bonded(a, b)) bond(a, b);
            }
          }
          j = next[j];
        }
      }
    }

    // (F) bonds at every level: springs, phase coupling, energy sharing
    var pBreak = 0.0005 * p.entropy;
    for (L = 0; L <= top; L++) {
      var arrL = lv[L], ks = L === 0 ? 0.045 : 0.022;
      for (i = 0; i < arrL.length; i++) {
        a = arrL[i];
        if (L > 0) { a.dth = 0; a.cosAcc = 0; a.sn = Math.sin(a.th); a.cs = Math.cos(a.th); }
      }
      for (i = 0; i < arrL.length; i++) {
        a = arrL[i];
        var bl = a.bonds;
        for (j = bl.length - 1; j >= 0; j--) {
          b = bl[j];
          if (b.id < a.id) continue;
          dx = b.x - a.x; dy = b.y - a.y; d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
          var rest = L === 0 ? L0 : (a.R + b.R) * 0.94;
          var free = !a.parent;
          if (d > rest * 2.4 + 6 || (free && (rand() < pBreak || !allowBond)) || a.parent !== b.parent) { unbond(a, b); continue; }
          f = ks * (d - rest) / d;
          if (f > 0.3) f = 0.3;
          a.fx += dx * f; a.fy += dy * f; b.fx -= dx * f; b.fy -= dy * f;
          var sn = b.sn * a.cs - b.cs * a.sn, cs = b.cs * a.cs + b.sn * a.sn;
          var kc = 0.035 * (0.3 + 0.7 * (a.bnd + b.bnd) * 0.5);
          a.dth += kc * sn; b.dth -= kc * sn; a.cosAcc += cs; b.cosAcc += cs;
          if (L === 0) { var q = 0.02 * (b.E - a.E); a.E += q; b.E -= q; }
          else {
            var T = 0.012 * (b.meanE - a.meanE) * Math.min(a.mass, b.mass);
            a.dE += T / a.mass; b.dE -= T / b.mass;
          }
        }
      }
    }

    // (G) higher holons: exclusion, peer bonding, confinement, motility, upkeep
    var P = p.persist, F = this.F;
    var hh = this._hh || (this._hh = new Int32Array(4096)), hnx = this._hn || (this._hn = new Int32Array(1024));
    for (L = 1; L <= top; L++) {
      var hs = lv[L], nh = hs.length, SL = this.S[L], gw = GW >> L, gh = GH >> L, cs2 = CS * (1 << L);
      if (!nh) continue;
      var consK = K.ccons * Math.pow(K.consLevel, L), slow = 1 / POW17[L];
      var maxR = 0;
      for (i = 0; i < nh; i++) if (hs[i].R > maxR) maxR = hs[i].R;
      var gs = Math.max(40, 2 * maxR + 12), gcols = Math.ceil(W / gs), grows = Math.ceil(H / gs);
      if (hnx.length < nh) hnx = this._hn = new Int32Array(nh * 2);
      for (i = 0; i < gcols * grows; i++) hh[i] = -1;
      for (i = 0; i < nh; i++) {
        a = hs[i];
        var qx = (a.x / gs) | 0, qy = (a.y / gs) | 0;
        if (qx >= gcols) qx = gcols - 1; if (qy >= grows) qy = grows - 1;
        a.hx = qx; a.hy = qy;
        hnx[i] = hh[qx + qy * gcols]; hh[qx + qy * gcols] = i;
      }
      for (i = 0; i < nh; i++) {
        a = hs[i];
        var bx0 = a.hx > 0 ? a.hx - 1 : 0, bx1 = a.hx < gcols - 1 ? a.hx + 1 : gcols - 1;
        var by0 = a.hy > 0 ? a.hy - 1 : 0, by1 = a.hy < grows - 1 ? a.hy + 1 : grows - 1;
        for (var by = by0; by <= by1; by++) for (var bx = bx0; bx <= bx1; bx++) {
          j = hh[bx + by * gcols];
          while (j >= 0) {
            if (j > i) {
              b = hs[j];
              dx = b.x - a.x; dy = b.y - a.y;
              var rr = a.R + b.R + 3;
              d2 = dx * dx + dy * dy;
              if (d2 < (rr + 6) * (rr + 6)) {
                d = Math.sqrt(d2) + 1e-6;
                if (d < rr) {
                  f = 0.05 * (rr - d) / d;
                  a.fx -= dx * f; a.fy -= dy * f; b.fx += dx * f; b.fy += dy * f;
                }
                if (a.parent === b.parent && a.bonds.length < 4 && b.bonds.length < 4) {
                  var pb;
                  if (a.parent) pb = 0.03;
                  else if (allowBond) {
                    var mx = ((a.x + b.x) * 0.5 / cs2) | 0, my = ((a.y + b.y) * 0.5 / cs2) | 0;
                    if (mx >= gw) mx = gw - 1; if (my >= gh) my = gh - 1;
                    var hd2 = hueDist(a.hue, b.hue) / 0.16;
                    pb = 0.09 * slow * a.bnd * b.bnd * Math.exp(-hd2 * hd2) * (0.04 + 0.96 * hillf(SL[mx + my * gw]));
                  } else pb = 0;
                  if (pb > 0 && rand() < pb && !bonded(a, b)) bond(a, b);
                }
              }
            }
            j = hnx[j];
          }
        }
        // confinement of kids inside the membrane
        var kids2 = a.kids, RR = a.R;
        for (j = 0; j < kids2.length; j++) {
          var kk = kids2[j];
          dx = a.x - kk.x; dy = a.y - kk.y; d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
          var ex = d + kk.R * 0.6 - RR;
          if (ex > 0) { f = Math.min(0.5, 0.09 * ex) / d; kk.fx += dx * f; kk.fy += dy * f; }
        }
        // motility of the whole body
        var cgx = (a.x / CS) | 0, cgy = (a.y / CS) | 0, off = Math.max(1, (a.R / CS) | 0);
        var xa = Math.max(0, cgx - off), xb = Math.min(GW - 1, cgx + off), ya = Math.max(0, cgy - off), yb = Math.min(GH - 1, cgy + off);
        var g1 = A[xb + cgy * GW] - A[xa + cgy * GW], g2 = A[cgx + yb * GW] - A[cgx + ya * GW];
        var gmm = Math.sqrt(g1 * g1 + g2 * g2);
        if (gmm > 1e-4) { var gkk = 0.045 * a.mov * Math.min(1, gmm * 6) / gmm; a.fx += g1 * gkk; a.fy += g2 * gkk; }
        // embodied capacity at this level: the membrane itself collects energy
        // from a ring just outside the body and feeds everything inside
        var M = a.mass;
        if (M > 0) {
          var ringR = a.R * 1.15 + 4, npts = Math.max(6, Math.min(32, Math.round(ringR * 0.42)));
          var bodyH = 0.2 + 0.8 * a.cap, got = 0, a0 = (this.t * 5 + a.id * 7) & 63, stepA = RING / npts;
          for (j = 0; j < npts; j++) {
            var ai = (a0 + ((j * stepA) | 0)) & 63;
            var rxp = ((a.x + RCOS[ai] * ringR) / CS) | 0, ryp = ((a.y + RSIN[ai] * ringR) / CS) | 0;
            if (rxp < 0 || ryp < 0 || rxp >= GW || ryp >= GH) continue;
            var rc = rxp + ryp * GW, fv = F[rc], tk = K.hrim * fv * bodyH;
            F[rc] = fv - tk; got += tk;
          }
          a.dE += got / M;
          acc.influx += got; acc.intakeAll[0] += got; acc.intakeBody += got; acc.rim[L] += got;
        }
        // coordination state
        var deg = a.bonds.length;
        var target = deg ? Math.min(1, deg / 2) * (0.5 + 0.5 * a.cosAcc / deg) : 0;
        a.coord += 0.08 * (target - a.coord);
        a.th += 0.06 * (0.85 + 0.3 * a.om) * slow + a.dth + (rand() - 0.5) * 0.02 * p.entropy;
        // upkeep, levied on every mote inside
        if (M > 0) {
          var cons = a.coalN > 1 && !a.parent ? consK * Math.pow(a.coalN - 1, p.beta) * M : 0;
          var dep = p.allowExt ? a.ext * K.depH * M : 0;
          if (a.meanE < 0.25) dep = 0;
          var cost = P * (K.cmem * Math.sqrt(M) + K.chub * M * (L === 1 ? 1 : 0.6) + K.mcap * 0.25 * a.cap * M) + cons + K.cbond * deg * M * 0.3 + K.mmov * a.mov * M * 0.25;
          a.dE -= (cost + dep) / M;
          a.stress = cons / (M * (a.inc + 1e-4));
          acc.diss += cost + dep;
          if (dep > 0) {
            // bilinear splat into this level's structure field
            var fxp = a.x / cs2 - 0.5, fyp = a.y / cs2 - 0.5;
            var ix = Math.floor(fxp), iy = Math.floor(fyp), tx = fxp - ix, ty = fyp - iy;
            var dens = dep * (1 + K.synergy * a.coord) / (1 << (2 * L));
            for (var oy = 0; oy < 2; oy++) for (var ox = 0; ox < 2; ox++) {
              var px = ix + ox, py = iy + oy;
              if (px < 0) px = 0; if (py < 0) py = 0; if (px >= gw) px = gw - 1; if (py >= gh) py = gh - 1;
              SL[px + py * gw] += dens * (ox ? tx : 1 - tx) * (oy ? ty : 1 - ty);
            }
          }
        }
      }
    }

    // (H) push forces and energy adjustments down the hierarchy
    for (L = top; L >= 1; L--) {
      var hsd = lv[L], eq = L === 1 ? 0.06 : 0.03;
      for (i = 0; i < hsd.length; i++) {
        a = hsd[i];
        var kd2 = a.kids;
        for (j = 0; j < kd2.length; j++) {
          b = kd2[j];
          b.fx += a.fx; b.fy += a.fy;
          b.dE += a.dE + eq * (a.meanE - b.meanE);
        }
      }
    }

    // (I) integrate + metabolise motes
    var S = this.S, hr = K.harvest, kappa = K.kappa, Sig = this.Sig, Stot = this.Stot;
    var pDie = 0.0005 * p.entropy, allowExt = p.allowExt, beta = p.beta;
    var nNow = motes.length, anyDead = false, freeMatter = 0;
    for (i = 0; i < nNow; i++) {
      a = motes[i];
      if (!a.alive) { anyDead = true; continue; }
      a.vx = (a.vx + a.fx) * 0.86; a.vy = (a.vy + a.fy) * 0.86;
      var sp2 = a.vx * a.vx + a.vy * a.vy;
      if (sp2 > 5.3) { var sc = 2.3 / Math.sqrt(sp2); a.vx *= sc; a.vy *= sc; }
      a.x += a.vx; a.y += a.vy;
      if (a.x < 3) { a.x = 3; a.vx = Math.abs(a.vx); } else if (a.x > W - 3) { a.x = W - 3; a.vx = -Math.abs(a.vx); }
      if (a.y < 3) { a.y = 3; a.vy = Math.abs(a.vy); } else if (a.y > H - 3) { a.y = H - 3; a.vy = -Math.abs(a.vy); }
      a.age++;

      var degm = a.bonds.length;
      var tgt = degm ? Math.min(1, degm / 2) * (0.5 + 0.5 * a.cosAcc / degm) : 0;
      a.coord += 0.08 * (tgt - a.coord);
      a.th += 0.06 * (0.85 + 0.3 * a.om) + a.dth + (rand() - 0.5) * 0.03 * p.entropy;

      var gx2 = (a.x / CS) | 0, gy2 = (a.y / CS) | 0, c0 = gx2 + gy2 * GW;
      var par = a.parent, depth = 0, shelter = 1;
      while (par) { depth++; shelter *= (1 - K.shelter); par = par.parent; }
      // embodied harvest of whatever the local field holds
      var body = 0.2 + 0.8 * a.cap;
      var fl = F[c0];
      // structure does part of the harvesting, fully so only for coordinated users
      var sg = Sig[c0], use = K.kharv * sg * (0.45 + 0.55 * a.coord);
      var take = hr * fl * (body + use);
      if (take > 0.6 * fl) take = 0.6 * fl;
      F[c0] = fl - take;
      a.E += take;
      a.inc += 0.03 * (take - a.inc);
      acc.influx += take;
      acc.intakeAll[0] += take;
      // how much of that energy exists only because of externalised structure,
      // and which level built it
      // share that exists because of structure: the cultivated part of the field
      // plus the part of the harvest the structure did for the body
      var cult = kappa * sg / (1 + kappa * sg), hv = use / (body + use);
      var extFrac = 1 - (1 - cult) * (1 - hv);
      acc.intakeBody += take * (1 - extFrac);
      if (depth >= 1) acc.intakeAll[1] += take;
      if (depth >= 2) acc.intakeAll[2] += take;
      if (depth >= 3) acc.intakeAll[3] += take;
      if (depth >= 4) acc.intakeAll[4] += take;
      if (extFrac > 0) {
        var stot = Stot[c0] + 1e-9, et = take * extFrac / stot;
        acc.intakeExt[0] += et * S[0][c0];
        if (top >= 1 && depth >= 1) acc.intakeExt[1] += et * S[1][(gx2 >> 1) + (gy2 >> 1) * (GW >> 1)];
        if (top >= 2 && depth >= 2) acc.intakeExt[2] += et * S[2][(gx2 >> 2) + (gy2 >> 2) * (GW >> 2)];
        if (top >= 3 && depth >= 3) acc.intakeExt[3] += et * S[3][(gx2 >> 3) + (gy2 >> 3) * (GW >> 3)];
        if (top >= 4 && depth >= 4) acc.intakeExt[4] += et * S[4][(gx2 >> 4) + (gy2 >> 4) * (GW >> 4)];
      }

      var cons0 = a.coalN > 1 && depth === 0 ? K.ccons * Math.pow(a.coalN - 1, beta) : 0;
      var cost0 = P * (K.m0 * shelter + K.mcap * a.cap) + K.mmov * a.mov * (depth ? 0.3 : 1) + (depth ? 0 : K.cbond * degm) + cons0;
      a.stress = cons0 / (a.inc + 1e-4);
      var dep0 = 0;
      if (allowExt && a.E > 0.3) {
        // coordinated builders get more structure out of the same energy
        dep0 = a.ext * K.dep0; S[0][c0] += dep0 * (1 + K.synergy * a.coord);
      }
      a.E += a.dE - cost0 - dep0;
      acc.diss += cost0 + dep0;
      a.meanE = a.E;

      if (a.E <= 0 || rand() < pDie * shelter * (1 + (a.age * a.age) / 4e5)) { this.killMote(a); anyDead = true; continue; }

      if (a.E > K.Emax) { acc.diss += a.E - K.Emax; a.E = K.Emax; a.meanE = a.E; }
      if (a.E >= K.Erep && motes.length < K.maxMotes && rand() < (freeMatter = K.matter - motes.length) / (freeMatter + 250)) {
        var c = mk(0, this.nextId++);
        this.mutateInto(c, a);
        var ang = rand() * 6.2832;
        c.x = Math.min(W - 3, Math.max(3, a.x + Math.cos(ang) * 4));
        c.y = Math.min(H - 3, Math.max(3, a.y + Math.sin(ang) * 4));
        c.E = K.Ebirth; c.meanE = c.E; c.th = a.th; c.gen = a.gen + 1; c.inc = a.inc; c.coord = a.coord * 0.5;
        a.E -= K.Ebirth + K.Erepcost; a.meanE = a.E;
        acc.diss += K.Erepcost;
        if (a.parent) { c.parent = a.parent; a.parent.kids.push(c); if (a.bonds.length < 5) bond(a, c); }
        else if (allowBond && a.bonds.length < 5 && rand() < a.bnd * (0.1 + 0.9 * hillf(S[0][c0] * 1.5))) { bond(a, c); c.coalN = a.coalN; }
        motes.push(c);
        this.births++;
      }
    }

    // (J) structural bookkeeping
    while (this.pending.length) this.dissolve(this.pending.pop());
    if (anyDead) this._compact(0);
    for (L = 1; L <= MAXL; L++) {
      var hl = lv[L], dead = false, cnt = hl.length;
      for (i = 0; i < cnt; i++) {
        a = hl[i];
        if (!a.alive) { dead = true; continue; }
        var nf = L === 1 ? 9 + 14 * a.fis : 5 + 6 * a.fis;
        if (a.kids.length >= nf && this.t - a.lastFis > 40) this.fission(a);
      }
      while (this.pending.length) { this.dissolve(this.pending.pop()); dead = true; }
      if (dead) this._compact(L);
    }
    for (L = 1; L <= MAXL; L++) { var chk = lv[L]; for (i = 0; i < chk.length; i++) if (!chk[i].alive) { this._compact(L); break; } }

    if ((this.t & 7) === 0) this.coalitions();
    if ((this.t & 31) === 0) this.computeStats();
    if (this.t % this.histStride === 0) { this.orderSpectrum(); this.sample(); }
  };

  World.prototype._compact = function (L) {
    var arr = this.lv[L], k = 0;
    for (var i = 0; i < arr.length; i++) if (arr[i].alive) arr[k++] = arr[i];
    arr.length = k;
  };

  // ---- fission: a holon reproduces as a whole ---------------------------------
  World.prototype.fission = function (Hn) {
    var kids = Hn.kids, n = kids.length, i, k;
    var mx = 0, my = 0;
    for (i = 0; i < n; i++) { mx += kids[i].x; my += kids[i].y; }
    mx /= n; my /= n;
    var sxx = 0, syy = 0, sxy = 0;
    for (i = 0; i < n; i++) { var dx = kids[i].x - mx, dy = kids[i].y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    var ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(ang), uy = Math.sin(ang);
    var proj = [];
    for (i = 0; i < n; i++) proj.push({ k: kids[i], v: (kids[i].x - mx) * ux + (kids[i].y - my) * uy });
    proj.sort(function (p, q) { return p.v - q.v; });
    var half = n >> 1;
    var H2 = mk(Hn.level, this.nextId++);
    this.mutateInto(H2, Hn);
    H2.th = Hn.th; H2.gen = Hn.gen + 1; H2.coord = Hn.coord * 0.5; H2.lastFis = this.t; Hn.lastFis = this.t;
    H2.x = Hn.x; H2.y = Hn.y; H2.R = Hn.R * 0.7; H2.inc = Hn.inc; H2.meanE = Hn.meanE;
    Hn.kids = [];
    var sx = 0, sy = 0, sm = 0;
    for (i = 0; i < n; i++) {
      k = proj[i].k;
      if (i < half) Hn.kids.push(k);
      else { H2.kids.push(k); k.parent = H2; sx += k.x * k.mass; sy += k.y * k.mass; sm += k.mass; }
    }
    H2.mass = sm; if (sm > 0) { H2.x = sx / sm; H2.y = sy / sm; }
    for (i = 0; i < H2.kids.length; i++) {
      k = H2.kids[i];
      for (var j = k.bonds.length - 1; j >= 0; j--) if (k.bonds[j].parent !== H2) unbond(k, k.bonds[j]);
    }
    H2.parent = Hn.parent;
    if (Hn.parent) { Hn.parent.kids.push(H2); if (Hn.bonds.length < 4) bond(Hn, H2); }
    else if (this.p.allowBond && Hn.bonds.length < 4) {
      var L = Hn.level, gw = GW >> L, gh = GH >> L, cs2 = CS * (1 << L);
      var cx = Math.min(gw - 1, (Hn.x / cs2) | 0), cy = Math.min(gh - 1, (Hn.y / cs2) | 0);
      if (this.rand() < Hn.bnd * (0.1 + 0.9 * hillf(this.S[L][cx + cy * gw] * 1.5))) { bond(Hn, H2); H2.coalN = Hn.coalN; }
    }
    this.lv[Hn.level].push(H2);
    this.acc.fission[Hn.level]++;
    this.emit('fission', Hn.level, Hn.x, Hn.y, Hn.R, n);
  };

  // ---- coalitions, scaling crisis, transcendence -------------------------------
  World.prototype.coalitions = function () {
    var p = this.p, rand = this.rand, stamp = this.t, acc = this.acc;
    for (var L = 0; L <= this.top && L <= MAXL; L++) {
      var arr = this.lv[L], out = this.coals[L];
      out.length = 0;
      var nmin = L === 0 ? 6 : L === 1 ? 4 : L === 2 ? 4 : 3;
      var todo = [];
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i];
        if (s.parent) { s.coalN = 1; s.crisis = false; continue; }
        if (s.mark === stamp) continue;
        if (s.bonds.length === 0) { s.coalN = 1; s.crisis = false; s.mark = stamp; continue; }
        // flood the component
        var comp = [s], q = 0; s.mark = stamp;
        while (q < comp.length) {
          var c = comp[q++];
          for (var j = 0; j < c.bonds.length; j++) { var o = c.bonds[j]; if (o.mark !== stamp && o.alive) { o.mark = stamp; comp.push(o); } }
        }
        var n = comp.length, sx = 0, sy = 0, cr = 0, sr = 0, st = 0, enc = 0, me = 0, mass = 0;
        for (j = 0; j < n; j++) {
          c = comp[j];
          sx += c.x; sy += c.y; cr += Math.cos(c.th); sr += Math.sin(c.th);
          st += c.stress * c.mass; enc += c.enc; me += c.meanE * c.mass; mass += c.mass;
        }
        var cxm = sx / n, cym = sy / n, coh = Math.sqrt(cr * cr + sr * sr) / n;
        var stress = st / mass;
        var crisis = n >= nmin && stress > K.stressT;
        var rad = 0;
        for (j = 0; j < n; j++) {
          c = comp[j]; c.coalN = n; c.crisis = crisis;
          var ddx = c.x - cxm, ddy = c.y - cym, dd = Math.sqrt(ddx * ddx + ddy * ddy) + c.R;
          if (dd > rad) rad = dd;
        }
        acc.freeBonded[L] += n;
        if (n >= 3) out.push({ x: cxm, y: cym, r: rad + 4, n: n, stress: stress, crisis: crisis, coh: coh });
        if (crisis) {
          acc.crisis[L] += n;
          this.milestone('s3l' + L, L, 3, LEVEL_NAMES[L] + ' coalitions hit a scaling crisis');
          var encM = enc / n;
          var canT = p.allowEnc && L < p.maxLevel && L < MAXL && me / mass > K.build + 0.22;
          if (canT && rand() < encM * encM * (0.25 + 0.75 * coh * coh) * 0.5 / (1 << L)) todo.push(comp);
          else if (rand() < (0.06 + 0.4 * (stress - K.stressT)) / (1 << L)) {
            // collapse: consensus fails and the coalition fragments
            for (j = 0; j < n; j++) {
              c = comp[j];
              for (var b = c.bonds.length - 1; b >= 0; b--) if (rand() < 0.3) unbond(c, c.bonds[b]);
            }
            acc.collapse[L]++;
            this.emit('collapse', L, cxm, cym, rad, n);
          }
        }
      }
      for (i = 0; i < todo.length; i++) this.transcend(todo[i], L);
    }
  };

  World.prototype.transcend = function (members, L) {
    var Hn = mk(L + 1, this.nextId++), n = members.length, i, m;
    var cap = 0, ext = 0, bnd = 0, enc = 0, mov = 0, fis = 0, om = 0, hc = 0, hs = 0, tc = 0, ts = 0, sx = 0, sy = 0, mass = 0, sr = 0;
    for (i = 0; i < n; i++) {
      m = members[i];
      m.parent = Hn; m.coalN = 1; m.crisis = false; m.stress = 0;
      cap += m.cap; ext += m.ext; bnd += m.bnd; enc += m.enc; mov += m.mov; fis += m.fis; om += m.om;
      hc += Math.cos(m.hue * 6.2832); hs += Math.sin(m.hue * 6.2832);
      tc += Math.cos(m.th); ts += Math.sin(m.th);
      sx += m.x * m.mass; sy += m.y * m.mass; mass += m.mass; sr += m.R * m.R;
      Hn.kids.push(m);
    }
    Hn.cap = cap / n; Hn.ext = ext / n; Hn.bnd = bnd / n; Hn.enc = enc / n; Hn.mov = mov / n; Hn.fis = fis / n; Hn.om = om / n;
    var hh = Math.atan2(hs, hc) / 6.2832; Hn.hue = hh < 0 ? hh + 1 : hh;
    Hn.th = Math.atan2(ts, tc);
    Hn.x = sx / mass; Hn.y = sy / mass; Hn.mass = mass;
    Hn.R = L === 0 ? 3.4 * Math.sqrt(n) + 3 : 1.08 * Math.sqrt(sr) + 4;
    Hn.lastFis = this.t; Hn.flash = 1;
    this._levy(Hn, K.build);
    this.acc.diss += K.build * mass;
    this.lv[L + 1].push(Hn);
    if (L + 1 > this.top) this.top = L + 1;
    this.acc.transcend[L]++;
    this.emit('transcend', L + 1, Hn.x, Hn.y, Hn.R, n);
    this.milestone('s4l' + L, L, 4, n + ' ' + LEVEL_PLURAL[L].toLowerCase() + ' close a membrane: first ' + LEVEL_NAMES[L + 1]);
  };

  World.prototype._levy = function (h, perMote) {
    if (h.level === 0) { h.E -= perMote; h.meanE = h.E; return; }
    for (var i = 0; i < h.kids.length; i++) this._levy(h.kids[i], perMote);
  };

  // ---- measurement -------------------------------------------------------------
  World.prototype.computeStats = function () {
    var st = this.stats, acc = this.acc, lv = this.lv, L, i, a;
    var ticks = Math.max(1, acc.ticks);
    st.influx = acc.influx / ticks; st.diss = acc.diss / ticks;
    st.transcends = 0; st.collapses = 0;
    var motes = lv[0], n0 = motes.length;
    var cap = 0, ext = 0, bnd = 0, enc = 0, mov = 0, stored = 0, depthSum = 0;
    for (L = 0; L <= MAXL; L++) st.massTop[L] = 0;
    var hb = new Uint8Array(48), lin = 0;
    for (i = 0; i < n0; i++) {
      a = motes[i];
      cap += a.cap; ext += a.ext; bnd += a.bnd; enc += a.enc; mov += a.mov; stored += a.E;
      var d = 0, pp = a.parent; while (pp) { d++; pp = pp.parent; }
      st.massTop[d]++; depthSum += d;
      var hbin = (a.hue * 48) | 0; if (!hb[hbin]) { hb[hbin] = 1; lin++; }
    }
    var inv = n0 ? 1 / n0 : 0;
    st.traits.cap = cap * inv; st.traits.ext = ext * inv; st.traits.bnd = bnd * inv; st.traits.enc = enc * inv; st.traits.mov = mov * inv;
    st.stored = stored; st.meanDepth = depthSum * inv; st.lineages = lin;
    // selection as information: how far the trait distribution has moved from
    // the uniform genome every mote is born with (bits per mote, 5 traits)
    var gb = 0;
    if (n0 > 50) {
      var hist = this._gh || (this._gh = new Float64Array(5 * 16)), t5, b16;
      hist.fill(0);
      for (i = 0; i < n0; i++) {
        a = motes[i];
        hist[Math.min(15, (a.cap * 16) | 0)]++; hist[16 + Math.min(15, (a.ext * 16) | 0)]++;
        hist[32 + Math.min(15, (a.bnd * 16) | 0)]++; hist[48 + Math.min(15, (a.enc * 16) | 0)]++;
        hist[64 + Math.min(15, (a.mov * 16) | 0)]++;
      }
      for (t5 = 0; t5 < 5; t5++) {
        var hsum = 0;
        for (b16 = 0; b16 < 16; b16++) { var pv = hist[t5 * 16 + b16] / n0; if (pv > 0) hsum -= pv * Math.log(pv); }
        gb += (Math.log(16) - hsum) / LN2;
      }
    }
    st.genomeBits = gb;
    var structure = 0;
    for (L = 0; L <= MAXL; L++) { var S = this.S[L], sum = 0; for (i = 0; i < S.length; i++) sum += S[i]; structure += sum * (1 << (2 * L)); }
    st.structure = structure;
    var totalIn = acc.intakeAll[0];
    st.bodyShare = totalIn > 0 ? acc.intakeBody / totalIn : 1;
    st.extShare = 1 - st.bodyShare;

    var top = 0;
    for (L = 0; L <= MAXL; L++) {
      var arr = lv[L], n = arr.length;
      st.n[L] = n;
      if (n) top = L;
      var bondedN = 0, cohS = 0;
      for (i = 0; i < n; i++) { a = arr[i]; if (a.bonds.length) { bondedN++; cohS += a.coord; } }
      st.bonded[L] = n ? bondedN / n : 0;
      st.coh[L] = bondedN ? cohS / bondedN : 0;
      st.transcends += acc.transcend[L]; st.collapses += acc.collapse[L];
    }
    st.topLevel = top;
    for (L = 0; L <= MAXL; L++) {
      var sg = st.stage[L], rc = st.reached[L];
      n = st.n[L];
      var ref = L === 0 ? 300 : L === 1 ? 40 : L === 2 ? 8 : 3;
      sg[0] = n ? Math.min(1, 0.25 + 0.75 * n / ref) : 0;
      var share = acc.intakeAll[L] > 0 ? acc.intakeExt[L] / acc.intakeAll[L] : 0;
      sg[1] = n ? Math.min(1, share / 0.3) : 0;
      sg[2] = n ? Math.min(1, st.bonded[L] * st.coh[L] / 0.6) : 0;
      var cr = acc.freeBonded[L] > 0 ? acc.crisis[L] / acc.freeBonded[L] : 0;
      sg[3] = n ? Math.max(sg[3] * 0.9, Math.min(1, cr * 2.5)) : 0;
      if (sg[3] < 0.01) sg[3] = 0;
      var inside = 0;
      if (L < MAXL && n) { arr = lv[L]; for (i = 0; i < n; i++) if (arr[i].parent) inside++; sg[4] = inside / n; } else sg[4] = 0;
      rc[0] = n > 0; rc[1] = share > 0.2; rc[2] = st.bonded[L] * st.coh[L] > 0.15; rc[3] = sg[3] > 0.02; rc[4] = L < MAXL && st.n[L + 1] > 0;
      if (rc[1]) this.milestone('s1l' + L, L, 1, LEVEL_PLURAL[L] + ' externalise: structure now feeds them');
      if (rc[2]) this.milestone('s2l' + L, L, 2, LEVEL_PLURAL[L] + ' coordinate through shared structure');
    }
    for (L = 0; L <= MAXL; L++) {
      sg = st.stage[L]; rc = st.reached[L];
      if (L < MAXL && st.n[L + 1] > 0) {
        sg[5] = Math.max(st.stage[L + 1][1], st.stage[L + 1][2]);
        rc[5] = st.reached[L + 1][1] || st.reached[L + 1][2];
        if (rc[5]) this.milestone('s5l' + L, L, 5, 'The ladder recurses: ' + LEVEL_PLURAL[L + 1] + ' begin the climb again');
      } else { sg[5] = 0; rc[5] = false; }
    }
    var tot = this.tot, rim = 0, memAge = 0, memN = 0;
    for (L = 0; L <= MAXL; L++) {
      tot.fission[L] += acc.fission[L]; tot.transcend[L] += acc.transcend[L]; tot.collapse[L] += acc.collapse[L]; rim += acc.rim[L];
      arr = lv[L]; var ag = 0, mg = 0;
      for (i = 0; i < arr.length; i++) { a = arr[i]; ag += a.age; if (a.gen > mg) mg = a.gen; if (L === 0 && a.parent) { memAge += a.age; memN++; } }
      st.meanAge[L] = arr.length ? ag / arr.length : 0; st.maxGen[L] = mg;
    }
    tot.rim += rim; tot.influx += acc.influx;
    st.rimShare = acc.influx > 0 ? rim / acc.influx : 0;
    st.memberAge = memN ? memAge / memN : 0;
    this.acc = this._newAcc();
  };

  /*
   * Steps of the wider chain that this world shows a working analogue of.
   * Each is a measurement, not a claim that the real transition happened this way.
   */
  World.prototype.analogues = function () {
    var st = this.stats, tot = this.tot, N = this.lv[0].length || 1, inside = Math.max(0, this.lv[0].length - st.massTop[0]);
    function pct(v) { return Math.round(v * 100) + '%'; }
    function n(v) { return Math.round(v).toLocaleString('en-US'); }
    var cellsIn = st.n[1] ? st.stage[1][4] : 0, ratio = st.memberAge > 0 ? st.meanAge[1] / st.memberAge : 0;
    return {
      flow: { on: st.influx > 0, text: 'Energy enters every cell of the field each tick; ' + st.influx.toFixed(1) + ' units are captured per tick.' },
      assemble: { on: tot.transcend[0] > 0, text: n(tot.transcend[0]) + ' membranes have closed around coalitions of motes.' },
      accel: { on: st.extShare > 0.2, text: pct(st.extShare) + ' of captured energy exists only because of works the population built.' },
      copy: { on: this.births > 0, text: n(this.births) + ' motes born as mutated copies of a parent.' },
      select: { on: st.genomeBits > 0.15, text: 'Differential reproduction has moved the gene pool ' + st.genomeBits.toFixed(2) + ' bits per mote away from the uniform genome.' },
      retain: { on: inside > 0, text: pct(inside / N) + ' of motes live and cooperate inside a membrane.' },
      uptake: { on: st.rimShare > 0.01, text: 'Membranes collect ' + pct(st.rimShare) + ' of all captured energy from their surroundings.' },
      divide: { on: tot.fission[1] > 0, text: n(tot.fission[1]) + ' Cells have divided, splitting their motes between two descendants.' },
      groupsel: { on: st.maxGen[1] >= 3, text: 'Cell lineages are up to ' + st.maxGen[1] + ' divisions deep, each division copying the Cell\u2019s own genome with mutation.' },
      repair: { on: ratio > 1.5 && st.n[1] > 0, text: 'Cells are on average ' + ratio.toFixed(1) + '× older than the motes inside them: the whole outlives its parts.' },
      descent: { on: st.maxGen[0] >= 5, text: 'The deepest mote lineage is ' + st.maxGen[0] + ' generations long.' },
      adhere: { on: st.n[1] > 0 && st.bonded[1] > 0.05, text: pct(st.bonded[1]) + ' of Cells are bonded to other Cells, many because daughters stayed attached after division.' },
      signal: { on: st.n[1] > 0 && st.bonded[1] * st.coh[1] > 0.15, text: 'Bonded Cells share energy and hold a phase coherence of ' + st.coh[1].toFixed(2) + '.' },
      collsel: { on: tot.fission[2] > 0, text: n(tot.fission[2]) + ' Bodies have reproduced as wholes.' },
      individ: { on: st.n[2] > 0, text: n(st.n[2]) + ' Bodies tax their Cells so none can free-ride; ' + pct(cellsIn) + ' of Cells live inside one.' }
    };
  };

  // Expected value and variance of k*ln(k/lam) under Poisson(lam).
  function poisMoments(lam) {
    if (lam > 60) return [0.5, 0.5]; // chi-square limit: E[2 k ln(k/lam)] -> 1, Var -> 2
    var p = Math.exp(-lam), m1 = 0, m2 = 0, kmax = Math.ceil(lam + 12 * Math.sqrt(lam) + 24);
    for (var k = 1; k <= kmax; k++) {
      p *= lam / k;
      var v = k * Math.log(k / lam);
      m1 += p * v; m2 += p * v * v;
    }
    return [m1, m2 - m1 * m1];
  }

  /*
   * Order spectrum. Relative entropy of the mass distribution against the
   * uniform (maximum-entropy) field obeys a chain rule over a dyadic
   * renormalisation:  D(p_fine || u) = D(p_coarse || u) + E[ D(p_fine|coarse || u) ].
   * Each term is the order that lives at one octave of scale. G = 2N*D is the
   * log-likelihood-ratio statistic; subtracting its exact expectation under a
   * Poisson null gives bits of order an observer at that aperture can actually
   * distinguish from unstructured possibility, with a z-score.
   */
  World.prototype.orderSpectrum = function (pts) {
    var cnt = this.counts, motes = pts || this.lv[0], N = motes.length, i, s;
    var spec = this.spec;
    cnt.fill(0);
    for (i = 0; i < N; i++) {
      var m = motes[i];
      var gx = (m.x / CS) | 0, gy = (m.y / CS) | 0;
      if (gx >= GW) gx = GW - 1; if (gy >= GH) gy = GH - 1;
      cnt[gx + gy * GW]++;
    }
    if (N < 24) { spec.bits.fill(0); spec.z.fill(0); spec.total = 0; spec.perMote = 0; for (s = 0; s < NSCALE; s++) this.blockZ[s].fill(0); return spec; }
    var excess = new Float64Array(NSCALE + 1), vari = new Float64Array(NSCALE + 1);
    var cur = cnt, w = GW, h = GH;
    for (s = 0; s < NSCALE; s++) {
      var B = w * h, lam = N / B, G = 0, bz = this.blockZ[s], sd = Math.sqrt(lam);
      for (i = 0; i < B; i++) { var c = cur[i]; if (c > 0) G += c * Math.log(c / lam); bz[i] = (c - lam) / sd; }
      var mom = poisMoments(lam);
      excess[s] = 2 * G - (2 * B * mom[0] - 1);
      vari[s] = 4 * B * mom[1];
      if (s < NSCALE - 1) {
        var w2 = w >> 1, h2 = h >> 1, nx = new Float64Array(w2 * h2);
        for (var y = 0; y < h2; y++) for (var x = 0; x < w2; x++) {
          var k = 2 * x + 2 * y * w;
          nx[x + y * w2] = cur[k] + cur[k + 1] + cur[k + w] + cur[k + w + 1];
        }
        cur = nx; w = w2; h = h2;
      }
    }
    var total = 0;
    for (s = 0; s < NSCALE; s++) {
      var band = excess[s] - excess[s + 1];
      var v = Math.max(1e-6, vari[s] - vari[s + 1]);
      spec.bits[s] = band / (2 * LN2);
      spec.z[s] = band / Math.sqrt(v);
      total += spec.bits[s];
    }
    spec.total = total; spec.perMote = total / N;
    return spec;
  };

  World.prototype.sample = function () {
    var st = this.stats, sp = this.spec, h = this.history;
    h.push({
      t: this.t, N: this.lv[0].length,
      n: Array.prototype.slice.call(st.n), massTop: Array.prototype.slice.call(st.massTop),
      bits: Array.prototype.slice.call(sp.bits), z: Array.prototype.slice.call(sp.z),
      order: sp.total, influx: st.influx, diss: st.diss, stored: st.stored, structure: st.structure,
      cap: st.traits.cap, ext: st.traits.ext, bnd: st.traits.bnd, enc: st.traits.enc, mov: st.traits.mov,
      extShare: st.extShare, top: st.topLevel, depth: st.meanDepth, genome: st.genomeBits
    });
    if (h.length > 1400) { // halve resolution, keep the whole run
      var out = [];
      for (var i = 0; i < h.length; i += 2) out.push(h[i]);
      this.history = out; this.histStride *= 2;
    }
  };

  // ---- interventions -----------------------------------------------------------
  World.prototype.feed = function (x, y, r, amt) {
    var x0 = Math.max(0, ((x - r) / CS) | 0), x1 = Math.min(GW - 1, ((x + r) / CS) | 0);
    var y0 = Math.max(0, ((y - r) / CS) | 0), y1 = Math.min(GH - 1, ((y + r) / CS) | 0);
    for (var gy = y0; gy <= y1; gy++) for (var gx = x0; gx <= x1; gx++) {
      var dx = (gx + 0.5) * CS - x, dy = (gy + 0.5) * CS - y, d2 = dx * dx + dy * dy;
      if (d2 < r * r) { var i = gx + gy * GW; this.F[i] = Math.min(1.6, this.F[i] + amt * (1 - d2 / (r * r))); }
    }
  };
  World.prototype.burn = function (x, y, r) {
    var motes = this.lv[0], r2 = r * r, i;
    for (i = 0; i < motes.length; i++) { var m = motes[i], dx = m.x - x, dy = m.y - y; if (dx * dx + dy * dy < r2) { m.E = 0; this.killMote(m); } }
    for (var L = 0; L <= MAXL; L++) {
      var cs = CS * (1 << L), gw = GW >> L, gh = GH >> L, S = this.S[L];
      var x0 = Math.max(0, ((x - r) / cs) | 0), x1 = Math.min(gw - 1, ((x + r) / cs) | 0);
      var y0 = Math.max(0, ((y - r) / cs) | 0), y1 = Math.min(gh - 1, ((y + r) / cs) | 0);
      for (var gy = y0; gy <= y1; gy++) for (var gx = x0; gx <= x1; gx++) S[gx + gy * gw] *= 0.1;
    }
    while (this.pending.length) this.dissolve(this.pending.pop());
    for (L = 0; L <= MAXL; L++) this._compact(L);
  };
  World.prototype.extinction = function (frac) {
    var motes = this.lv[0];
    for (var i = 0; i < motes.length; i++) if (this.rand() < frac) { motes[i].E = 0; this.killMote(motes[i]); }
    while (this.pending.length) this.dissolve(this.pending.pop());
    for (var L = 0; L <= MAXL; L++) this._compact(L);
    this.emit('shock', 0, W / 2, H / 2, W, 0);
  };
  World.prototype.storm = function () {
    for (var L = 0; L <= MAXL; L++) { var S = this.S[L]; for (var i = 0; i < S.length; i++) S[i] *= 0.05; }
    for (L = 0; L <= MAXL; L++) {
      var arr = this.lv[L];
      for (i = 0; i < arr.length; i++) { var a = arr[i]; if (a.parent) continue; for (var j = a.bonds.length - 1; j >= 0; j--) if (this.rand() < 0.6) unbond(a, a.bonds[j]); }
    }
    this.emit('shock', 0, W / 2, H / 2, W, 1);
  };

  World.prototype.exportCSV = function () {
    var cols = ['t', 'motes', 'cells', 'bodies', 'colonies', 'biomes', 'top_level', 'mean_depth',
      'order_bits', 'genome_bits_per_mote', 'influx', 'dissipation', 'stored', 'structure', 'ext_share',
      'cap', 'ext', 'bond', 'enc', 'mov'];
    var s;
    for (s = 0; s < NSCALE; s++) cols.push('bits_' + (CS << s) + 'u');
    for (s = 0; s < NSCALE; s++) cols.push('z_' + (CS << s) + 'u');
    var rows = [cols.join(',')];
    for (var i = 0; i < this.history.length; i++) {
      var h = this.history[i];
      var r = [h.t, h.n[0], h.n[1], h.n[2], h.n[3], h.n[4], h.top, h.depth.toFixed(3), h.order.toFixed(1), h.genome.toFixed(3),
        h.influx.toFixed(3), h.diss.toFixed(3), h.stored.toFixed(1), h.structure.toFixed(1), h.extShare.toFixed(3),
        h.cap.toFixed(3), h.ext.toFixed(3), h.bnd.toFixed(3), h.enc.toFixed(3), h.mov.toFixed(3)];
      for (s = 0; s < NSCALE; s++) r.push(h.bits[s].toFixed(1));
      for (s = 0; s < NSCALE; s++) r.push(h.z[s].toFixed(2));
      rows.push(r.join(','));
    }
    return rows.join('\n');
  };

  World.prototype.exportJSON = function () {
    return JSON.stringify({
      simulator: 'Holon Aperture', seed: this.seed, tick: this.t, params: this.p,
      origin: { elements: this.origin.N, relations: this.origin.relations, events: this.origin.events, causal_depth: this.origin.depth, distinguishable: this.origin.singletons, dimension: +this.origin.dim.toFixed(3), radius: this.origin.ecc, assumed: ['correspondence between the relational sheet and the field', 'the energy field and its rules'] },
      milestones: this.milestones, stages: this.stats.stage.map(function (a) { return Array.prototype.slice.call(a); }),
      spectrum: { scale_units: [10, 20, 40, 80, 160, 320, 640], bits: Array.prototype.slice.call(this.spec.bits), z: Array.prototype.slice.call(this.spec.z) },
      history: this.history
    });
  };

  return {
    World: World, Origin: Origin, defaultParams: defaultParams, mulberry32: mulberry32,
    GW: GW, GH: GH, CS: CS, W: W, H: H, MAXL: MAXL, NSCALE: NSCALE, R0: R0,
    LEVEL_NAMES: LEVEL_NAMES, LEVEL_PLURAL: LEVEL_PLURAL, STAGE_NAMES: STAGE_NAMES, K: K
  };
});
