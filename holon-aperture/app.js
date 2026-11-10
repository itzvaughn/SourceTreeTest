/* Holon Aperture — viewport, instruments and controls. */
(function () {
  'use strict';
  var Sim = window.HolonSim;
  var W = Sim.W, H = Sim.H, GW = Sim.GW, GH = Sim.GH, CS = Sim.CS, MAXL = Sim.MAXL, NS = Sim.NSCALE, K = Sim.K;
  var LN = Sim.LEVEL_NAMES, LP = Sim.LEVEL_PLURAL, SN = Sim.STAGE_NAMES;
  var FSTOP = ['f/1.4', 'f/2.8', 'f/5.6', 'f/11', 'f/22'];
  var ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  // brighter tints of the five level hues, for the dark viewport only
  var STAGE_LV = [[106, 165, 245], [53, 201, 152], [240, 178, 58], [238, 122, 163], [171, 157, 245]];
  var DEPTH_LABEL = ['free motes', 'in Cells', 'in Bodies', 'in Colonies', 'in Biomes'];
  var TRAITS = [['cap', 'Capacity'], ['ext', 'Externalising'], ['bnd', 'Bonding'], ['enc', 'Enclosure'], ['mov', 'Motility']];

  function $(id) { return document.getElementById(id); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem('ha.' + k); localStorage.setItem('ha.' + k, v); } catch (e) { return null; } }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- state ---------------------------------------------------------------
  var world, running = true, speed = 1, tps = 0, tickCount = 0, tpsT = performance.now();
  var cam = { x: W / 2, y: H / 2, z: 1, fit: 1 }, cw = 100, ch = 100, dpr = 1;
  var lens = 0, lensTarget = 0, autoLens = true;
  var view = 'life', colorBy = 'lineage', tool = 'inspect';
  var sel = null, follow = false, fx = [], frame = 0;
  var theme = {};

  var canvas = $('view'), ctx = canvas.getContext('2d');
  var fieldCv = document.createElement('canvas'); fieldCv.width = GW; fieldCv.height = GH;
  var fieldCtx = fieldCv.getContext('2d'), fieldImg = fieldCtx.createImageData(GW, GH);
  var ordCv = document.createElement('canvas'), ordCtx = ordCv.getContext('2d');

  // ---- sprites -------------------------------------------------------------
  var HUES = 36, RAMP = 12, sprites = [], spriteCss = [];
  function makeSprite(r, g, b) {
    spriteCss.push('rgb(' + r + ',' + g + ',' + b + ')');
    var c = document.createElement('canvas'); c.width = c.height = 48;
    var x = c.getContext('2d'), gr = x.createRadialGradient(24, 24, 0, 24, 24, 24);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.16, 'rgba(' + r + ',' + g + ',' + b + ',1)');
    gr.addColorStop(0.42, 'rgba(' + r + ',' + g + ',' + b + ',0.32)');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, 48, 48);
    return c;
  }
  function hsl(h, s, l) {
    var a = s * Math.min(l, 1 - l);
    function f(n) { var k = (n + h * 12) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }
    return [f(0), f(8), f(4)];
  }
  (function () {
    var i, c;
    for (i = 0; i < HUES; i++) { c = hsl(i / HUES, 0.82, 0.63); sprites.push(makeSprite(c[0], c[1], c[2])); }
    for (i = 0; i < RAMP; i++) { // one hue, dim to bright: magnitude
      var t = i / (RAMP - 1);
      sprites.push(makeSprite(Math.round(40 + 190 * t), Math.round(70 + 170 * t), Math.round(130 + 125 * t)));
    }
    for (i = 0; i <= MAXL; i++) sprites.push(makeSprite(STAGE_LV[i][0], STAGE_LV[i][1], STAGE_LV[i][2]));
  })();

  // ---- world ---------------------------------------------------------------
  function readParams() {
    return {
      sun: +$('dSun').value, persist: +$('dPersist').value, entropy: +$('dEntropy').value,
      beta: +$('dBeta').value, mut: +$('dMut').value, spont: +$('dSpont').value,
      allowExt: $('kExt').checked, allowBond: $('kBond').checked, allowEnc: $('kEnc').checked, maxLevel: +$('kMax').value
    };
  }
  function newWorld() {
    var seed = parseInt($('seed').value, 10);
    if (!(seed > 0)) { seed = 1 + Math.floor(Math.random() * 99999); $('seed').value = seed; }
    world = new Sim.World(seed, readParams());
    sel = null; follow = false; fx.length = 0; lens = lensTarget = 0;
    $('toasts').textContent = '';
    showInspector();
    histDirty = true;
  }

  // ---- camera --------------------------------------------------------------
  function resize() {
    var r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = Math.max(50, r.width); ch = Math.max(50, r.height);
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    var wasFit = Math.abs(cam.z - cam.fit) < 1e-6;
    cam.fit = Math.min(cw / W, (ch - 96) / H) * 0.97;
    if (wasFit || cam.z < cam.fit) fitView();
  }
  function fitView() { cam.z = cam.fit; cam.x = W / 2; cam.y = H / 2 + 8 / cam.z; follow = false; }
  function toWorld(px, py) { return [cam.x + (px - cw / 2) / cam.z, cam.y + (py - ch / 2) / cam.z]; }
  function zoomAt(px, py, k) {
    var w = toWorld(px, py);
    cam.z = clamp(cam.z * k, cam.fit * 0.8, cam.fit * 16);
    cam.x = w[0] - (px - cw / 2) / cam.z; cam.y = w[1] - (py - ch / 2) / cam.z;
  }
  function focusW(L) { var d = L - lens; return Math.exp(-d * d / 0.85); }

  // ---- field layer ---------------------------------------------------------
  function drawField() {
    var d = fieldImg.data, F = world.F, S = world.S, n = GW * GH, ks = K.ks, i, x, y, p = 0;
    var S0 = S[0], S1 = S[1], S2 = S[2], S3 = S[3], S4 = S[4], top = world.top | 0;
    var w0 = 0.55 + 0.45 * focusW(0);
    for (y = 0; y < GH; y++) {
      for (x = 0; x < GW; x++, p += 4) {
        i = x + y * GW;
        var f = F[i]; if (f > 1) f = 1;
        var r, g, b;
        if (view === 'energy') {
          var t = Math.pow(f, 0.7);
          r = 6 + 110 * t * t; g = 10 + 170 * t; b = 22 + 225 * t;
        } else {
          var s0 = S0[i]; s0 = s0 / (s0 + ks);
          var dim = view === 'structure' ? 0.25 : view === 'order' ? 0.3 : 1, gain = view === 'structure' ? 1.7 : view === 'order' ? 0.25 : 1;
          r = 6 + 16 * f * dim + 96 * s0 * w0 * gain;
          g = 8 + 40 * f * dim + 74 * s0 * w0 * gain;
          b = 15 + 66 * f * dim + 40 * s0 * w0 * gain;
          if (top >= 1) {
            var v = S1[(x >> 1) + (y >> 1) * (GW >> 1)]; v = v / (v + ks) * 0.34 * gain;
            r += STAGE_LV[1][0] * v; g += STAGE_LV[1][1] * v; b += STAGE_LV[1][2] * v;
            if (top >= 2) {
              v = S2[(x >> 2) + (y >> 2) * (GW >> 2)]; v = v / (v + ks) * 0.26 * gain;
              r += STAGE_LV[2][0] * v; g += STAGE_LV[2][1] * v; b += STAGE_LV[2][2] * v;
              v = S3[(x >> 3) + (y >> 3) * (GW >> 3)]; v = v / (v + ks) * 0.24 * gain;
              r += STAGE_LV[3][0] * v; g += STAGE_LV[3][1] * v; b += STAGE_LV[3][2] * v;
              v = S4[(x >> 4) + (y >> 4) * (GW >> 4)]; v = v / (v + ks) * 0.24 * gain;
              r += STAGE_LV[4][0] * v; g += STAGE_LV[4][1] * v; b += STAGE_LV[4][2] * v;
            }
          }
        }
        d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
      }
    }
    fieldCtx.putImageData(fieldImg, 0, 0);
  }

  function lensScale() { return clamp(Math.round(lens * 1.5), 0, NS - 1); }
  function drawOrderBlocks() {
    var s = lensScale(), w = GW >> s, h = GH >> s, bz = world.blockZ[s];
    if (ordCv.width !== w || ordCv.height !== h) { ordCv.width = w; ordCv.height = h; }
    var img = ordCtx.createImageData(w, h), d = img.data;
    for (var i = 0; i < w * h; i++) {
      var z = bz[i], a = Math.min(1, Math.abs(z) / 5);
      var c = z > 0 ? [235, 104, 52] : [57, 135, 229];
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = Math.round(215 * a);
    }
    ordCtx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(ordCv, 0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    if (s >= 2 && (CS << s) * cam.z > 14) { // surface-coloured gaps between blocks
      ctx.strokeStyle = 'rgba(6,8,15,0.9)'; ctx.lineWidth = 2 / cam.z; ctx.beginPath();
      var step = CS << s;
      for (var x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      for (var y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
      ctx.stroke();
    }
  }

  // ---- render --------------------------------------------------------------
  function membranePath(h, wob, tsec) {
    var R = h.R * (1 + (reduceMotion ? 0 : 0.02 * h.cs));
    if (!wob) { ctx.moveTo(h.x + R, h.y); ctx.arc(h.x, h.y, R, 0, 6.2832); return; }
    var n = 22, ph = h.id * 1.7, a1 = tsec * 0.9 + ph, a2 = -tsec * 0.6 + ph * 2;
    for (var i = 0; i <= n; i++) {
      var an = i / n * 6.2832;
      var rr = R * (1 + 0.035 * Math.sin(3 * an + a1) + 0.022 * Math.sin(5 * an + a2));
      var px = h.x + Math.cos(an) * rr, py = h.y + Math.sin(an) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
  }

  function render(now) {
    var z = cam.z, tsec = reduceMotion ? 0 : now / 1000, L, i, h, a, b;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#06080f'; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cw / 2 - cam.x * z), dpr * (ch / 2 - cam.y * z));
    var vx0 = cam.x - cw / 2 / z, vx1 = cam.x + cw / 2 / z, vy0 = cam.y - ch / 2 / z, vy1 = cam.y + ch / 2 / z;

    if (frame % 3 === 0) drawField();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.save();
    ctx.beginPath(); roundRect(0, 0, W, H, 26); ctx.clip();
    ctx.drawImage(fieldCv, 0, 0, W, H);
    if (view === 'order') drawOrderBlocks();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1 / z;
    ctx.beginPath(); roundRect(0, 0, W, H, 26); ctx.stroke();

    var lv = world.lv, top = world.top | 0, quiet = view === 'order' ? 0.5 : 1;

    // membranes, highest level first
    for (L = top; L >= 1; L--) {
      var arr = lv[L], n = arr.length; if (!n) continue;
      var w = focusW(L), col = STAGE_LV[L], wob = !reduceMotion && w > 0.3;
      ctx.beginPath();
      for (i = 0; i < n; i++) {
        h = arr[i];
        if (h.x + h.R < vx0 || h.x - h.R > vx1 || h.y + h.R < vy0 || h.y - h.R > vy1) continue;
        membranePath(h, wob && h.R * z > 7, tsec);
      }
      ctx.fillStyle = rgba(col, (0.025 + 0.075 * w) * quiet); ctx.fill();
      ctx.strokeStyle = rgba(col, (0.10 + 0.85 * w) * quiet); ctx.lineWidth = (0.6 + 1.5 * w) / z; ctx.stroke();
      if (w > 0.2) { // bonds between peers of this level
        ctx.beginPath();
        for (i = 0; i < n; i++) {
          a = arr[i];
          for (var j = 0; j < a.bonds.length; j++) {
            b = a.bonds[j]; if (b.id < a.id) continue;
            var dx = b.x - a.x, dy = b.y - a.y, d = Math.sqrt(dx * dx + dy * dy) + 1e-6;
            if (d < a.R + b.R) continue;
            ctx.moveTo(a.x + dx / d * a.R, a.y + dy / d * a.R); ctx.lineTo(b.x - dx / d * b.R, b.y - dy / d * b.R);
          }
        }
        ctx.strokeStyle = rgba(col, 0.55 * w * quiet); ctx.lineWidth = (1 + 1.2 * w) / z; ctx.stroke();
      }
      // freshly closed membranes flash
      for (i = 0; i < n; i++) {
        h = arr[i];
        if (h.flash > 0.03) {
          ctx.beginPath(); ctx.arc(h.x, h.y, h.R * (1.9 - 0.9 * h.flash), 0, 6.2832);
          ctx.strokeStyle = 'rgba(255,255,255,' + (0.8 * h.flash) + ')'; ctx.lineWidth = 2 / z; ctx.stroke();
          h.flash *= 0.95;
        }
      }
    }

    // coalitions in a scaling crisis
    for (L = 0; L <= top; L++) {
      var cl = world.coals[L], wl = focusW(L);
      if (wl < 0.15) continue;
      ctx.beginPath();
      for (i = 0; i < cl.length; i++) if (cl[i].crisis) { ctx.moveTo(cl[i].x + cl[i].r, cl[i].y); ctx.arc(cl[i].x, cl[i].y, cl[i].r, 0, 6.2832); }
      ctx.setLineDash([5 / z, 4 / z]);
      ctx.strokeStyle = 'rgba(245,176,74,' + (0.9 * wl * (reduceMotion ? 1 : 0.6 + 0.4 * Math.sin(now / 160))) + ')';
      ctx.lineWidth = 1.5 / z; ctx.stroke(); ctx.setLineDash([]);
    }

    // motes
    var motes = lv[0], nm = motes.length, w0 = focusW(0), m;
    if (w0 > 0.12 && z * 8 > 4.5) {
      ctx.beginPath();
      for (i = 0; i < nm; i++) {
        a = motes[i];
        if (a.x < vx0 || a.x > vx1 || a.y < vy0 || a.y > vy1) continue;
        for (j = 0; j < a.bonds.length; j++) { b = a.bonds[j]; if (b.id > a.id) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); } }
      }
      ctx.strokeStyle = 'rgba(225,232,255,' + (0.26 * w0 * quiet) + ')'; ctx.lineWidth = 0.9 / z; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    var haze = 1 - w0, base = 3.2 * 2.7 * (1 + 1.3 * haze);
    if (base * z < 5.2) base = 5.2 / z;
    var alpha = (0.34 + 0.66 * w0) * (view === 'structure' ? 0.55 : 1) * quiet;
    var mode = colorBy, idx, dp, pp;
    var dots = slowRender && base * z < 8;
    if (dots) {
      // cheap far-field drawing for slow renderers: one filled path per colour
      if (dotIdx.length < nm) { dotIdx = new Uint8Array(nm * 2); dotOrder = new Int32Array(nm * 2); }
      dotCount.fill(0);
      for (i = 0; i < nm; i++) {
        m = motes[i];
        if (m.x < vx0 || m.x > vx1 || m.y < vy0 || m.y > vy1) { dotIdx[i] = 255; continue; }
        idx = moteIndex(m, mode); dotIdx[i] = idx; dotCount[idx]++;
      }
      var acc = 0, k;
      for (k = 0; k < sprites.length; k++) { dotStart[k] = acc; acc += dotCount[k]; dotCount[k] = 0; }
      for (i = 0; i < nm; i++) { k = dotIdx[i]; if (k !== 255) dotOrder[dotStart[k] + dotCount[k]++] = i; }
      var ds = Math.max(2.6 / z, 4.6 * (1 + 0.6 * haze)), hs = ds / 2;
      ctx.globalAlpha = Math.min(1, alpha * 1.25);
      for (k = 0; k < sprites.length; k++) {
        if (!dotCount[k]) continue;
        ctx.beginPath();
        for (i = dotStart[k]; i < dotStart[k] + dotCount[k]; i++) { m = motes[dotOrder[i]]; ctx.rect(m.x - hs, m.y - hs, ds, ds); }
        ctx.fillStyle = spriteCss[k]; ctx.fill();
      }
    } else {
      ctx.globalAlpha = alpha;
      for (i = 0; i < nm; i++) {
        m = motes[i];
        if (m.x < vx0 - 12 || m.x > vx1 + 12 || m.y < vy0 - 12 || m.y > vy1 + 12) continue;
        var sz = reduceMotion ? base : base * (0.86 + 0.2 * m.cs);
        ctx.drawImage(sprites[moteIndex(m, mode)], m.x - sz / 2, m.y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;

    // events
    for (i = fx.length - 1; i >= 0; i--) {
      var e = fx[i], age = (now - e.t0) / e.life;
      if (age >= 1) { fx.splice(i, 1); continue; }
      var ea = 1 - age, c = e.col;
      ctx.beginPath();
      if (e.type === 'transcend') ctx.arc(e.x, e.y, e.r * (1 + 1.6 * age), 0, 6.2832);
      else if (e.type === 'fission') ctx.arc(e.x, e.y, e.r * (0.8 + 0.5 * age), 0, 6.2832);
      else ctx.arc(e.x, e.y, e.r * (1 + 0.5 * age), 0, 6.2832);
      ctx.strokeStyle = rgba(c, ea * e.a); ctx.lineWidth = (e.type === 'transcend' ? 2.4 : 1.2) / z; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // selection
    if (sel) {
      if (!sel.alive) { sel = sel.parent && sel.parent.alive ? sel.parent : null; showInspector(); }
      else {
        ctx.beginPath(); ctx.arc(sel.x, sel.y, sel.R + 5 / z, 0, 6.2832);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 1.5 / z; ctx.stroke();
        if (sel.kids && sel.level > 1) {
          ctx.beginPath();
          for (i = 0; i < sel.kids.length; i++) { ctx.moveTo(sel.x, sel.y); ctx.lineTo(sel.kids[i].x, sel.kids[i].y); }
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1 / z; ctx.stroke();
        }
      }
    }
  }
  var slowRender = false, renderMs = 4, dotIdx = new Uint8Array(1024), dotOrder = new Int32Array(1024);
  var dotCount = new Int32Array(64), dotStart = new Int32Array(64);
  function moteIndex(m, mode) {
    if (mode === 'lineage') return (m.hue * HUES) | 0;
    if (mode === 'energy') return HUES + Math.min(RAMP - 1, (m.E / K.Erep * (RAMP - 1)) | 0);
    if (mode === 'ext') return HUES + Math.min(RAMP - 1, (m.ext * RAMP) | 0);
    if (mode === 'coord') return HUES + Math.min(RAMP - 1, (m.coord * RAMP) | 0);
    var dp = 0, pp = m.parent; while (pp) { dp++; pp = pp.parent; }
    return HUES + RAMP + dp;
  }
  function roundRect(x, y, w, h, r) {
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---- events from the simulation -------------------------------------------
  function drainEvents(now) {
    var ev = world.events;
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i];
      if (e.type === 'milestone') { toast(world.milestones[e.n]); histDirty = true; continue; }
      if (fx.length > 160) continue;
      var col = STAGE_LV[Math.min(MAXL, e.level)];
      if (e.type === 'transcend') fx.push({ type: e.type, x: e.x, y: e.y, r: e.r, t0: now, life: 1500, col: [255, 255, 255], a: 0.9 });
      else if (e.type === 'fission' && focusW(e.level) > 0.3) fx.push({ type: e.type, x: e.x, y: e.y, r: e.r, t0: now, life: 600, col: col, a: 0.6 });
      else if (e.type === 'collapse' && focusW(e.level) > 0.2) fx.push({ type: e.type, x: e.x, y: e.y, r: e.r, t0: now, life: 900, col: [245, 120, 80], a: 0.8 });
      else if (e.type === 'dissolve' && focusW(e.level) > 0.3) fx.push({ type: e.type, x: e.x, y: e.y, r: e.r, t0: now, life: 800, col: [170, 176, 196], a: 0.5 });
    }
    ev.length = 0;
  }
  function toast(m) {
    if (!m) return;
    var box = $('toasts'), el = document.createElement('div');
    el.className = 'toast';
    var dot = document.createElement('i'); dot.style.background = rgba(STAGE_LV[Math.min(MAXL, m.level + (m.stage === 4 ? 1 : 0))], 1);
    var num = document.createElement('b'); num.textContent = m.stage === 0 && m.key === 'life' ? 'I' : ROMAN[m.stage];
    var tx = document.createElement('span'); tx.textContent = m.label;
    el.appendChild(dot); el.appendChild(num); el.appendChild(tx);
    box.appendChild(el);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () { el.classList.add('is-out'); }, 5200);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 5900);
  }

  // ---- picking and the inspector ---------------------------------------------
  function pick(wx, wy) {
    var motes = world.lv[0], best = null, bd = Math.max(12, 14 / cam.z); bd *= bd;
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i], dx = m.x - wx, dy = m.y - wy, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = m; }
    }
    var target = Math.round(lens), h = best;
    if (!h) {
      for (var L = Math.min(world.top | 0, Math.max(1, target)); L >= 1 && !h; L--) {
        var arr = world.lv[L];
        for (i = 0; i < arr.length; i++) { var q = arr[i], ex = q.x - wx, ey = q.y - wy; if (ex * ex + ey * ey < q.R * q.R) { h = q; break; } }
      }
    } else while (h.parent && h.level < target) h = h.parent;
    sel = h || null; follow = false;
    showInspector();
  }
  function showInspector() {
    var box = $('inspector');
    if (!sel) { box.hidden = true; return; }
    box.hidden = false;
    var genes = '';
    for (var i = 0; i < TRAITS.length; i++) genes += '<span>' + TRAITS[i][1] + '</span><i style="--v:' + sel[TRAITS[i][0]].toFixed(3) + '"></i>';
    var free = !sel.parent;
    var st = sel.crisis ? '<span class="state crisis"><i></i>scaling crisis</span>'
      : free && sel.coalN > 1 ? '<span class="state"><i></i>in a coalition of ' + sel.coalN + '</span>'
      : free ? '<span class="state"><i></i>free</span>'
      : '<span class="state"><i></i>inside a ' + LN[sel.parent.level] + '</span>';
    box.innerHTML = '<header><h3>' + LN[sel.level] + '</h3><span>#' + sel.id + ' · ' + FSTOP[sel.level] + '</span></header>' + st +
      '<dl>' + (sel.level ? '<dt>Motes inside</dt><dd>' + sel.mass + '</dd>' : '') + (sel.level > 1 ? '<dt>' + LP[sel.level - 1] + ' inside</dt><dd>' + sel.kids.length + '</dd>' : '') +
      '<dt>Energy per mote</dt><dd>' + sel.meanE.toFixed(2) + '</dd>' +
      '<dt>Income per mote</dt><dd>' + (sel.inc * 1000).toFixed(1) + ' m/tick</dd>' +
      '<dt>Bonds</dt><dd>' + sel.bonds.length + '</dd>' +
      '<dt>Coordination</dt><dd>' + sel.coord.toFixed(2) + '</dd>' +
      '<dt>Age</dt><dd>' + fmt(sel.age) + '</dd><dt>Generation</dt><dd>' + sel.gen + '</dd></dl>' +
      '<div class="genes">' + genes + '</div>' +
      '<div class="row">' + (sel.parent ? '<button class="btn on-stage" data-act="up">Open its ' + LN[sel.parent.level] + '</button>' : '') +
      '<button class="btn on-stage toggle" data-act="follow" aria-pressed="' + follow + '">Follow</button>' +
      '<button class="btn on-stage" data-act="close">Close</button></div>';
  }
  $('inspector').addEventListener('click', function (e) {
    var act = e.target.getAttribute && e.target.getAttribute('data-act');
    if (act === 'up' && sel && sel.parent) { sel = sel.parent; setLens(sel.level, false); }
    else if (act === 'follow') follow = !follow;
    else if (act === 'close') { sel = null; follow = false; }
    else return;
    showInspector();
  });

  // ---- pointer input ---------------------------------------------------------
  var ptrs = {}, nPtr = 0, moved = 0, pinch = 0, hinted = false;
  function brush(px, py) {
    var w = toWorld(px, py), r = Math.max(34, 30 / cam.z);
    if (tool === 'feed') world.feed(w[0], w[1], r * 1.4, 0.25);
    else world.burn(w[0], w[1], r);
  }
  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    ptrs[e.pointerId] = { x: e.offsetX, y: e.offsetY }; nPtr++; moved = 0; pinch = 0;
    if (tool !== 'inspect' && nPtr === 1) brush(e.offsetX, e.offsetY); else canvas.classList.add('is-drag');
  });
  canvas.addEventListener('pointermove', function (e) {
    var p = ptrs[e.pointerId]; if (!p) return;
    var dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    if (nPtr === 2) {
      p.x = e.offsetX; p.y = e.offsetY;
      var ids = Object.keys(ptrs), a = ptrs[ids[0]], b = ptrs[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0 && d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
      pinch = d; moved = 99; return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (tool !== 'inspect') { brush(e.offsetX, e.offsetY); p.x = e.offsetX; p.y = e.offsetY; return; }
    cam.x -= dx / cam.z; cam.y -= dy / cam.z; follow = false;
    p.x = e.offsetX; p.y = e.offsetY;
  });
  function pointerEnd(e) {
    if (!ptrs[e.pointerId]) return;
    delete ptrs[e.pointerId]; nPtr = Math.max(0, nPtr - 1); pinch = 0;
    canvas.classList.remove('is-drag');
    if (e.type === 'pointerup' && moved < 6 && tool === 'inspect') { var w = toWorld(e.offsetX, e.offsetY); pick(w[0], w[1]); }
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
    follow = false;
  }, { passive: false });
  canvas.addEventListener('dblclick', function () { fitView(); });

  // ---- aperture ----------------------------------------------------------------
  function setLens(v, manual) {
    lensTarget = clamp(v, 0, MAXL);
    if (manual !== false) setAuto(false);
  }
  function setAuto(on) { autoLens = on; $('btnAuto').setAttribute('aria-pressed', on ? 'true' : 'false'); }
  (function () {
    var stops = $('stops');
    for (var L = 0; L <= MAXL; L++) {
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = FSTOP[L].slice(2); b.title = FSTOP[L] + ' resolves ' + LP[L];
      b.style.left = (L / MAXL * 100) + '%'; b.setAttribute('data-level', L);
      b.setAttribute('aria-label', 'Aperture ' + FSTOP[L] + ', resolves ' + LP[L]);
      stops.appendChild(b);
    }
    stops.addEventListener('click', function (e) { var l = e.target.getAttribute('data-level'); if (l !== null) setLens(+l); });
    $('lens').addEventListener('input', function () { setLens(+this.value); lens = lensTarget; });
    $('btnAuto').addEventListener('click', function () { setAuto(!autoLens); });
  })();
  function updateLens() {
    if (autoLens) {
      var top = world.stats.topLevel;
      var t = clamp(Math.log(cam.z / cam.fit) / Math.log(7), 0, 1);
      lensTarget = top * (1 - t);
    }
    lens += (lensTarget - lens) * 0.08;
    if (Math.abs(lensTarget - lens) < 0.002) lens = lensTarget;
  }

  // ---- instruments: ladder -----------------------------------------------------
  var ladderCells = [], ladderRows = [];
  (function () {
    var box = $('ladder'), html = '<div></div>', L, s;
    var key = '';
    for (s = 0; s < 6; s++) { html += '<div class="lh" role="columnheader" title="' + SN[s] + '"><b>' + ROMAN[s] + '</b></div>'; key += '<li><b>' + ROMAN[s] + '</b>' + SN[s] + '</li>'; }
    $('rungKey').innerHTML = key;
    for (L = MAXL; L >= 0; L--) {
      html += '<button class="lr" type="button" data-level="' + L + '" style="--c:var(--lv' + L + ')" title="Focus the aperture on ' + LP[L] + '"><b>' + LP[L] + '</b><span>0</span></button>';
      for (s = 0; s < 6; s++) html += '<div class="lc" data-l="' + L + '" data-s="' + s + '" style="--c:var(--lv' + L + ')"></div>';
    }
    box.innerHTML = html;
    var rows = box.querySelectorAll('.lr'), cells = box.querySelectorAll('.lc');
    for (L = 0; L <= MAXL; L++) { ladderRows[L] = rows[MAXL - L]; ladderCells[L] = []; }
    for (var i = 0; i < cells.length; i++) ladderCells[+cells[i].getAttribute('data-l')][+cells[i].getAttribute('data-s')] = cells[i];
    box.addEventListener('click', function (e) { var r = e.target.closest('.lr'); if (r) setLens(+r.getAttribute('data-level')); });
    box.addEventListener('pointermove', function (e) {
      var c = e.target.closest('.lc'); if (!c) { hideTip(); return; }
      var l = +c.getAttribute('data-l'), sg = +c.getAttribute('data-s'), v = world.stats.stage[l][sg];
      showTip(e, '<b>' + LP[l] + ' · ' + ROMAN[sg] + ' ' + SN[sg] + '</b><br>' + stageText(l, sg, v));
    });
    box.addEventListener('pointerleave', hideTip);
  })();
  function stageText(l, s, v) {
    var st = world.stats, n = st.n[l];
    if (!n) return 'No ' + LP[l].toLowerCase() + ' exist yet.';
    if (s === 0) return '<span class="n">' + fmt(n) + '</span> alive, each harvesting with its own body.';
    if (s === 1) return '<span class="n">' + Math.round(v * 30) + '%</span> of their intake exists because of works built at this level.';
    if (s === 2) return '<span class="n">' + Math.round(st.bonded[l] * 100) + '%</span> are bonded to peers, phase coherence <span class="n">' + st.coh[l].toFixed(2) + '</span>.';
    if (s === 3) return v > 0.02 ? 'Coalitions are paying more than a quarter of their income for consensus.' : 'No coalition is over-scaled right now.';
    if (s === 4) return l === MAXL ? 'There is no level above this one. The crisis stays open.' : '<span class="n">' + Math.round(v * 100) + '%</span> now live inside a ' + LN[l + 1] + '.';
    return l === MAXL ? 'Nothing above to recurse into.' : (v > 0 ? LP[l + 1] + ' are externalising and coordinating in their turn.' : 'The level above has not started its own climb.');
  }
  function updateLadder() {
    var st = world.stats, lensL = Math.round(lens);
    for (var L = 0; L <= MAXL; L++) {
      var row = ladderRows[L];
      row.lastChild.textContent = fmt(st.n[L]);
      row.classList.toggle('is-empty', !st.n[L]);
      row.classList.toggle('is-lens', L === lensL);
      for (var s = 0; s < 6; s++) {
        var c = ladderCells[L][s], v = st.stage[L][s];
        c.style.setProperty('--v', (v > 0 ? 0.12 + 0.88 * v : 0).toFixed(3));
        c.classList.toggle('is-reached', !!st.reached[L][s]);
        c.classList.toggle('is-crisis', s === 3 && v > 0.02);
      }
    }
  }

  // ---- instruments: order spectrum -----------------------------------------------
  function niceStep(range) {
    var raw = range / 3, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  function kfmt(v) { var a = Math.abs(v); return a >= 10000 ? (v / 1000).toFixed(0) + 'k' : a >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v)); }
  function updateSpectrum() {
    var sp = world.spec, bits = sp.bits, zs = sp.z, s;
    var mx = 40, mn = 0;
    for (s = 0; s < NS; s++) { if (bits[s] > mx) mx = bits[s]; if (bits[s] < mn) mn = bits[s]; }
    var step = niceStep(mx - mn); mx = Math.ceil(mx / step) * step; mn = Math.floor(mn / step) * step;
    var X0 = 36, X1 = 298, Y0 = 8, Y1 = 112, bw = (X1 - X0) / NS;
    function y(v) { return Y1 - (v - mn) / (mx - mn) * (Y1 - Y0); }
    var out = '<svg viewBox="0 0 304 158" role="img" aria-label="Bits of spatial order at each of seven scales">';
    for (var g = mn; g <= mx + 1e-9; g += step) out += '<line class="grid" x1="' + X0 + '" x2="' + X1 + '" y1="' + y(g).toFixed(1) + '" y2="' + y(g).toFixed(1) + '"/><text x="' + (X0 - 5) + '" y="' + (y(g) + 3).toFixed(1) + '" text-anchor="end">' + kfmt(g) + '</text>';
    var ls = lensScale(), seen = 0;
    for (s = 0; s < NS; s++) {
      var v = bits[s], noise = Math.abs(zs[s]) < 3, x = X0 + s * bw + 5, w = bw - 10;
      if (!noise) seen++;
      var ya = y(Math.max(0, v)), yb = y(Math.min(0, v)), hh = Math.max(1.5, yb - ya), r = Math.min(4, hh / 2, w / 2);
      var d = v >= 0
        ? 'M' + x + ' ' + yb + 'V' + (ya + r) + 'q0 ' + (-r) + ' ' + r + ' ' + (-r) + 'h' + (w - 2 * r) + 'q' + r + ' 0 ' + r + ' ' + r + 'V' + yb + 'z'
        : 'M' + x + ' ' + ya + 'V' + (yb - r) + 'q0 ' + r + ' ' + r + ' ' + r + 'h' + (w - 2 * r) + 'q' + r + ' 0 ' + r + ' ' + (-r) + 'V' + ya + 'z';
      out += '<rect class="hit" data-s="' + s + '" x="' + (X0 + s * bw) + '" y="' + Y0 + '" width="' + bw + '" height="' + (Y1 - Y0 + 22) + '"/>';
      out += '<path class="bar' + (noise ? ' is-noise' : v < 0 ? ' is-neg' : '') + '" d="' + d + '" pointer-events="none"/>';
      out += '<text x="' + (x + w / 2) + '" y="' + (Y1 + 13) + '" text-anchor="middle"' + (s === ls ? ' class="val"' : '') + '>' + (CS << s) + '</text>';
      if (s === ls) out += '<path class="lensmark" d="M' + (x + w / 2 - 4) + ' ' + (Y1 + 23) + 'h8l-4 -5z"/>';
    }
    out += '<line class="axis" x1="' + X0 + '" x2="' + X1 + '" y1="' + y(0).toFixed(1) + '" y2="' + y(0).toFixed(1) + '"/>';
    out += '<text x="' + X0 + '" y="154">block size in world units</text><text x="' + X1 + '" y="154" text-anchor="end">▲ current aperture</text></svg>';
    $('spectrum').innerHTML = out;
    var vd = $('verdict');
    if (world.lv[0].length < 24) vd.textContent = 'Nothing to measure yet. The field is still pure possibility.';
    else if (!seen) vd.textContent = 'Indistinguishable from unstructured possibility at every aperture.';
    else {
      var peak = 0; for (s = 1; s < NS; s++) if (Math.abs(bits[s]) > Math.abs(bits[peak])) peak = s;
      vd.innerHTML = 'Distinguishable from noise at <b>' + seen + ' of ' + NS + '</b> apertures. Most order sits at <b>' + (CS << peak) + ' units</b>' + (bits[peak] < 0 ? ', as even spacing.' : ', as clustering.');
    }
  }
  $('spectrum').addEventListener('pointermove', function (e) {
    var t = e.target; if (!t.getAttribute || t.getAttribute('data-s') === null) { hideTip(); return; }
    var s = +t.getAttribute('data-s'), v = world.spec.bits[s], zz = world.spec.z[s];
    showTip(e, '<b>' + (CS << s) + '-unit blocks</b><br><span class="n">' + (v >= 0 ? '+' : '') + fmt(v) + '</span> bits · <span class="n">' + zz.toFixed(1) + 'σ</span><br>' +
      (Math.abs(zz) < 3 ? 'Within noise. An observer at this aperture sees nothing.' : v > 0 ? 'Clustered: more unequal than chance.' : 'Regular: more evenly spaced than chance.'));
  });
  $('spectrum').addEventListener('pointerleave', hideTip);

  // ---- instruments: read-outs ----------------------------------------------------
  (function () {
    var html = '';
    for (var i = 0; i < TRAITS.length; i++) html += '<span>' + TRAITS[i][1] + '</span><i id="m_' + TRAITS[i][0] + '"></i><b id="v_' + TRAITS[i][0] + '">0.50</b>';
    $('meters').innerHTML = html;
    var lg = '';
    for (i = 0; i <= MAXL; i++) lg += '<li><i style="background:var(--lv' + i + ')"></i>' + DEPTH_LABEL[i] + '</li>';
    $('legendDepth').innerHTML = lg;
  })();
  function updateReadouts() {
    var st = world.stats, sp = world.spec;
    $('tick').textContent = fmt(world.t);
    $('tps').textContent = running ? Math.round(tps) + '/s' : 'paused';
    $('pop').textContent = fmt(world.lv[0].length);
    $('sIn').textContent = st.influx.toFixed(1);
    $('sOut').textContent = st.diss.toFixed(1);
    $('sBits').textContent = kfmt(sp.total);
    $('sEff').textContent = sp.total > 20 ? (st.diss / sp.total).toFixed(3) : '–';
    var ext = clamp(st.extShare, 0, 1);
    $('splitBody').style.flexGrow = (1 - ext).toFixed(3); $('splitExt').style.flexGrow = ext.toFixed(3);
    $('splitBodyV').textContent = Math.round((1 - ext) * 100) + '%'; $('splitExtV').textContent = Math.round(ext * 100) + '%';
    for (var i = 0; i < TRAITS.length; i++) {
      var k = TRAITS[i][0], v = st.traits[k];
      $('m_' + k).style.setProperty('--v', v.toFixed(3)); $('v_' + k).textContent = v.toFixed(2);
    }
    $('genomeBits').textContent = st.genomeBits.toFixed(2) + ' bits selected per mote';
    $('fstop').textContent = FSTOP[Math.round(lens)];
    $('lensLabel').textContent = 'resolving ' + LP[Math.round(lens)];
    if (document.activeElement !== $('lens')) $('lens').value = lens;
    var sb = $('stops').children;
    for (i = 0; i < sb.length; i++) { sb[i].classList.toggle('is-on', i === Math.round(lens)); sb[i].classList.toggle('is-empty', !st.n[i]); }
    // scale bar
    var target = 90 / cam.z, len = 10; while (len * 2 < target) len *= 2;
    $('scaleBar').style.width = (len * cam.z).toFixed(1) + 'px'; $('scaleLabel').textContent = len + ' units';
    $('orderKey').hidden = view !== 'order';
    if (sel && frame % 2 === 0) showInspector();
  }

  // ---- history strip ----------------------------------------------------------------
  var tl = $('timeline'), tlx = tl.getContext('2d'), histDirty = true, tlGeom = null, tlHover = -1;
  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    function v(n) { return cs.getPropertyValue(n).trim(); }
    theme = { panel: v('--panel'), panel2: v('--panel-2'), ink: v('--ink'), ink2: v('--ink-2'), ink3: v('--ink-3'), line: v('--line'), line2: v('--line-2'), lv: [], warm: v('--warm'), cool: v('--cool'), mid: v('--mid') };
    for (var i = 0; i <= MAXL; i++) theme.lv.push(v('--lv' + i));
    theme.warmC = hex(theme.warm); theme.coolC = hex(theme.cool); theme.midC = hex(theme.mid);
    histDirty = true;
  }
  function hex(h) { h = h.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function drawTimeline() {
    var r = tl.getBoundingClientRect(), w = Math.max(120, r.width), h = Math.max(60, r.height), d = Math.min(window.devicePixelRatio || 1, 2);
    if (tl.width !== Math.round(w * d) || tl.height !== Math.round(h * d)) { tl.width = Math.round(w * d); tl.height = Math.round(h * d); }
    var c = tlx; c.setTransform(d, 0, 0, d, 0, 0); c.clearRect(0, 0, w, h);
    var hist = world.history, n = hist.length;
    var X0 = 44, X1 = w - 6, top = 12, aH = Math.round((h - 34) * 0.5), gap = 8, bY = top + aH + gap, bH = h - 16 - bY, rowH = bH / NS;
    tlGeom = { X0: X0, X1: X1, aY: top, aH: aH, bY: bY, bH: bH, n: n };
    c.font = '10px ' + getComputedStyle(document.body).getPropertyValue('--mono');
    c.fillStyle = theme.ink3; c.textBaseline = 'middle'; c.textAlign = 'right';
    c.fillText('motes', X0 - 6, top + aH / 2);
    c.fillText('640', X0 - 6, bY + rowH * 0.5); c.fillText('80', X0 - 6, bY + rowH * 3.5); c.fillText('10', X0 - 6, bY + rowH * 6.5);
    c.fillStyle = theme.panel2; c.fillRect(X0, top, X1 - X0, aH); c.fillRect(X0, bY, X1 - X0, bH);
    if (n < 2) {
      c.fillStyle = theme.ink3; c.textAlign = 'center';
      c.fillText('history appears after the first samples', (X0 + X1) / 2, top + aH / 2);
      return;
    }
    var t0 = hist[0].t, t1 = hist[n - 1].t, span = Math.max(1, t1 - t0), i, L, s;
    function x(t) { return X0 + (t - t0) / span * (X1 - X0); }
    // stacked area: where the motes live
    var maxN = 1; for (i = 0; i < n; i++) if (hist[i].N > maxN) maxN = hist[i].N;
    var cum = new Float64Array(n);
    for (L = 0; L <= MAXL; L++) {
      c.beginPath();
      for (i = 0; i < n; i++) { var yb = top + aH - cum[i] / maxN * aH; if (i === 0) c.moveTo(x(hist[i].t), yb); else c.lineTo(x(hist[i].t), yb); }
      for (i = n - 1; i >= 0; i--) { cum[i] += hist[i].massTop[L]; c.lineTo(x(hist[i].t), top + aH - cum[i] / maxN * aH); }
      c.closePath(); c.fillStyle = theme.lv[L]; c.fill();
      c.beginPath(); // surface-coloured seam between bands
      for (i = 0; i < n; i++) { var yt = top + aH - cum[i] / maxN * aH; if (i === 0) c.moveTo(x(hist[i].t), yt); else c.lineTo(x(hist[i].t), yt); }
      c.strokeStyle = theme.panel2; c.lineWidth = 1; c.stroke();
    }
    c.fillStyle = theme.ink3; c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(kfmt(maxN), X0 + 4, top + 2);
    // spectrogram: order per octave of scale over time
    var mxb = 60;
    for (i = 0; i < n; i++) for (s = 0; s < NS; s++) { var av = Math.abs(hist[i].bits[s]); if (av > mxb) mxb = av; }
    var colW = Math.max(1, (X1 - X0) / n + 0.6);
    for (i = 0; i < n; i++) {
      var hx = x(hist[i].t) - colW / 2; if (hx < X0) hx = X0;
      for (s = 0; s < NS; s++) {
        var v = hist[i].bits[s], zz = hist[i].z[s];
        if (Math.abs(zz) < 3) continue;
        var m = Math.min(1, Math.sqrt(Math.abs(v) / mxb)), pole = v > 0 ? theme.warmC : theme.coolC, md = theme.midC;
        c.fillStyle = 'rgb(' + Math.round(md[0] + (pole[0] - md[0]) * m) + ',' + Math.round(md[1] + (pole[1] - md[1]) * m) + ',' + Math.round(md[2] + (pole[2] - md[2]) * m) + ')';
        c.fillRect(hx, bY + (NS - 1 - s) * rowH, Math.min(colW, X1 - hx), rowH - 1);
      }
    }
    // time axis + milestones
    c.fillStyle = theme.ink3; c.textBaseline = 'alphabetic';
    c.textAlign = 'left'; c.fillText('t ' + fmt(t0), X0, h - 3);
    c.textAlign = 'right'; c.fillText(fmt(t1), X1, h - 3);
    var ms = world.milestones;
    for (i = 0; i < ms.length; i++) {
      if (ms[i].t < t0) continue;
      var mxp = x(ms[i].t), lvl = Math.min(MAXL, ms[i].level + (ms[i].stage === 4 ? 1 : 0));
      c.fillStyle = theme.lv[lvl]; c.strokeStyle = theme.panel; c.lineWidth = 1;
      c.beginPath(); c.moveTo(mxp - 4, 1); c.lineTo(mxp + 4, 1); c.lineTo(mxp, 9); c.closePath(); c.fill(); c.stroke();
    }
    if (tlHover >= 0 && tlHover < n) {
      var hx2 = x(hist[tlHover].t);
      c.strokeStyle = theme.ink; c.lineWidth = 1; c.beginPath(); c.moveTo(hx2 + 0.5, top); c.lineTo(hx2 + 0.5, bY + bH); c.stroke();
    }
  }
  $('timelinePlot').addEventListener('pointermove', function (e) {
    var g = tlGeom, hist = world.history; if (!g || g.n < 2) return;
    var r = tl.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    var t0 = hist[0].t, t1 = hist[g.n - 1].t;
    if (py < 11) { // milestone markers
      var ms = world.milestones, best = null, bd = 9;
      for (var i = 0; i < ms.length; i++) { var mx = g.X0 + (ms[i].t - t0) / Math.max(1, t1 - t0) * (g.X1 - g.X0), dd = Math.abs(mx - px); if (dd < bd) { bd = dd; best = ms[i]; } }
      if (best) { showTip(e, '<b>t ' + fmt(best.t) + '</b><br>' + best.label); return; }
    }
    var f = clamp((px - g.X0) / (g.X1 - g.X0), 0, 1), idx = Math.round(f * (g.n - 1)), hh = hist[idx];
    if (idx !== tlHover) { tlHover = idx; histDirty = true; }
    var html = '<b>t ' + fmt(hh.t) + '</b> · <span class="n">' + fmt(hh.N) + '</span> motes';
    if (py >= g.bY) {
      var s = clamp(NS - 1 - Math.floor((py - g.bY) / (g.bH / NS)), 0, NS - 1);
      html += '<br>' + (CS << s) + '-unit blocks: <span class="n">' + (hh.bits[s] >= 0 ? '+' : '') + fmt(hh.bits[s]) + '</span> bits, <span class="n">' + hh.z[s].toFixed(1) + 'σ</span>';
    } else {
      for (var L = MAXL; L >= 0; L--) if (hh.massTop[L] > 0) html += '<br><span class="n">' + fmt(hh.massTop[L]) + '</span> ' + DEPTH_LABEL[L];
    }
    showTip(e, html);
  });
  $('timelinePlot').addEventListener('pointerleave', function () { tlHover = -1; histDirty = true; hideTip(); });

  // ---- tooltip -----------------------------------------------------------------------
  var tip = $('tip');
  function showTip(e, html) {
    tip.innerHTML = html; tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = clamp(e.clientX + 14, 8, window.innerWidth - tw - 8) + 'px';
    tip.style.top = clamp(e.clientY - th - 12, 8, window.innerHeight - th - 8) + 'px';
  }
  function hideTip() { tip.hidden = true; }

  // ---- controls -------------------------------------------------------------------------
  function segmented(id, attr, fn) {
    $(id).addEventListener('click', function (e) {
      var v = e.target.getAttribute && e.target.getAttribute(attr); if (v === null || v === undefined) return;
      var bs = this.querySelectorAll('button');
      for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', bs[i] === e.target ? 'true' : 'false');
      fn(v);
    });
  }
  function pressSeg(id, attr, v) { var bs = $(id).querySelectorAll('button'); for (var i = 0; i < bs.length; i++) bs[i].setAttribute('aria-pressed', bs[i].getAttribute(attr) === String(v) ? 'true' : 'false'); }
  segmented('segSpeed', 'data-speed', function (v) { speed = +v; });
  segmented('segView', 'data-view', function (v) { view = v; store('view', v); });
  segmented('segTool', 'data-tool', function (v) { tool = v; canvas.classList.toggle('is-brush', v !== 'inspect'); });
  $('colorBy').addEventListener('change', function () { colorBy = this.value; store('color', colorBy); });
  $('btnFit').addEventListener('click', fitView);

  function setRunning(on) {
    running = on;
    $('btnPlay').setAttribute('aria-label', on ? 'Pause' : 'Run'); $('btnPlay').title = (on ? 'Pause' : 'Run') + ' (space)';
    $('playGlyph').setAttribute('d', on ? 'M4 2.5h3v11H4zM9 2.5h3v11H9z' : 'M4 2.5 13 8l-9 5.5z');
  }
  $('btnPlay').addEventListener('click', function () { setRunning(!running); });
  $('btnStep').addEventListener('click', function () { setRunning(false); world.step(); });
  $('btnNew').addEventListener('click', function () { newWorld(); setRunning(true); });
  $('seed').addEventListener('keydown', function (e) { if (e.key === 'Enter') { newWorld(); setRunning(true); this.blur(); } });

  var DIALS = [['dSun', 'oSun', 'sun', '×'], ['dPersist', 'oPersist', 'persist', '×'], ['dEntropy', 'oEntropy', 'entropy', '×'], ['dBeta', 'oBeta', 'beta', ''], ['dMut', 'oMut', 'mut', '×'], ['dSpont', 'oSpont', 'spont', '×']];
  function syncDials() {
    for (var i = 0; i < DIALS.length; i++) $(DIALS[i][1]).textContent = (+$(DIALS[i][0]).value).toFixed(2) + DIALS[i][3];
    if (world) { var p = readParams(); for (var k in p) world.p[k] = p[k]; }
  }
  DIALS.forEach(function (d) { $(d[0]).addEventListener('input', syncDials); });
  ['kExt', 'kBond', 'kEnc', 'kMax'].forEach(function (id) { $(id).addEventListener('change', syncDials); });

  var PRESETS = {
    genesis: [{}, 'Every mote condenses with a uniformly random genome. Nothing is committed yet.'],
    costly: [{ persist: 1.6 }, 'Existing costs 60% more. Watch whether shelter makes membranes arrive sooner.'],
    hot: [{ entropy: 2.2 }, 'Works decay twice as fast and bonds break more often. Order has to be rebuilt constantly.'],
    starved: [{ sun: 0.5 }, 'Half the energy enters the field. Fewer bodies, longer climbs.'],
    steep: [{ beta: 1.7 }, 'Consensus cost rises steeply with group size, so the crisis comes early and Cells stay small.'],
    'ko-ext': [{ allowExt: false }, 'Nothing can build works. Bonds form through works, so the ladder should stall at rung I.'],
    'ko-bond': [{ allowBond: false }, 'Works can be built but free peers cannot bond. No coalitions, no crisis, no membranes.'],
    'ko-enc': [{ allowEnc: false }, 'Coalitions can form but never close a membrane. Every crisis ends in collapse.'],
    flat: [{ maxLevel: 1 }, 'Cells may form but cannot transcend again. The crisis at the Cell level stays open.']
  };
  $('preset').addEventListener('change', function () {
    var p = PRESETS[this.value] || PRESETS.genesis, d = Sim.defaultParams(), k;
    for (k in p[0]) d[k] = p[0][k];
    $('dSun').value = d.sun; $('dPersist').value = d.persist; $('dEntropy').value = d.entropy; $('dBeta').value = d.beta; $('dMut').value = d.mut; $('dSpont').value = d.spont;
    $('kExt').checked = d.allowExt; $('kBond').checked = d.allowBond; $('kEnc').checked = d.allowEnc; $('kMax').value = d.maxLevel;
    $('presetNote').textContent = p[1];
    syncDials(); newWorld(); setRunning(true);
  });

  $('btnExtinct').addEventListener('click', function () { world.extinction(0.7); });
  $('btnStorm').addEventListener('click', function () { world.storm(); });

  function copyOut(btn, text, what) {
    function done() { var old = btn.textContent; btn.textContent = 'Copied ' + what; btn.classList.add('is-done'); setTimeout(function () { btn.textContent = old; btn.classList.remove('is-done'); }, 1600); }
    function fallback() { var d = $('exportDlg'), ta = $('exportText'); ta.value = text; if (d.showModal) d.showModal(); else d.setAttribute('open', ''); ta.focus(); ta.select(); }
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
  }
  $('btnCSV').addEventListener('click', function () { copyOut(this, world.exportCSV(), world.history.length + ' rows'); });
  $('btnJSON').addEventListener('click', function () { copyOut(this, world.exportJSON(), 'record'); });
  $('btnTheory').addEventListener('click', function () { var d = $('theory'); if (d.showModal) d.showModal(); else d.setAttribute('open', ''); });

  document.addEventListener('keydown', function (e) {
    var t = e.target.tagName;
    if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA' || e.metaKey || e.ctrlKey || document.querySelector('dialog[open]')) return;
    if (e.key === ' ') { e.preventDefault(); setRunning(!running); }
    else if (e.key === '.') { setRunning(false); world.step(); }
    else if (e.key === '[') setLens(Math.round(lensTarget) - 1);
    else if (e.key === ']') setLens(Math.round(lensTarget) + 1);
    else if (e.key === 'f' || e.key === 'F') fitView();
    else if (e.key === 'Escape') { sel = null; showInspector(); }
  });

  // ---- main loop ---------------------------------------------------------------------------
  var lastUI = 0, lastHist = 0, lastSpec = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    frame++;
    if (running) {
      var t0 = performance.now(), steps = 0;
      while (steps < speed && (steps === 0 || performance.now() - t0 < 13)) { world.step(); steps++; }
      tickCount += steps;
    }
    if (now - tpsT > 500) { tps = tickCount * 1000 / (now - tpsT); tickCount = 0; tpsT = now; }
    drainEvents(now);
    updateLens();
    if (follow && sel && sel.alive) { cam.x += (sel.x - cam.x) * 0.12; cam.y += (sel.y - cam.y) * 0.12; }
    var r0 = performance.now();
    render(now);
    renderMs += 0.06 * (performance.now() - r0 - renderMs);
    if (!slowRender && renderMs > 13) slowRender = true; else if (slowRender && renderMs < 4) slowRender = false;
    if (now - lastSpec > 450) { lastSpec = now; world.orderSpectrum(); updateSpectrum(); }
    if (now - lastUI > 220) { lastUI = now; updateLadder(); updateReadouts(); }
    if (now - lastHist > 900 || histDirty) { lastHist = now; histDirty = false; drawTimeline(); }
  }

  // ---- boot ----------------------------------------------------------------------------------
  function start(saved) {
    var v = store('view'), c = store('color');
    if (v && /^(life|energy|structure|order)$/.test(v)) { view = v; pressSeg('segView', 'data-view', v); }
    if (c && $('colorBy').querySelector('option[value="' + c + '"]')) { colorBy = c; $('colorBy').value = c; }
    if (saved && saved.seed) $('seed').value = saved.seed;
    readTheme();
    syncDials();
    newWorld();
    // open on a living world rather than an empty field
    for (var i = 0; i < 420; i++) world.step();
    world.events.length = 0;
    resize(); fitView();
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); histDirty = true; }).observe($('stage'));
    window.addEventListener('resize', function () { resize(); histDirty = true; });
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', readTheme);
    }
    if (window.MutationObserver) new MutationObserver(readTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { histDirty = true; });
    requestAnimationFrame(loop);
  }
  window.__holon = { get world() { return world; }, cam: cam, setLens: setLens, fitView: fitView, setRunning: setRunning };
  var hot = window.claude && window.claude.hot;
  if (hot && hot.snapshot) hot.snapshot(function () { return { seed: world ? world.seed : null }; });
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})();
