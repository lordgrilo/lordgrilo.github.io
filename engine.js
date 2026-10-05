// Engine: one physical system behind the whole page. A periodic
// triangulated lattice of phase oscillators with pairwise Kuramoto coupling
// (k1), triadic coupling on every triangle (k2, after Skardal & Arenas),
// all-to-all mean-field coupling (kg, as in Kuramoto's original model),
// pacemakers and noise. Each section of the page names a regime; parameters
// ease towards it as you scroll. Illustrative, not data.
//
// A regime can also: write order where the layout says (write), hide cells
// below a local order (quiet) so only structure shows, draw what it writes
// fainter or brighter (lit), and swap the oscillators for a different
// picture altogether (render: 'paths', a branching path in two dimensions).
(() => {
  'use strict';
  const TAU = Math.PI * 2, DT = 1 / 30, BASE = TAU * 0.15;
  const RAMP = ' .·:-=+*#%@', FLOOR = 3;
  // Default pacemaker slots, as fractions of the medium. Slots 0 and 2 drive
  // the interference regime, slot 1 the broadcast one.
  const SLOTS = [[0.22, 0.5], [0.5, 0.5], [0.78, 0.5]];
  const KEYS = ['k1', 'k2', 'kg', 'noise', 'spread', 'speed'];
  const still = {k2: 0, kg: 0, pace: [0, 0, 0]};
  // Wave regimes: phase waves from a pacemaker have wavenumber ~ √(Δω/D), so a
  // weak drive on strong coupling gives rings ~10 cells apart; they travel
  // slowly (~√(Δω·D) cells per unit time), hence the higher speed.
  const REGIMES = {
    pairs: {...still, label: 'Pairs only', note: 'Local, patchy order.', k1: 0.9, noise: 0.15, spread: 0.55, speed: 2.5, quiet: 0.35},
    memory: {...still, label: 'Pairs and triangles', note: 'Order, once written, is kept.', k1: 0.3, k2: 6, noise: 0.6, spread: 0.3, speed: 2.5, write: true, quiet: 0.45, lit: 0.7},
    interference: {...still, label: 'Two drives, one medium', note: 'Their waves collide where they meet.', k1: 3, noise: 0.02, spread: 0.04, pace: [0.5, 0, 0.5], speed: 14},
    sync: {...still, label: 'Everyone hears everyone', note: 'Many units, one rhythm.', k1: 1.2, kg: 2.2, noise: 0.05, spread: 0.12, speed: 3},
    paths: {...still, label: 'Low-dimensional activity', note: 'A shared path, branching as tasks part ways.', k1: 0.9, noise: 0.15, spread: 0.55, speed: 2.5, render: 'paths'},
    network: {...still, label: 'A network of minds', note: 'Coupled along their links, the nodes keep time together.', k1: 0.2, noise: 0.3, spread: 0.4, speed: 2.5, write: true, quiet: 2, lit: 1.6},
    skeleton: {...still, label: 'Pairs and triangles', note: 'Only the map’s edges are written; the face stays empty.', k1: 0.3, k2: 6, noise: 0.6, spread: 0.3, speed: 2.5, write: true, quiet: 2, lit: 0.55},
    broadcast: {...still, label: 'One source', note: 'A signal spreads as waves.', k1: 3, noise: 0.02, spread: 0.04, pace: [0, 0.55, 0], speed: 14, lit: 0.8},
    rest: {...still, label: 'At rest', note: 'Weak noise, gentle order.', k1: 1.0, k2: 1.5, noise: 0.05, spread: 0.2, speed: 2, quiet: 0.3}
  };

  // Editorial background: the same medium, read as a quiet texture. density
  // is the share of cells drawn, contrast their brightness, persistence how
  // many seconds the marks take to follow the field. The paths regime thins
  // the field so its path reads; the map (skeleton) is nearly empty.
  const AMBIENT = {
    pairs:        {density: 0.50, contrast: 0.90, persistence: 0.9},
    memory:       {density: 0.56, contrast: 1.00, persistence: 1.6},
    sync:         {density: 0.48, contrast: 1.00, persistence: 1.0},
    interference: {density: 0.50, contrast: 0.95, persistence: 1.0},
    paths:        {density: 0.30, contrast: 0.70, persistence: 1.0},
    network:      {density: 0.45, contrast: 0.95, persistence: 1.2},
    skeleton:     {density: 0.18, contrast: 0.60, persistence: 1.4},
    broadcast:    {density: 0.55, contrast: 0.95, persistence: 0.9},
    rest:         {density: 0.32, contrast: 0.75, persistence: 1.6}
  };
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
  const hash = value => { const n = Math.sin(value * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

  function gauss() { return Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random()); }

  function createMedium(cols, rows, slots = SLOTS) {
    const n = cols * rows;
    const theta = Float64Array.from({length: n}, () => Math.random() * TAU);
    const g = Float64Array.from({length: n}, gauss);
    const omega = new Float64Array(n), rate = new Float64Array(n);
    const s = new Float64Array(n), c = new Float64Array(n), sumS = new Float64Array(n), sumC = new Float64Array(n), order = new Float64Array(n);
    const held = new Uint8Array(n);   // cells written in the latest step
    const at = (x, y) => ((y + rows) % rows) * cols + (x + cols) % cols;
    const edges = new Int32Array(n * 6), triangles = new Int32Array(n * 6);
    const reach = Math.max(3, Math.min(cols, rows) * 0.06);
    const bumps = slots.map(([fx, fy]) => Float64Array.from({length: n}, (_, i) =>
      Math.exp(-(((i % cols) - fx * cols) ** 2 + (Math.floor(i / cols) - fy * rows) ** 2) / (2 * reach * reach))));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = at(x, y), right = at(x + 1, y), down = at(x, y + 1), diagonal = at(x + 1, y + 1);
        edges.set([i, right, i, down, i, diagonal], i * 6);
        triangles.set([i, right, diagonal, i, diagonal, down], i * 6);
      }
    }

    function tune(p) {
      for (let i = 0; i < n; i++) omega[i] = BASE + p.spread * g[i] + p.pace[0] * bumps[0][i] + p.pace[1] * bumps[1][i] + p.pace[2] * bumps[2][i];
    }

    function step(p) {
      for (let i = 0; i < n; i++) { s[i] = Math.sin(theta[i]); c[i] = Math.cos(theta[i]); rate[i] = omega[i]; }
      const a1 = p.k1 / 6;
      for (let e = 0; e < edges.length; e += 2) {
        const i = edges[e], j = edges[e + 1];
        const v = a1 * (s[j] * c[i] - c[j] * s[i]);
        rate[i] += v; rate[j] -= v;
      }
      if (p.kg > 0.01) {
        // Mean field: every unit also hears the average, kg·R·sin(ψ − θi).
        let zs = 0, zc = 0;
        for (let i = 0; i < n; i++) { zs += s[i]; zc += c[i]; }
        zs /= n; zc /= n;
        for (let i = 0; i < n; i++) rate[i] += p.kg * (zs * c[i] - zc * s[i]);
      }
      if (p.k2 > 0.01) {
        const a2 = p.k2 / 6;
        for (let t = 0; t < triangles.length; t += 3) {
          const q = triangles[t], r = triangles[t + 1], u = triangles[t + 2];
          rate[q] += a2 * corner(q, r, u); rate[r] += a2 * corner(r, q, u); rate[u] += a2 * corner(u, q, r);
        }
      }
      const kick = p.noise * Math.sqrt(DT);
      for (let i = 0; i < n; i++) theta[i] = (theta[i] + DT * rate[i] + kick * gauss()) % TAU;
    }

    function corner(i, j, k) {   // sin(θj + θk − 2θi)
      const sjk = s[j] * c[k] + c[j] * s[k], cjk = c[j] * c[k] - s[j] * s[k];
      return sjk * (c[i] * c[i] - s[i] * s[i]) - cjk * 2 * s[i] * c[i];
    }

    function measure() {
      for (let i = 0; i < n; i++) { s[i] = Math.sin(theta[i]); c[i] = Math.cos(theta[i]); sumS[i] = s[i]; sumC[i] = c[i]; }
      for (let e = 0; e < edges.length; e += 2) {
        const i = edges[e], j = edges[e + 1];
        sumS[i] += s[j]; sumC[i] += c[j]; sumS[j] += s[i]; sumC[j] += c[i];
      }
      let ordered = 0;
      for (let i = 0; i < n; i++) { order[i] = Math.hypot(sumS[i], sumC[i]) / 7; ordered += order[i] > 0.8; }
      return ordered / n;
    }

    function paint(x0, y0, radius, phase) {
      for (let y = Math.floor(y0 - radius); y <= y0 + radius; y++)
        for (let x = Math.floor(x0 - radius); x <= x0 + radius; x++)
          if ((x - x0) ** 2 + (y - y0) ** 2 <= radius * radius) theta[at(x, y)] = phase ?? Math.random() * TAU;
    }

    function writeRect(x0, y0, x1, y1, phase) {
      for (let y = Math.max(0, y0); y < Math.min(rows, y1); y++)
        for (let x = Math.max(0, x0); x < Math.min(cols, x1); x++) { theta[y * cols + x] = phase; held[y * cols + x] = 1; }
    }

    return {cols, rows, n, theta, order, held, at, tune, step, measure, paint, writeRect};
  }

  // A path through a two-dimensional activity space: one shared trunk that
  // splits about a third of the way across, and whose branches may split again
  // further on, each holding its own heading. Trails fade, so each new tree
  // grows over the ghost of the last. Coordinates are cells; area = {x0, x1,
  // y0, y1}.
  function createPaths(cols, rows) {
    const ink = new Float32Array(cols * rows);
    let walkers = [];
    function deposit(x, y) {
      const cx = Math.round(x), cy = Math.round(y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const px = cx + dx, py = cy + dy;
        if (px < 0 || py < 0 || px >= cols || py >= rows) continue;
        const i = py * cols + px;
        ink[i] = Math.max(ink[i], dx || dy ? 0.4 : 1);
      }
    }
    function step(area) {
      for (let i = 0; i < ink.length; i++) ink[i] *= 0.994;
      const w0 = area.x1 - area.x0, h = area.y1 - area.y0;
      if (!walkers.length) {
        walkers = [{x: area.x0 + 1, y: (area.y0 + area.y1) / 2 + (Math.random() - 0.5) * h * 0.2, a: 0, aim: (Math.random() - 0.5) * 0.2, wobble: 0, depth: 0, split: 0.28}];
      }
      const next = [];
      for (const w of walkers) {
        // Heading relaxes towards the branch's aim, with a little wobble.
        w.wobble = (w.wobble + (Math.random() - 0.5) * 0.012) * 0.95;
        w.a += (w.aim - w.a) * 0.03 + w.wobble;
        w.x += Math.cos(w.a) * 0.22; w.y += Math.sin(w.a) * 0.22;
        if (w.x > area.x1 || w.y < area.y0 || w.y > area.y1) continue;
        deposit(w.x, w.y);
        // Two splits at most: the trunk always parts at 28% of the way, and
        // each branch parts again at 60% with probability 0.7.
        if (w.split && w.x > area.x0 + w.split * w0) {
          const spread = w.depth ? 0.28 : 0.5, again = () => (w.depth === 0 && Math.random() < 0.7 ? 0.6 : 0);
          next.push({...w, aim: w.aim - spread, depth: w.depth + 1, split: again()});
          Object.assign(w, {aim: w.aim + spread, depth: w.depth + 1, split: again()});
        }
        next.push(w);
      }
      walkers = next;
    }
    return {ink, step, count: () => walkers.length};
  }

  // options: canvas, cell (px), alpha (glyph brightness), writer(regime) →
  // [x, y, w, h, phaseLag] rects in canvas pixels to write order into while
  // the regime allows it, slots (pacemaker positions), ease (seconds), clip
  // (draw only inside the current section), paths ([x0, x1] fractions of the
  // width for the low-dimensional path). ambient uses an abstract, slower
  // rendering without written geometry. quietZones() supplies viewport-space
  // rectangles around content; callers can cache them between layout changes.
  function start({canvas, cell = 16, alpha = 1, writer = () => [], slots = SLOTS, ease: easeTime = 0.9, clip = false, paths: pathBand = [0.04, 0.56], ambient = false, quietZones = () => []}) {
    const ctx = canvas.getContext('2d');
    const sections = [...document.querySelectorAll('[data-regime]')];
    const hud = {label: document.querySelector('#regime-label'), note: document.querySelector('#regime-note'), params: document.querySelector('#regime-params')};
    const dots = [...document.querySelectorAll('[data-dot]')];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
    const forced = new URLSearchParams(location.search).get('regime');
    let medium = null, paths = null, width = 0, height = 0, size = cell, regime = REGIMES.pairs, name = 'pairs';
    const p = {...REGIMES.pairs, pace: [...REGIMES.pairs.pace]};
    let phase = 0, debt = 0, ordered = 0, frame = 0, lastTime = 0, lastHud = 0, brush = null, last = null;
    let section = null, sectionEl = null, span = null, layoutDirty = true, paused = false;
    let lastDraw = 0, elapsed = 1 / 30, ink = null, marks = null;
    const mood = {...AMBIENT.pairs};

    function resize() {
      const box = canvas.getBoundingClientRect();
      width = box.width; height = box.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      size = width < 600 ? Math.max(12, cell - 3) : cell;
      const cols = Math.ceil(width / size), rows = Math.ceil(height / size);
      if (!medium || cols !== medium.cols || rows > medium.rows) {
        medium = createMedium(cols, rows, slots); medium.tune(p); paths = createPaths(cols, rows);
        if (ambient) {
          ink = new Float32Array(medium.n);
          marks = Float32Array.from({length: medium.n}, (_, i) => hash(i + 1));
        }
      }
      layoutDirty = true;
      draw();
    }

    function choose() {
      let next = forced && REGIMES[forced] ? forced : null;
      if (!next) {
        const line = innerHeight * 0.45;
        const atEnd = ambient && scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
        const hit = atEnd ? sections[sections.length - 1] : sections.find(sec => { const b = sec.getBoundingClientRect(); return b.top <= line && b.bottom > line; }) || sections[0];
        next = hit?.dataset.regime || 'pairs';
        sectionEl = hit;
        if (hit) { const b = hit.getBoundingClientRect(); span = [b.top / size, b.bottom / size]; }
        dots.forEach(dot => dot.classList.toggle('on', dot.dataset.dot === hit?.id));
        if (hit && hit.id !== section) { section = hit.id; document.dispatchEvent(new CustomEvent('flow:section', {detail: {id: section, regime: next}})); }
      }
      if (next === name) return;
      name = next; regime = REGIMES[name];
      if (hud.label) hud.label.textContent = regime.label;
      if (hud.note) hud.note.textContent = regime.note;
      if (reduced.matches) {
        Object.assign(p, regime, {pace: [...regime.pace]}); medium.tune(p);
        if (ambient) Object.assign(mood, AMBIENT[name] || AMBIENT.pairs);
        for (let k = 0; k < (ambient ? 60 : 240); k++) advance();
        draw();
      }
    }

    // Parameters relax towards the regime: a short ramp, not a jump.
    function ease(seconds) {
      const f = 1 - Math.exp(-seconds / easeTime);
      for (const key of KEYS) p[key] += (regime[key] - p[key]) * f;
      for (let k = 0; k < 3; k++) p.pace[k] += (regime.pace[k] - p.pace[k]) * f;
      medium.tune(p);
      if (ambient) {
        const target = AMBIENT[name] || AMBIENT.pairs;
        const blend = 1 - Math.exp(-seconds / easeTime);
        for (const key of Object.keys(mood)) mood[key] += (target[key] - mood[key]) * blend;
      }
    }

    // The rows to draw: all of them, or only the current section's.
    function band() {
      if (!clip || !sectionEl) return [0, medium.rows];
      const b = sectionEl.getBoundingClientRect();
      return [Math.max(0, Math.ceil(b.top / size) + 1), Math.min(medium.rows, Math.floor(b.bottom / size) - 1)];
    }

    function pathArea() {
      const [r0, r1] = span ? [Math.max(0, Math.ceil(span[0]) + 1), Math.min(medium.rows, Math.floor(span[1]) - 1)] : band();
      return {x0: pathBand[0] * medium.cols, x1: pathBand[1] * medium.cols, y0: r0 + 2, y1: Math.max(r0 + 3, r1 - 2)};
    }

    function advance() {
      medium.held.fill(0);
      if (!ambient && regime.write) for (const [x, y, w, h, lag = 0] of writer(name)) medium.writeRect(Math.floor(x / size) - 1, Math.floor(y / size) - 1, Math.ceil((x + w) / size) + 1, Math.ceil((y + h) / size) + 1, phase - lag);
      medium.step(p);
      phase = (phase + BASE * DT) % TAU;
    }

    function draw() {
      ordered = medium.measure();
      ctx.clearRect(0, 0, width, height);
      if (ambient) return drawAmbient();
      ctx.font = `${Math.round(size * 0.9)}px ${mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const [r0, r1] = band();
      if (regime.render === 'paths') return drawPaths(r0, r1);
      const {theta, order, held, cols} = medium, quiet = regime.quiet || 0, lit = alpha * (regime.lit || 1);
      for (let b = 0; b < 10; b++) {
        const glow = b > 4 ? lit : alpha;
        ctx.fillStyle = b === 9 ? `rgba(237,240,245,${Math.min(1, 0.45 * lit).toFixed(2)})` : `rgba(168,197,229,${Math.min(1, (0.05 + b * 0.03) * glow).toFixed(3)})`;
        for (let i = r0 * cols; i < r1 * cols; i++) {
          // Below the regime's quiet threshold only written cells are drawn,
          // so the structure shows and the noise does not.
          if (!held[i] && order[i] < quiet) continue;
          const crest = Math.cos(theta[i]) > (held[i] ? 0.4 : 0.85) && order[i] > 0.75;
          if ((crest ? 9 : held[i] ? 8 : Math.min(8, Math.floor(order[i] * order[i] * 9))) !== b) continue;
          let k = Math.round((1 + Math.cos(theta[i])) / 2 * (RAMP.length - 1));
          if (order[i] > 0.6) k = Math.max(k, held[i] ? FLOOR + 2 : FLOOR);
          if (k) ctx.fillText(RAMP[k], ((i % cols) + 0.5) * size, (Math.floor(i / cols) + 0.5) * size);
        }
      }
    }

    // Glyphs on the grid, sparse and unhurried. The section being read is lit
    // and the rest of the page recedes; content keeps a soft clearing around
    // it. In the paths regime the branching path is drawn on top.
    function drawAmbient() {
      const {theta, order, cols, rows} = medium;
      // A broad Gaussian falloff has no hard edge at a content rectangle.
      // The callback is evaluated only once per frame, never per mark.
      const zones = quietZones() || [];
      const feather = width < 600 ? 42 : 76;
      const blend = reduced.matches ? 1 : 1 - Math.exp(-elapsed / mood.persistence);
      const [s0, s1] = span || [0, rows];
      const trail = regime.render === 'paths' ? paths.ink : null;
      const levels = Array.from({length: 8}, () => []);
      for (let i = 0; i < medium.n; i++) {
        // Soft inclusion prevents marks popping on as density changes.
        const presence = smooth((mood.density - marks[i]) / 0.13);
        if (!presence && ink[i] < 0.001) continue;
        const pulse = (1 + Math.cos(theta[i])) / 2;
        ink[i] += (presence * (0.2 + 0.45 * order[i] + 0.35 * pulse) - ink[i]) * blend;
        if (trail && trail[i] > 0.05) continue;   // the path draws itself here
        const row = Math.floor(i / cols), x = ((i % cols) + 0.5) * size, y = (row + 0.5) * size;
        const away = row < s0 ? s0 - row : row > s1 ? row - s1 : 0;
        const focus = 0.32 + 0.68 * Math.exp(-away / 3);
        let clear = 1;
        for (const box of zones) {
          const dx = Math.max(box.left - x, 0, x - box.right);
          const dy = Math.max(box.top - y, 0, y - box.bottom);
          clear = Math.min(clear, 1 - 0.985 * Math.exp(-(dx * dx + dy * dy) / (2 * feather * feather)));
        }
        const opacity = alpha * mood.contrast * ink[i] * clear * focus * 0.7;
        if (opacity >= 0.012) levels[Math.min(7, Math.floor(opacity / 0.07))].push(i);
      }
      ctx.font = `${Math.round(size * 0.86)}px ${mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      levels.forEach((list, b) => {
        if (!list.length) return;
        ctx.fillStyle = `rgba(163,186,210,${((b + 0.5) * 0.07).toFixed(3)})`;
        for (const i of list) {
          const k = Math.max(1, Math.round((1 + Math.cos(theta[i])) / 2 * (RAMP.length - 1)));
          ctx.fillText(RAMP[k], ((i % cols) + 0.5) * size, (Math.floor(i / cols) + 0.5) * size);
        }
      });
      if (trail) drawPaths(Math.max(0, Math.floor(s0)), Math.min(rows, Math.ceil(s1)));
    }

    // The low-dimensional path, with two faint component axes.
    function drawPaths(r0, r1) {
      const {cols} = medium, area = pathArea(), ink = paths.ink;
      // The path never runs under text: skip cells inside content boxes.
      const boxes = ambient ? quietZones() || [] : [];
      const covered = (x, y) => boxes.some(b => x > b.left - 8 && x < b.right + 8 && y > b.top - 8 && y < b.bottom + 8);
      const ax = Math.round(area.x0), ay = Math.round(area.y1);
      ctx.fillStyle = `rgba(168,197,229,${(0.18 * alpha).toFixed(2)})`;
      for (let x = ax; x <= area.x1; x += 2) ctx.fillText('·', (x + 0.5) * size, (ay + 0.5) * size);
      for (let y = Math.round(area.y0); y <= ay; y += 2) ctx.fillText('·', (ax + 0.5) * size, (y + 0.5) * size);
      ctx.font = `${Math.round(size * 0.7)}px ${mono}`;
      ctx.textAlign = 'left';
      ctx.fillText('component 1', (ax + 2) * size, (ay + 1.6) * size);
      ctx.save(); ctx.translate((ax - 0.9) * size, (area.y0 + 1) * size); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText('component 2', 0, 0); ctx.restore();
      ctx.font = `${Math.round(size * 0.9)}px ${mono}`;
      ctx.textAlign = 'center';
      for (let b = 0; b < 4; b++) {
        ctx.fillStyle = b === 3 ? `rgba(237,240,245,${(0.85 * alpha).toFixed(2)})` : `rgba(168,197,229,${((0.18 + b * 0.18) * alpha).toFixed(2)})`;
        for (let i = r0 * cols; i < r1 * cols; i++) {
          const v = ink[i];
          if (v < 0.04 || covered(((i % cols) + 0.5) * size, (Math.floor(i / cols) + 0.5) * size)) continue;
          if ((v > 0.9 ? 3 : v > 0.45 ? 2 : v > 0.18 ? 1 : 0) !== b) continue;
          ctx.fillText(RAMP[Math.max(1, Math.round(v * (RAMP.length - 1)))], ((i % cols) + 0.5) * size, (Math.floor(i / cols) + 0.5) * size);
        }
      }
    }

    function updateHud(time, force = false) {
      if (!force && time - lastHud < 300) return;
      lastHud = time;
      if (!hud.params) return;
      if (!ambient && regime.render === 'paths') { hud.params.textContent = `2 components; ${paths.count()} branches`; return; }
      const terms = [['pairs', p.k1], ['triangles', p.k2], ['mean field', p.kg]]
        .filter(([, value]) => value > 0.05).map(([label, value]) => `${label} ${value.toFixed(1)}`);
      hud.params.textContent = `${terms.join(', ')}; ${Math.round(ordered * 100)}% ordered`;
    }

    function tick(time) {
      frame = 0;
      if (document.hidden || reduced.matches || paused) { lastTime = 0; return; }
      if (ambient && lastDraw && time - lastDraw < 1000 / 30) { frame = requestAnimationFrame(tick); return; }
      lastDraw = time;
      const seconds = lastTime ? Math.min(time - lastTime, 50) / 1000 : 0;
      lastTime = time;
      elapsed = seconds || 1 / 30;
      if (!ambient || layoutDirty) { choose(); layoutDirty = false; }
      ease(seconds);
      debt += seconds * p.speed * (ambient ? 0.55 : 1);
      for (let k = 0; debt >= DT && k < 8; k++) { advance(); debt -= DT; }
      debt = Math.min(debt, DT);
      if (regime.render === 'paths' && seconds) paths.step(pathArea());
      draw();
      updateHud(time);
      frame = requestAnimationFrame(tick);
    }

    function run() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0; lastTime = 0; lastDraw = 0;
      if (reduced.matches) { name = null; choose(); updateHud(performance.now(), true); }
      else if (!document.hidden && !paused) frame = requestAnimationFrame(tick);
    }

    function pointer(type, event) {
      if (type === 'up') { brush = null; last = null; return; }
      const box = canvas.getBoundingClientRect();
      const cx = (event.clientX - box.left) / size - 0.5, cy = (event.clientY - box.top) / size - 0.5;
      if (ambient) {
        if (type === 'down') {
          medium.paint(cx, cy, 1.8, phase);
          if (!frame) draw();
        }
        return;
      }
      if (type === 'down') { medium.measure(); brush = medium.order[medium.at(Math.round(cx), Math.round(cy))] > 0.6 ? 'zap' : 'seed'; }
      if (!brush) return;
      const [px, py] = last || [cx, cy];
      const steps = Math.max(1, Math.ceil(Math.hypot(cx - px, cy - py)));
      for (let k = 1; k <= steps; k++) medium.paint(px + (cx - px) * k / steps, py + (cy - py) * k / steps, type === 'down' ? 4 : 3, brush === 'seed' ? phase : null);
      last = [cx, cy];
      if (!frame) draw();
    }

    canvas.addEventListener('pointerdown', (event) => { canvas.setPointerCapture(event.pointerId); pointer('down', event); });
    canvas.addEventListener('pointermove', (event) => pointer('move', event));
    canvas.addEventListener('pointerup', (event) => pointer('up', event));
    canvas.addEventListener('pointercancel', (event) => pointer('up', event));
    addEventListener('scroll', () => {
      layoutDirty = true;
      if (reduced.matches || !frame) { choose(); draw(); }
    }, {passive: true});
    addEventListener('resize', resize);
    document.addEventListener('visibilitychange', run);
    reduced.addEventListener('change', run);
    resize();
    name = null;
    choose();
    // Testing aid: Flow.settle(N) pre-runs N steps of the current regime;
    // ?settle=N does it on load.
    window.Flow.settle = (steps) => {
      choose();
      Object.assign(p, regime, {pace: [...regime.pace]}); medium.tune(p);
      if (ambient) Object.assign(mood, AMBIENT[name] || AMBIENT.pairs);
      for (let k = 0; k < steps; k++) { advance(); if (regime.render === 'paths') paths.step(pathArea()); }
      // In ambient mode the marks follow the field over many frames.
      for (let k = 0; k < (ambient ? 90 : 1); k++) draw();
      updateHud(performance.now(), true);
    };
    const settle = Number(new URLSearchParams(location.search).get('settle')) || 0;
    if (settle) setTimeout(() => window.Flow.settle(settle), 500);
    run();
    return {
      refresh() { layoutDirty = true; if (!frame) { choose(); draw(); } },
      pause() { paused = true; run(); },
      resume() { paused = false; run(); },
      toggle() { paused = !paused; run(); return paused; },
      isPaused() { return paused || reduced.matches; }
    };
  }

  window.Flow = {start, REGIMES, createMedium};
})();
