// Fig. 1 variant: a phase field with memory. Oscillators on a periodic
// triangulated lattice, drawn as a character grid. Pairwise Kuramoto coupling
// runs along edges; "groups" adds a triadic term on every triangle, after the
// higher-order Kuramoto model of Skardal & Arenas. With weak pairs and strong
// triads the field is bistable: order written into it holds, and so does
// noise. With pairs alone, written order fades. Illustrative, not data.
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  // Phase drawn as glyph density. An ordered patch shares one phase, so it
  // never drops below FLOOR: at the trough of its cycle it would otherwise
  // go blank and vanish.
  const RAMP = ' .·:-=+*#%@';
  const FLOOR = 3;
  // Measured on a 44×44 lattice (scratch runs, 2026-10-03): with triads, a
  // seeded patch stays ~0.85 ordered for 20 sim-seconds and an ordered field
  // stays at 0.98 around a zapped hole; with pairs alone, both decay to
  // noise within ~5 sim-seconds. speed only rescales time; omega only sets
  // how fast the glyphs cycle (a uniform rotation changes no dynamics).
  const PARAMS = {omega: TAU * 0.15, spread: 0.3, k1: 0.3, k2: 6, noise: 0.6, speed: 2.5};

  function gauss(random) {
    return Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(TAU * random());
  }

  function createField(cols, rows, random = Math.random) {
    const n = cols * rows;
    const theta = new Float64Array(n);
    const omega = new Float64Array(n);
    const s = new Float64Array(n);
    const c = new Float64Array(n);
    const rate = new Float64Array(n);
    const sumS = new Float64Array(n);
    const sumC = new Float64Array(n);
    const order = new Float64Array(n);
    const at = (x, y) => ((y + rows) % rows) * cols + (x + cols) % cols;
    const edges = new Int32Array(n * 6);
    const triangles = new Int32Array(n * 6);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = at(x, y), right = at(x + 1, y), down = at(x, y + 1), diagonal = at(x + 1, y + 1);
        edges.set([i, right, i, down, i, diagonal], i * 6);
        triangles.set([i, right, diagonal, i, diagonal, down], i * 6);
        omega[i] = PARAMS.omega + PARAMS.spread * gauss(random);
        theta[i] = random() * TAU;
      }
    }

    function step(dt, k2) {
      for (let i = 0; i < n; i++) { s[i] = Math.sin(theta[i]); c[i] = Math.cos(theta[i]); rate[i] = omega[i]; }
      const pair = PARAMS.k1 / 6;
      for (let e = 0; e < edges.length; e += 2) {
        const i = edges[e], j = edges[e + 1];
        const v = pair * (s[j] * c[i] - c[j] * s[i]);
        rate[i] += v; rate[j] -= v;
      }
      if (k2) {
        const triad = k2 / 6;
        for (let t = 0; t < triangles.length; t += 3) {
          const p = triangles[t], q = triangles[t + 1], r = triangles[t + 2];
          // sin(θj + θk − 2θi) for each corner i of the triangle.
          rate[p] += triad * corner(p, q, r);
          rate[q] += triad * corner(q, p, r);
          rate[r] += triad * corner(r, p, q);
        }
      }
      const kick = PARAMS.noise * Math.sqrt(dt);
      for (let i = 0; i < n; i++) theta[i] = (theta[i] + dt * rate[i] + kick * gauss(random)) % TAU;
    }

    function corner(i, j, k) {
      const sjk = s[j] * c[k] + c[j] * s[k], cjk = c[j] * c[k] - s[j] * s[k];
      return sjk * (c[i] * c[i] - s[i] * s[i]) - cjk * 2 * s[i] * c[i];
    }

    // Local order: |mean of e^{iθ}| over each node and its six neighbours.
    // Returns the fraction of nodes that are locally ordered.
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

    // Set every oscillator in a disc to one phase (seed), or to random
    // phases (zap, when phase is null).
    function paint(x0, y0, radius, phase) {
      for (let y = Math.floor(y0 - radius); y <= y0 + radius; y++) {
        for (let x = Math.floor(x0 - radius); x <= x0 + radius; x++) {
          if ((x - x0) ** 2 + (y - y0) ** 2 > radius * radius) continue;
          theta[at(x, y)] = phase ?? random() * TAU;
        }
      }
    }

    return {cols, rows, n, theta, order, at, step, measure, paint};
  }

  (window.PETRI_VIZ ||= {}).field = {
    id: 'field',
    title: 'Fig. 1 / A field that remembers',
    name: 'A phase field',
    labels: {pairs: 'Pairs', groups: 'Groups'},
    captions: {
      pairs: 'With pairs alone the field forgets: written order fades in seconds. Click or drag to try.',
      groups: 'With three-way couplings the field remembers: written order holds. Click or drag to seed or zap.'
    },
    createField, PARAMS,

    create(ctx) {
      const mono = getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'monospace';
      const dt = 1 / 30;
      let field = null, bucket = new Uint8Array(0), width = 0, height = 0, cell = 14, ox = 0, oy = 0;
      let k2 = PARAMS.k2, ordered = 0, debt = 0, phase = 0, brush = null, last = null;

      function step() { field.step(dt, k2); phase = (phase + PARAMS.omega * dt) % TAU; }

      // Fixed time step, so the field runs at the same speed at 60 Hz and
      // 120 Hz. A slow device drops backlog rather than stalling.
      function advance(seconds) {
        debt += seconds * PARAMS.speed;
        for (let k = 0; debt >= dt && k < 12; k++) { step(); debt -= dt; }
        debt = Math.min(debt, dt);
      }

      // A filled triangle of order, written into the noise on arrival.
      function writeTriangle() {
        const {cols, rows} = field, cx = cols / 2, cy = rows / 2 + rows * 0.04, r = Math.min(cols, rows) * 0.3;
        const corners = [0, 1, 2].map(k => [cx + r * Math.sin(k * TAU / 3), cy - r * Math.cos(k * TAU / 3)]);
        const side = (p, a, b) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const p = [x, y], d = [side(p, corners[0], corners[1]), side(p, corners[1], corners[2]), side(p, corners[2], corners[0])];
            if (d.every(v => v >= 0) || d.every(v => v <= 0)) field.theta[field.at(x, y)] = phase;
          }
        }
      }

      function toCell(x, y) { return [(x - ox) / cell - 0.5, (y - oy) / cell - 0.5]; }

      return {
        resize(w, h) {
          width = w; height = h;
          cell = Math.max(10, Math.min(16, w / 44));
          const cols = Math.floor(w / cell), rows = Math.floor(h / cell);
          ox = (w - cols * cell) / 2; oy = (h - rows * cell) / 2;
          if (field && field.cols === cols && field.rows === rows) return;
          field = createField(cols, rows);
          bucket = new Uint8Array(field.n);
          writeTriangle();
        },
        setMode(mode) { k2 = mode === 'groups' ? PARAMS.k2 : 0; },
        settle() { for (let t = 0; t < 6 * PARAMS.speed; t += dt) step(); },
        // Press where the field is noisy to seed order, where it is ordered
        // to zap it; dragging keeps doing whichever the press chose.
        pointer(type, x, y) {
          if (type === 'up') { brush = null; last = null; return; }
          const [cx, cy] = toCell(x, y);
          if (type === 'down') {
            field.measure();
            const i = field.at(Math.round(cx), Math.round(cy));
            brush = field.order[i] > 0.6 ? 'zap' : 'seed';
          }
          if (!brush) return;
          // Fill in between pointer samples so a quick drag leaves a stroke.
          const [px, py] = last || [cx, cy];
          const steps = Math.max(1, Math.ceil(Math.hypot(cx - px, cy - py)));
          for (let k = 1; k <= steps; k++) {
            field.paint(px + (cx - px) * k / steps, py + (cy - py) * k / steps, type === 'down' ? 3.5 : 2.5, brush === 'seed' ? phase : null);
          }
          last = [cx, cy];
        },
        hud() {
          return `${field.n} oscillators\n${k2 ? 'pairs + triangles' : 'pairs only'}\nordered ${Math.round(ordered * 100)}%`;
        },
        draw(seconds) {
          if (seconds) advance(seconds);
          ordered = field.measure();
          const {cols, rows, theta, order} = field;
          // Bucket by colour so fillStyle changes ~10 times a frame, not n.
          for (let i = 0; i < field.n; i++) {
            const crest = Math.cos(theta[i]) > 0.85 && order[i] > 0.75;
            bucket[i] = crest ? 9 : Math.min(8, Math.floor(order[i] * order[i] * 9));
          }
          ctx.clearRect(0, 0, width, height);
          ctx.font = `${Math.round(cell * 0.95)}px ${mono}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          for (let b = 0; b <= 9; b++) {
            ctx.fillStyle = b === 9 ? '#edf0f5' : `rgba(168,197,229,${(0.12 + b * 0.085).toFixed(3)})`;
            for (let i = 0; i < field.n; i++) {
              if (bucket[i] !== b) continue;
              let k = Math.round((1 + Math.cos(theta[i])) / 2 * (RAMP.length - 1));
              if (order[i] > 0.6) k = Math.max(k, FLOOR);
              if (k) ctx.fillText(RAMP[k], ox + ((i % cols) + 0.5) * cell, oy + (Math.floor(i / cols) + 0.5) * cell);
            }
          }
        }
      };
    }
  };
})();
