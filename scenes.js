// Scenes: each section of the page runs its own small model, drawn
// as sparse light on the dark: points, hairlines, short streaks, a few glyphs.
// Every scene is a real simulation, but an illustration, not research data.
//
//   field      coupled phase oscillators on a lattice (engine.js)
//   contagion  simplicial contagion, SIS with pairwise and triangle infection
//              (after Iacopini, Petri, Barrat & Latora 2019)
//   rnn        a random recurrent rate network, projected on its top two
//              principal components; two inputs that share a component
//   flock      the Vicsek model of collective motion
//   dust       Brownian motes, for the quietest section
//   waves      the damped 2-D wave equation with one pulsing source
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const STEEL = '168,197,229', WHITE = '237,240,245';
  const rand = Math.random;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(TAU * rand());
  const narrow = () => innerWidth < 760;

  // A soft halo, drawn additively, for the few points that should glow.
  const HALO = (() => {
    const c = document.createElement('canvas'), g = c.getContext('2d'), r = 32;
    c.width = c.height = r * 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, `rgba(${STEEL},0.9)`); grad.addColorStop(0.25, `rgba(${STEEL},0.25)`); grad.addColorStop(1, `rgba(${STEEL},0)`);
    g.fillStyle = grad; g.fillRect(0, 0, r * 2, r * 2);
    return c;
  })();
  function glow(ctx, x, y, radius, a) {
    if (a < 0.01) return;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(HALO, x - radius, y - radius, radius * 2, radius * 2);
    ctx.restore();
  }

  // Coupled oscillators: the lattice from engine.js, as sparse glyphs whose
  // density follows phase and whose brightness follows local order.
  function field({density = 0.6, gain = 1.1, label = 'Coupled oscillators'} = {}) {
    const RAMP = ' .·:-=+*#%@', P = {k1: 0.9, k2: 0, kg: 0, noise: 0.15, spread: 0.55, pace: [0, 0, 0]};
    let m = null, size = 18, seeds = null, ink = null, debt = 0;
    return {
      label,
      resize(w, h) {
        size = w < 600 ? 15 : 18;
        const cols = Math.ceil(w / size), rows = Math.ceil(h / size);
        if (m && m.cols === cols && m.rows >= rows) return;
        m = window.Flow.createMedium(cols, rows); m.tune(P);
        seeds = Float32Array.from({length: m.n}, rand); ink = new Float32Array(m.n);
      },
      step(dt) { debt += dt * 1.6; while (debt >= 1 / 30) { m.step(P); debt -= 1 / 30; } },
      draw(ctx, alpha, clear) {
        m.measure();
        const {theta, order, cols, n} = m, levels = Array.from({length: 8}, () => []), hot = [];
        for (let i = 0; i < n; i++) {
          if (seeds[i] > density) continue;
          const crest = (1 + Math.cos(theta[i])) / 2;
          ink[i] += (0.15 + 0.4 * order[i] + 0.45 * crest - ink[i]) * 0.08;
          const x = ((i % cols) + 0.5) * size, y = (Math.floor(i / cols) + 0.5) * size;
          const o = alpha * ink[i] * clear(x, y) * gain;
          if (o >= 0.012) levels[Math.min(7, Math.floor(o / 0.09))].push(i);
          // Where a synchronised patch crests, a few glyphs flare white.
          if (crest > 0.985 && order[i] > 0.8 && seeds[i] < density * 0.25) hot.push(i);
        }
        ctx.font = `${Math.round(size * 0.82)}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const glyph = (i) => RAMP[Math.max(1, Math.round((1 + Math.cos(theta[i])) / 2 * 10))];
        levels.forEach((list, b) => {
          ctx.fillStyle = `rgba(${STEEL},${((b + 0.5) * 0.09).toFixed(3)})`;
          for (const i of list) ctx.fillText(glyph(i), ((i % cols) + 0.5) * size, (Math.floor(i / cols) + 0.5) * size);
        });
        for (const i of hot) {
          const x = ((i % cols) + 0.5) * size, y = (Math.floor(i / cols) + 0.5) * size, c = alpha * clear(x, y);
          ctx.fillStyle = `rgba(${WHITE},${(0.85 * c).toFixed(3)})`; ctx.fillText(glyph(i), x, y);
          glow(ctx, x, y, size * 0.9, 0.18 * c);
        }
      },
      hud: () => `${m.n} oscillators`
    };
  }

  // Simplicial contagion on a 3-nearest-neighbour geometric graph and the
  // triangles it closes. A susceptible node is infected along each edge to an
  // infected neighbour (β) and through each triangle whose two other corners
  // are infected (β△); infected nodes recover (μ). With these rates the group
  // term is what lets an outbreak take hold: from the same seed cluster, ~30%
  // active after 20 s with triangles; without them most runs die out.
  function contagion() {
    const B = 0.02, BT = 0.35, MU = 0.05, TICK = 0.08;
    let nodes = [], edges = [], tris = [], nb = [], triOf = [], w = 0, h = 0, clock = 0, t = 0;
    function build() {
      const n = narrow() ? 90 : 150;
      nodes = Array.from({length: n}, () => ({x: rand() * w, y: rand() * h, ph: rand() * TAU, on: false, flash: 0}));
      const sets = nodes.map(() => new Set());
      nodes.forEach((a, i) => nodes.map((b, j) => [Math.hypot(a.x - b.x, a.y - b.y), j]).sort((p, q) => p[0] - q[0]).slice(1, 4).forEach(([, j]) => { sets[i].add(j); sets[j].add(i); }));
      nb = sets.map(s => [...s]);
      edges = []; nb.forEach((list, i) => list.forEach(j => { if (i < j) edges.push([i, j]); }));
      tris = []; for (const [i, j] of edges) for (const k of nb[i]) if (k > j && sets[j].has(k)) tris.push([i, j, k]);
      triOf = nodes.map(() => []); tris.forEach(tri => tri.forEach(v => triOf[v].push(tri)));
      seed();
    }
    function nearest(x, y) { let best = 0, d = Infinity; nodes.forEach((n, i) => { const e = Math.hypot(n.x - x, n.y - y); if (e < d) { d = e; best = i; } }); return best; }
    // Seeds a node and its two-hop neighbourhood: with group infection the
    // model is bistable, and a seed needs a critical mass to take hold.
    function seed(x = rand() * w, y = rand() * h) {
      const i = nearest(x, y), ring = new Set([i, ...nb[i]]);
      for (const j of nb[i]) for (const k of nb[j]) ring.add(k);
      ring.forEach(j => { nodes[j].on = true; nodes[j].flash = 1; });
    }
    function update() {
      const next = nodes.map(n => n.on);
      nodes.forEach((n, i) => {
        if (n.on) { if (rand() < MU) next[i] = false; return; }
        let escape = 1;
        for (const j of nb[i]) if (nodes[j].on) escape *= 1 - B;
        for (const tri of triOf[i]) { const [a, b] = tri.filter(v => v !== i); if (nodes[a].on && nodes[b].on) escape *= 1 - BT; }
        if (rand() > escape) { next[i] = true; n.flash = 1; }
      });
      next.forEach((v, i) => { nodes[i].on = v; });
      if (nodes.filter(n => n.on).length < nodes.length * 0.03) seed();
    }
    const pos = (n) => [n.x + Math.sin(t * 0.25 + n.ph) * 4, n.y + Math.cos(t * 0.21 + n.ph) * 4];
    return {
      label: 'Simplicial contagion',
      resize(W, H) { if (Math.abs(W - w) < 40 && Math.abs(H - h) < 160 && nodes.length) return; w = W; h = H; build(); },
      enter() { nodes.forEach(n => { n.on = false; }); seed(); },
      step(dt) {
        t += dt; clock += dt;
        while (clock >= TICK) { update(); clock -= TICK; }
        nodes.forEach(n => { n.flash = Math.max(0, n.flash - dt * 1.5); });
      },
      draw(ctx, alpha, clear) {
        const P = nodes.map(pos);
        // Triangles light up when all three corners are active: a group, firing.
        for (const [a, b, c] of tris) {
          if (!(nodes[a].on && nodes[b].on && nodes[c].on)) continue;
          const cx = (P[a][0] + P[b][0] + P[c][0]) / 3, cy = (P[a][1] + P[b][1] + P[c][1]) / 3;
          ctx.fillStyle = `rgba(${STEEL},${(0.15 * alpha * clear(cx, cy)).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(...P[a]); ctx.lineTo(...P[b]); ctx.lineTo(...P[c]); ctx.closePath(); ctx.fill();
        }
        for (const [a, b] of edges) {
          const hot = nodes[a].on && nodes[b].on, mx = (P[a][0] + P[b][0]) / 2, my = (P[a][1] + P[b][1]) / 2;
          ctx.lineWidth = hot ? 0.9 : 0.6;
          ctx.strokeStyle = `rgba(${STEEL},${((hot ? 0.5 : 0.1) * alpha * clear(mx, my)).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(...P[a]); ctx.lineTo(...P[b]); ctx.stroke();
        }
        ctx.lineWidth = 0.8;
        nodes.forEach((n, i) => {
          const [x, y] = P[i], c = alpha * clear(x, y);
          ctx.fillStyle = n.on ? `rgba(${WHITE},${(0.95 * c).toFixed(3)})` : `rgba(${STEEL},${(0.4 * c).toFixed(3)})`;
          ctx.beginPath(); ctx.arc(x, y, n.on ? 1.9 : 1.2, 0, TAU); ctx.fill();
          if (n.on) glow(ctx, x, y, 9 + 10 * n.flash, (0.22 + 0.4 * n.flash) * c);
          if (n.flash > 0) {
            ctx.strokeStyle = `rgba(${STEEL},${(0.6 * n.flash * c).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(x, y, 2 + 14 * (1 - n.flash), 0, TAU); ctx.stroke();
          }
        });
      },
      hud: () => `${Math.round(nodes.filter(n => n.on).length / Math.max(1, nodes.length) * 100)}% active`,
      poke(x, y) { seed(x, y); }
    };
  }

  // A random recurrent rate network, dx/dt = −x + J·tanh(x) + u, with gain 1.6
  // (rich, chaotic dynamics). Each trial: a shared trunk with no input, then
  // the same states driven by each of five inputs, any two of which share
  // half their direction.
  // Activity is projected on the top two principal components of a
  // reference trial.
  function rnn() {
    const N = 60, G = 1.6, DTM = 0.08, RATE = 30, TRUNK = 45, BRANCH = 150, REST = 30;
    const J = Float64Array.from({length: N * N}, () => gauss() * G / Math.sqrt(N));
    const vec = () => Float64Array.from({length: N}, gauss);
    const common = vec(), inputs = Array.from({length: 5}, vec).map(own => Float64Array.from(own, (v, i) => 1.1 * (0.7 * common[i] + 0.7 * v)));
    const stepNet = (x, u) => {
      const r = x.map(Math.tanh), y = new Float64Array(N);
      for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += J[i * N + j] * r[j]; y[i] = x[i] + DTM * (-x[i] + s + (u ? u[i] : 0)); }
      return y;
    };
    // Warm up onto the network's own activity, run one reference trial, and
    // take its top two principal components by power iteration.
    let x = vec().map(v => v * 0.5);
    for (let k = 0; k < 300; k++) x = stepNet(x, null);
    const base = x, samples = [];
    for (let k = 0; k < TRUNK; k++) { x = stepNet(x, null); samples.push(x); }
    for (const u of inputs) { let y = x; for (let k = 0; k < BRANCH; k++) { y = stepNet(y, u); samples.push(y); } }
    const mean = new Float64Array(N); samples.forEach(s => s.forEach((v, i) => { mean[i] += v / samples.length; }));
    const C = new Float64Array(N * N);
    samples.forEach(s => { for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) C[i * N + j] += (s[i] - mean[i]) * (s[j] - mean[j]); });
    const pcs = [];
    for (let c = 0; c < 2; c++) {
      let v = vec();
      for (let it = 0; it < 80; it++) {
        const y = new Float64Array(N);
        for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < N; j++) s += C[i * N + j] * v[j]; y[i] = s; }
        pcs.forEach(p => { const d = y.reduce((a, yi, i) => a + yi * p[i], 0); y.forEach((_, i) => { y[i] -= d * p[i]; }); });
        const norm = Math.hypot(...y); v = y.map(yi => yi / norm);
      }
      pcs.push(v);
    }
    const project = s => pcs.map(p => s.reduce((a, si, i) => a + (si - mean[i]) * p[i], 0));
    const span = [0, 1].map(c => { const vals = samples.map(s => project(s)[c]), lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.12; return [lo - pad, hi + pad]; });
    // Each trial runs a bundle of noisy copies: hairlines that share a trunk,
    // then split into one bundle per input.
    const K = narrow() ? 3 : 5, kick = s => s.map(v => v + gauss() * 0.03);
    let threads = [], ghosts = [], phase = 0, clock = 0, trial = 0;
    function begin() {
      ghosts = threads.map(t => ({pts: t.pts, fade: 1}));
      threads = Array.from({length: K}, () => { const s = base.map(v => v + gauss() * 0.3); return {s, pts: [project(s)], branch: -1}; });
      phase = 0; trial++;
    }
    function advance() {
      phase++;
      if (phase <= TRUNK) {
        threads.forEach(t => { t.s = kick(stepNet(t.s, null)); t.pts.push(project(t.s)); });
        if (phase === TRUNK) threads = threads.concat(...threads.map(t => inputs.map((_, b) => ({s: t.s, pts: [t.pts.at(-1)], branch: b}))));
      } else if (phase <= TRUNK + BRANCH) {
        threads.forEach(t => { if (t.branch < 0) return; t.s = kick(stepNet(t.s, inputs[t.branch])); t.pts.push(project(t.s)); });
      } else if (phase > TRUNK + BRANCH + REST) begin();
    }
    begin();
    const box = (w, h) => narrow() ? [w * 0.08, h * 0.56, w * 0.92, h * 0.92] : [w * 0.07, h * 0.18, w * 0.45, h * 0.8];
    let W = 0, H = 0;
    return {
      label: 'Recurrent network, five inputs',
      resize(w, h) { W = w; H = h; },
      enter() { begin(); },
      step(dt) {
        clock += dt * RATE;
        while (clock >= 1) { advance(); clock -= 1; }
        ghosts.forEach(g => { g.fade -= dt * 0.25; });
      },
      draw(ctx, alpha, clear) {
        const [x0, y0, x1, y1] = box(W, H);
        const map = ([a, b]) => [x0 + (a - span[0][0]) / (span[0][1] - span[0][0]) * (x1 - x0), y1 - (b - span[1][0]) / (span[1][1] - span[1][0]) * (y1 - y0)];
        // Axes, as thin ticks, and their names.
        // Axes in short pieces, so they fade where they pass near content.
        ctx.lineWidth = 0.6;
        const axis = (ax, ay, bx, by) => {
          const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 24);
          for (let k = 0; k < n; k++) {
            const p = [ax + (bx - ax) * k / n, ay + (by - ay) * k / n], q = [ax + (bx - ax) * (k + 1) / n, ay + (by - ay) * (k + 1) / n];
            ctx.strokeStyle = `rgba(${STEEL},${(0.3 * alpha * clear((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)).toFixed(3)})`;
            ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke();
          }
        };
        axis(x0, y0, x0, y1); axis(x0, y1, x1, y1);
        ctx.font = `10px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = `rgba(${STEEL},${(0.5 * alpha * clear(x1 - 13, y1 + 11)).toFixed(3)})`; ctx.fillText('PC 1', x1 - 26, y1 + 6);
        ctx.fillStyle = `rgba(${STEEL},${(0.5 * alpha * clear(x0 - 11, y0 + 15)).toFixed(3)})`;
        ctx.save(); ctx.translate(x0 - 16, y0 + 28); ctx.rotate(-Math.PI / 2); ctx.fillText('PC 2', 0, 0); ctx.restore();
        // A hairline in short runs, brighter towards its recent end.
        const trace = (pts, a) => {
          ctx.lineWidth = 0.7;
          for (let k = 0; k < pts.length - 1; k += 8) {
            const run = pts.slice(k, k + 9).map(map), [mx, my] = run[run.length >> 1];
            ctx.strokeStyle = `rgba(${STEEL},${(a * (0.15 + 0.6 * (k + 8) / pts.length) * clear(mx, my)).toFixed(3)})`;
            ctx.beginPath(); ctx.moveTo(...run[0]); run.slice(1).forEach(p => ctx.lineTo(...p)); ctx.stroke();
          }
        };
        ghosts.forEach(g => trace(g.pts, alpha * 0.4 * Math.max(0, g.fade)));
        threads.forEach(t => trace(t.pts, alpha));
        // Heads: a point per thread while it moves; a glow and a name per bundle.
        const live = threads.filter(t => phase <= TRUNK ? t.branch < 0 : t.branch >= 0);
        live.forEach(t => { const [hx, hy] = map(t.pts.at(-1)); ctx.fillStyle = `rgba(${WHITE},${(0.75 * alpha * clear(hx, hy)).toFixed(3)})`; ctx.fillRect(hx - 1, hy - 1, 2, 2); });
        for (const b of phase <= TRUNK ? [-1] : inputs.keys()) {
          const group = live.filter(t => t.branch === b), [hx, hy] = map([0, 1].map(c => group.reduce((s, t) => s + t.pts.at(-1)[c], 0) / group.length)), c = alpha * clear(hx, hy);
          glow(ctx, hx, hy, 22, 0.45 * c);
          if (b >= 0) {
            const flip = hx + 30 > W;
            ctx.fillStyle = `rgba(${STEEL},${(0.65 * c).toFixed(3)})`; ctx.textAlign = flip ? 'right' : 'left';
            ctx.fillText('ABCDE'[b], hx + (flip ? -10 : 10), hy - 14);
          }
        }
      },
      hud: () => `${N} units, trial ${trial}`,
      poke() { begin(); }
    };
  }

  // Couzin's three-zone model of collective motion (Couzin et al. 2002): each
  // individual moves away from anyone too close, aligns with neighbours a
  // little further out, and is drawn towards those beyond, all within a
  // 300° field of view and with a limited turning rate. The width of the
  // alignment zone sets the state, with memory: with no alignment, groups
  // gather as swarms; widening it from there curls some of them into
  // rotating mills (from a parallel start they would stay parallel); wide,
  // they stream. Each visit starts scattered and cycles: swarm, widen, mills
  // come and go, a brief stream, swarm again. The world is simulated larger
  // than the screen, with proportionally more individuals, and drawn at 0.8:
  // more room means more groups, so more of them mill at once. (Scratch
  // runs, 6 of 6: 3 to 11 mills at a time on average in the medium phase;
  // a 270° view or a smaller world gives far fewer.)
  function flock() {
    const RR = 10, RA = 140, SPEED = 2, TURN = 0.07, NOISE = 0.065, RATE = 55, FOV = Math.cos(5 / 6 * Math.PI);
    let ps = [], w = 0, h = 0, ro = RR, since = 0, clock = 0, tick = 0, zoom = 1;
    const wrap = (d, L) => d > L / 2 ? d - L : d < -L / 2 ? d + L : d;
    function build() { const n = Math.round(w * h * 420 / (1440 * 900)); ps = Array.from({length: n}, () => ({x: rand() * w, y: rand() * h, a: rand() * TAU, align: 0, tr: []})); }
    function update() {
      const gc = Math.max(1, Math.floor(w / RA)), gr = Math.max(1, Math.floor(h / RA)), cw = w / gc, ch = h / gr;
      const cells = Array.from({length: gc * gr}, () => []);
      ps.forEach(p => cells[Math.min(gr - 1, Math.floor(p.y / ch)) * gc + Math.min(gc - 1, Math.floor(p.x / cw))].push(p));
      const next = ps.map(p => {
        const hx = Math.cos(p.a), hy = Math.sin(p.a), gx = Math.min(gc - 1, Math.floor(p.x / cw)), gy = Math.min(gr - 1, Math.floor(p.y / ch));
        let rx = 0, ry = 0, nr = 0, ox = hx, oy = hy, no = 1, ax = 0, ay = 0, na = 0;
        const seen = gc < 3 || gr < 3 ? new Set() : null;   // tiny grids wrap onto themselves
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const k = ((gy + dy + gr) % gr) * gc + (gx + dx + gc) % gc;
          if (seen) { if (seen.has(k)) continue; seen.add(k); }
          for (const q of cells[k]) {
            if (q === p) continue;
            const ddx = wrap(q.x - p.x, w), ddy = wrap(q.y - p.y, h), d2 = ddx * ddx + ddy * ddy;
            if (d2 >= RA * RA || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const ux = ddx / d, uy = ddy / d;
            if (d < RR) { rx -= ux; ry -= uy; nr++; continue; }
            if (ux * hx + uy * hy < FOV) continue;
            if (d < ro) { ox += Math.cos(q.a); oy += Math.sin(q.a); no++; } else { ax += ux; ay += uy; na++; }
          }
        }
        let tx = ox, ty = oy;
        if (nr) { tx = rx; ty = ry; }
        else if (na && no > 1) { const on = Math.hypot(ox, oy) || 1, an = Math.hypot(ax, ay) || 1; tx = ox / on + ax / an; ty = oy / on + ay / an; }
        else if (na) { tx = ax; ty = ay; }
        const turn = Math.max(-TURN, Math.min(TURN, ((Math.atan2(ty, tx) - p.a + 3 * Math.PI) % TAU) - Math.PI));
        return {a: p.a + turn + NOISE * gauss(), align: no > 1 ? Math.hypot(ox, oy) / no : 0};
      });
      // Each keeps a short trail of where it has been, cut where it wraps.
      tick++;
      ps.forEach((p, i) => {
        p.a = next[i].a; p.align += (next[i].align - p.align) * 0.1;
        p.x += Math.cos(p.a) * SPEED; p.y += Math.sin(p.a) * SPEED;
        const out = p.x < 0 || p.x >= w || p.y < 0 || p.y >= h;
        p.x = (p.x + w) % w; p.y = (p.y + h) % h;
        if (out) p.tr = [];
        else if (tick % 3 === 0) { p.tr.push(p.x, p.y); if (p.tr.length > 32) p.tr.splice(0, 2); }
      });
    }
    return {
      label: 'Three-zone collective motion',
      resize(W, H) { zoom = 0.8; if (Math.abs(W / zoom - w) < 40 && Math.abs(H / zoom - h) < 160 && ps.length) return; w = W / zoom; h = H / zoom; build(); },
      enter() { build(); since = 0; },
      step(dt) {
        since += dt;
        const c = since % 45, ramp = (a, b, t0, t1) => a + (b - a) * (c - t0) / (t1 - t0);
        ro = c < 5 ? RR : c < 10 ? ramp(RR, 22, 5, 10) : c < 35 ? 22 : c < 40 ? ramp(22, 55, 35, 40) : ramp(55, RR, 40, 45);
        clock += dt * RATE;
        while (clock >= 1) { update(); clock -= 1; }
      },
      // Each individual a trail, faint at its old end and brighter where its
      // neighbours agree: mills draw as rings of arcs, streams as lines. A
      // faint additive glow each, so dense groups bloom.
      draw(ctx, alpha, clear) {
        ctx.save(); ctx.scale(zoom, zoom);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const p of ps) {
          const c = alpha * clear(p.x * zoom, p.y * zoom), n = p.tr.length;
          if (c < 0.01 || n < 4) continue;
          const o = (0.4 + 0.5 * p.align) * c, mid = (n >> 2) * 2;
          ctx.lineWidth = 0.75 / zoom; ctx.strokeStyle = `rgba(${STEEL},${(o * 0.35).toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(p.tr[0], p.tr[1]); for (let k = 2; k <= mid; k += 2) ctx.lineTo(p.tr[k], p.tr[k + 1]); ctx.stroke();
          ctx.lineWidth = 1.1 / zoom; ctx.strokeStyle = `rgba(${STEEL},${o.toFixed(3)})`;
          ctx.beginPath(); ctx.moveTo(p.tr[mid], p.tr[mid + 1]); for (let k = mid + 2; k < n; k += 2) ctx.lineTo(p.tr[k], p.tr[k + 1]); ctx.lineTo(p.x, p.y); ctx.stroke();
          glow(ctx, p.x, p.y, 9, 0.06 * c);
        }
        ctx.restore();
      },
      hud: () => `alignment zone ${Math.round(ro)} px`,
      // A click is a startle: everyone nearby turns away from it.
      poke(x, y) { x /= zoom; y /= zoom; ps.forEach(p => { const d = Math.hypot(p.x - x, p.y - y); if (d < 100) p.a = Math.atan2(p.y - y, p.x - x) + 0.3 * gauss(); }); }
    };
  }

  // Brownian motes: nearly nothing, for the map.
  function dust() {
    let ps = [], w = 0, h = 0;
    return {
      label: 'Brownian drift',
      resize(W, H) { w = W; h = H; if (!ps.length) ps = Array.from({length: 70}, () => ({x: rand() * W, y: rand() * H, s: 0.3 + rand() * 0.7})); },
      step(dt) { ps.forEach(p => { p.x = (p.x + gauss() * 6 * Math.sqrt(dt) + w) % w; p.y = (p.y + gauss() * 6 * Math.sqrt(dt) + h) % h; }); },
      draw(ctx, alpha, clear) {
        ps.forEach(p => { ctx.fillStyle = `rgba(${STEEL},${(0.22 * p.s * alpha * clear(p.x, p.y)).toFixed(3)})`; ctx.fillRect(p.x, p.y, 1.4, 1.4); });
      },
      hud: () => ''
    };
  }

  // The damped 2-D wave equation on a coarse grid. Two sources take turns,
  // like two voices. The equation is linear, so each source runs in its own
  // field and the physical wave is their sum; drawing them apart keeps both
  // sets of rings legible where they cross. A click starts a third. The grid
  // runs past the screen, and an absorbing margin out there keeps
  // reflections out of view. Each wavefront is one hairline: the zero level
  // of the field (marching squares) where it is rising, so one line per
  // wavelength, fading with a decaying envelope of the amplitude.
  function waves() {
    const CELL = 9, PAD = 40, SPONGE = 30, C2 = 0.22, DAMP = 0.997, RATE = 24, PERIOD = 30, TURN = 5;
    let cols = 0, rows = 0, fields = [], edge = null, clock = 0, t = 0, src = [], voice = [0, 0];
    const make = () => ({u: new Float32Array(cols * rows), v: new Float32Array(cols * rows), env: new Float32Array(cols * rows)});
    function drop(f, cx, cy, amp) {
      for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
        const gx = Math.round(cx) + x, gy = Math.round(cy) + y;
        if (gx > 0 && gy > 0 && gx < cols - 1 && gy < rows - 1) f.u[gy * cols + gx] += amp * Math.exp(-(x * x + y * y) / 2);
      }
    }
    function update(f) {
      const {u, v, env} = f, next = new Float32Array(cols * rows);
      for (let y = 1; y < rows - 1; y++) for (let x = 1; x < cols - 1; x++) {
        const i = y * cols + x, lap = u[i - 1] + u[i + 1] + u[i - cols] + u[i + cols] - 4 * u[i];
        next[i] = (2 * u[i] - v[i] + C2 * lap) * DAMP * edge[i];
        env[i] = Math.max(Math.abs(next[i]), env[i] * 0.98);
      }
      f.v = u; f.u = next;
    }
    function contours({u, v, env}, paths, clear) {
      for (let y = PAD - 1; y < rows - PAD; y++) for (let x = PAD - 1; x < cols - PAD; x++) {
        const i = y * cols + x, a = u[i], b = u[i + 1], c = u[i + cols + 1], d = u[i + cols];
        const mask = (a > 0) | (b > 0) << 1 | (c > 0) << 2 | (d > 0) << 3;
        if (mask === 0 || mask === 15) continue;
        const e = (env[i] + env[i + 1] + env[i + cols] + env[i + cols + 1]) / 4;
        if (e < 0.03 || a + b + c + d <= v[i] + v[i + 1] + v[i + cols + 1] + v[i + cols]) continue;
        const X = (x - PAD) * CELL, Y = (y - PAD) * CELL, o = Math.min(1, (e - 0.03) / 0.06) * clear(X + CELL / 2, Y + CELL / 2);
        if (o < 0.04) continue;
        const pts = [];
        if ((a > 0) !== (b > 0)) pts.push(X + a / (a - b) * CELL, Y);
        if ((b > 0) !== (c > 0)) pts.push(X + CELL, Y + b / (b - c) * CELL);
        if ((d > 0) !== (c > 0)) pts.push(X + d / (d - c) * CELL, Y + CELL);
        if ((a > 0) !== (d > 0)) pts.push(X, Y + a / (a - d) * CELL);
        const path = paths[Math.min(4, Math.floor(o * 5))];
        for (let k = 0; k + 3 < pts.length; k += 4) { path.moveTo(pts[k], pts[k + 1]); path.lineTo(pts[k + 2], pts[k + 3]); }
      }
    }
    return {
      label: 'Waves from two sources',
      resize(w, h) {
        const c = Math.ceil(w / CELL) + 2 * PAD, r = Math.ceil(h / CELL) + 2 * PAD;
        if (c === cols && r === rows) return;
        cols = c; rows = r; fields = [make(), make(), make()];
        // A wide, gentle absorber in the outer cells of the margin (a steep
        // one reflects), leaving clear water around the sources.
        edge = Float32Array.from({length: c * r}, (_, i) => { const x = i % c, y = Math.floor(i / c), d = Math.min(x, y, c - 1 - x, r - 1 - y); return d >= SPONGE ? 1 : 1 - 0.06 * (1 - d / SPONGE) ** 2; });
        src = narrow() ? [[c / 2, PAD + 2], [c / 2, r - PAD - 3]] : [[PAD + 2, r * 0.55], [c - PAD - 3, r * 0.55]];
      },
      step(dt) {
        clock += dt * RATE;
        while (clock >= 1) {
          t++; clock -= 1;
          // Each voice fades in for its turn and out after it, so the turns overlap.
          const turn = Math.floor(t / (RATE * TURN)) % 2;
          voice = voice.map((g, k) => g + ((k === turn ? 1 : 0) - g) * 0.02);
          src.forEach(([x, y], k) => drop(fields[k], x, y, 0.3 * voice[k] * Math.sin(TAU * t / PERIOD)));
          fields.forEach(update);
        }
      },
      draw(ctx, alpha, clear) {
        const paths = Array.from({length: 5}, () => new Path2D());
        fields.forEach(f => contours(f, paths, clear));
        ctx.lineWidth = 0.9;
        paths.forEach((path, b) => { ctx.strokeStyle = `rgba(${STEEL},${((b + 0.5) / 5 * 0.6 * alpha).toFixed(3)})`; ctx.stroke(path); });
        src.forEach(([x, y], k) => glow(ctx, (x - PAD) * CELL, (y - PAD) * CELL, 26, 0.5 * voice[k] * alpha));
      },
      hud: () => `voice ${voice[0] > voice[1] ? 'A' : 'B'}`,
      poke(x, y) { drop(fields[2], x / CELL + PAD, y / CELL + PAD, 2); }
    };
  }

  let MONO = 'monospace';

  // The director: picks the scene for the section being read, crossfades,
  // keeps a soft clearing around content, and forwards clicks.
  function start({canvas, quietZones = () => []}) {
    MONO = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    const ctx = canvas.getContext('2d');
    const sections = [...document.querySelectorAll('[data-scene]')];
    const label = document.querySelector('#regime-label');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const scenes = {field: field(), quiet: field({density: 0.3, gain: 0.75, label: 'Coupled oscillators, at rest'}), contagion: contagion(), rnn: rnn(), flock: flock(), dust: dust(), waves: waves()};
    const weight = Object.fromEntries(Object.keys(scenes).map(k => [k, 0]));
    let active = null, section = null, width = 0, height = 0, frame = 0, last = 0, paused = false, dirty = true, zones = [];

    function resize() {
      const box = canvas.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
      width = box.width; height = box.height;
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      Object.values(scenes).forEach(s => s.resize(width, height));
      dirty = true;
    }

    // A broad Gaussian falloff around content: no hard edge at any box.
    function clear(x, y) {
      let c = 1;
      const f = width < 600 ? 42 : 72;
      for (const b of zones) {
        const dx = Math.max(b.left - x, 0, x - b.right), dy = Math.max(b.top - y, 0, y - b.bottom);
        c = Math.min(c, 1 - 0.97 * Math.exp(-(dx * dx + dy * dy) / (2 * f * f)));
      }
      return c;
    }

    function choose() {
      dirty = false;
      zones = quietZones() || [];
      const line = innerHeight * 0.45, atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
      const hit = atEnd ? sections.at(-1) : sections.find(s => { const b = s.getBoundingClientRect(); return b.top <= line && b.bottom > line; }) || sections[0];
      if (!hit) return;
      if (hit.id !== section) { section = hit.id; document.dispatchEvent(new CustomEvent('flow:section', {detail: {id: section}})); }
      const next = scenes[hit.dataset.scene] ? hit.dataset.scene : 'field';
      if (next === active) return;
      active = next;
      scenes[active].enter?.();
      if (label) label.textContent = scenes[active].label;
      if (reduced.matches) { weight[active] = 1; Object.keys(weight).forEach(k => { if (k !== active) weight[k] = 0; }); scenes[active].step(4); render(); }
    }

    function render() {
      ctx.clearRect(0, 0, width, height);
      for (const [name, s] of Object.entries(scenes)) if (weight[name] > 0.01) s.draw(ctx, weight[name], clear);
    }

    function tick(time) {
      frame = 0;
      if (document.hidden || reduced.matches || paused) { last = 0; return; }
      const dt = last ? Math.min(time - last, 50) / 1000 : 0;
      last = time;
      if (dirty) choose();
      for (const name of Object.keys(scenes)) {
        weight[name] += ((name === active ? 1 : 0) - weight[name]) * Math.min(1, dt / 0.6);
        if (weight[name] > 0.01 && dt) scenes[name].step(dt);
      }
      render();
      frame = requestAnimationFrame(tick);
    }

    function run() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; last = 0;
      if (reduced.matches) { active = null; choose(); }
      else if (!document.hidden && !paused) frame = requestAnimationFrame(tick);
    }

    canvas.addEventListener('pointerdown', (event) => {
      const b = canvas.getBoundingClientRect();
      scenes[active]?.poke?.(event.clientX - b.left, event.clientY - b.top);
      if (!frame) render();
    });
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', run);
    reduced.addEventListener('change', run);
    resize();
    choose();
    Object.keys(weight).forEach(k => { weight[k] = k === active ? 1 : 0; });
    render();
    run();
    // Testing aid: run the current scene for some seconds without drawing.
    const api = {
      refresh() { dirty = true; if (!frame) { choose(); render(); } },
      toggle() { paused = !paused; run(); },
      isPaused: () => paused || reduced.matches,
      settle(seconds) { choose(); Object.keys(weight).forEach(k => { weight[k] = k === active ? 1 : 0; }); for (let k = 0; k < seconds * 30; k++) scenes[active].step(1 / 30); render(); return scenes[active].hud(); }
    };
    window.Scenes.current = api;
    return api;
  }

  window.Scenes = {start};
})();
