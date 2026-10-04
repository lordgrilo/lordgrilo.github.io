// Fig. 1 variant: a spin system on a triangular lattice, drawn as a mosaic
// of its triangles. "pairs" is the ferromagnetic Ising model (two ordered
// states); "groups" is the Baxter–Wu model, three-spin couplings on every
// triangle (four ordered states, one per pattern on the three sublattices).
// Both are exactly solved; Tc in units of J. Metropolis dynamics, cycled
// through a quench, coarsening, and a melt. Illustrative, not data.
(() => {
  'use strict';
  const TC = {pairs: 4 / Math.log(3), groups: 2 / Math.log(1 + Math.SQRT2)};
  const CYCLE = 20;           // seconds: quench, coarsen, melt
  const COLD = 0.55, HOT = 1.8; // in units of Tc
  const SWEEPS = 40;          // Monte Carlo sweeps per second
  // Pairs: by the triangle's spin sum (+3, +1, −1, −3): the two domains in
  // light and mid steel, mixed triangles (the walls) dark. Groups: the four
  // Baxter–Wu ground states, then unsatisfied triangles (product −1) dark.
  const PAIR_TONES = ['#a8c5e5', '#151b24', '#151b24', '#4a6080'];
  const GROUP_TONES = ['#dfe8f3', '#a8c5e5', '#6b87a8', '#3a4d66', '#0e1218'];

  function temperatureAt(t) {
    if (t < 0.6) return HOT;
    if (t < CYCLE - 3) return COLD;
    return COLD + (HOT - COLD) * Math.min(1, (t - (CYCLE - 3)) / 2);
  }

  (window.PETRI_VIZ ||= {}).spins = {
    id: 'spins',
    title: 'Fig. 1 / Two ways to agree, or four',
    name: 'A spin system',
    labels: {pairs: 'Pairs', groups: 'Groups'},
    captions: {
      pairs: 'Coupled in pairs (Ising), spins settle on two states: up or down. Click to zap a patch.',
      groups: 'Coupled in threes on each triangle (Baxter–Wu), they find four ordered states. Click to zap a patch.'
    },

    create(ctx) {
      let width = 0, height = 0, cols = 0, rows = 0, n = 0, side = 13;
      let spins, neighbours, partners, triangles, shapes, drawable;
      let mode = 'groups', time = 0, debt = 0, brushing = false, last = null;
      const accept = new Float64Array(13);

      // Brick layout: odd rows sit half a step right. cols is a multiple of 3
      // and rows is even, so the periodic lattice keeps its three sublattices.
      function build() {
        n = cols * rows;
        const at = (i, j) => ((j + rows) % rows) * cols + (i + cols) % cols;
        const x = (i, j) => (i + 0.5 * (j & 1) + 0.25) * side;
        const y = (j) => (j + 0.5) * side * Math.sqrt(3) / 2;
        const sublattice = (i, j) => (((i - Math.floor(j / 2) - j) % 3) + 3) % 3;
        spins = Int8Array.from({length: n}, () => Math.random() < 0.5 ? 1 : -1);
        neighbours = new Int32Array(n * 6);
        partners = new Int32Array(n * 12);
        const tris = [], fill = new Int32Array(n);
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const even = (j & 1) === 0;
            const k = even ? i - 1 : i;
            neighbours.set([at(i - 1, j), at(i + 1, j), at(k, j - 1), at(k + 1, j - 1), at(k, j + 1), at(k + 1, j + 1)], at(i, j) * 6);
            // The two triangles between row j and row j + 1 to the right of (i, j).
            const below = even ? [[i, j], [i + 1, j], [i, j + 1]] : [[i, j], [i + 1, j], [i + 1, j + 1]];
            const above = even ? [[i + 1, j], [i, j + 1], [i + 1, j + 1]] : [[i, j], [i, j + 1], [i + 1, j + 1]];
            for (const t of [below, above]) {
              const sorted = [...t].sort((p, q) => sublattice(...p) - sublattice(...q));
              const wraps = t.some(([a, b]) => a >= cols || b >= rows);
              tris.push({ids: sorted.map(([a, b]) => at(a, b)), points: t.map(([a, b]) => [x(a, b), y(b)]), wraps});
            }
          }
        }
        triangles = new Int32Array(tris.length * 3);
        shapes = new Float32Array(tris.length * 6);
        drawable = new Uint8Array(tris.length);
        tris.forEach(({ids, points, wraps}, t) => {
          triangles.set(ids, t * 3);
          for (const id of ids) {
            const [a, b] = ids.filter(other => other !== id);
            partners.set([a, b], id * 12 + fill[id] * 2);
            fill[id]++;
          }
          // Shrink each triangle a little towards its centre: a hairline gap.
          const cx = (points[0][0] + points[1][0] + points[2][0]) / 3;
          const cy = (points[0][1] + points[1][1] + points[2][1]) / 3;
          points.forEach(([px, py], v) => shapes.set([cx + (px - cx) * 0.88, cy + (py - cy) * 0.88], t * 6 + v * 2));
          drawable[t] = wraps ? 0 : 1;
        });
      }

      function sweep(temperature) {
        for (let d = 4; d <= 12; d += 4) accept[d] = Math.exp(-d / temperature);
        for (let k = 0; k < n; k++) {
          const i = Math.floor(Math.random() * n);
          let field = 0;
          if (mode === 'pairs') {
            for (let m = i * 6; m < i * 6 + 6; m++) field += spins[neighbours[m]];
          } else {
            for (let m = i * 12; m < i * 12 + 12; m += 2) field += spins[partners[m]] * spins[partners[m + 1]];
          }
          const cost = 2 * spins[i] * field;
          if (cost <= 0 || Math.random() < accept[cost]) spins[i] = -spins[i];
        }
      }

      function zap(px, py, radius) {
        const h = side * Math.sqrt(3) / 2;
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i < cols; i++) {
            const x = (i + 0.5 * (j & 1) + 0.25) * side, y = (j + 0.5) * h;
            if ((x - px) ** 2 + (y - py) ** 2 <= radius * radius) spins[j * cols + i] = Math.random() < 0.5 ? 1 : -1;
          }
        }
      }

      function tone(t) {
        const a = spins[triangles[t * 3]], b = spins[triangles[t * 3 + 1]], c = spins[triangles[t * 3 + 2]];
        if (mode === 'pairs') return (3 - (a + b + c)) / 2;
        if (a * b * c < 0) return 4;
        // Vertices are stored in sublattice order, so (a, b) names the state:
        // +++, +−−, −+−, −−+.
        return a > 0 ? (b > 0 ? 0 : 1) : (b > 0 ? 2 : 3);
      }

      const temperature = () => temperatureAt(time) * TC[mode];

      return {
        resize(w, h) {
          width = w; height = h;
          side = Math.max(9, Math.min(15, w / 46));
          const nextCols = Math.max(3, Math.round(w / side / 3) * 3) + 3;
          const nextRows = Math.max(2, Math.round(h / (side * Math.sqrt(3) / 2) / 2) * 2) + 2;
          if (nextCols === cols && nextRows === rows) return;
          cols = nextCols; rows = nextRows; time = 0;
          build();
        },
        setMode(next) { mode = next; },
        // Paused frames show mid-coarsening: several domains, not one.
        settle() {
          time = CYCLE / 2;
          spins.forEach((_, i) => { spins[i] = Math.random() < 0.5 ? 1 : -1; });
          for (let k = 0; k < 90; k++) sweep(temperature());
        },
        pointer(type, x, y) {
          if (type === 'up') { brushing = false; last = null; return; }
          if (type === 'down') brushing = true;
          if (!brushing) return;
          const [px, py] = last || [x, y];
          const steps = Math.max(1, Math.ceil(Math.hypot(x - px, y - py) / side));
          for (let k = 1; k <= steps; k++) zap(px + (x - px) * k / steps, py + (y - py) * k / steps, side * 3.2);
          last = [x, y];
        },
        hud() {
          return `${n} spins\n${mode === 'groups' ? 'Baxter–Wu, triangles' : 'Ising, pairs'}\nT/Tc ${temperatureAt(time).toFixed(2)}`;
        },
        draw(seconds) {
          time = (time + seconds) % CYCLE;
          debt += seconds * SWEEPS;
          for (let k = 0; debt >= 1 && k < 4; k++) { sweep(temperature()); debt -= 1; }
          debt = Math.min(debt, 1);
          const paths = (mode === 'pairs' ? PAIR_TONES : GROUP_TONES).map(() => new Path2D());
          for (let t = 0; t < drawable.length; t++) {
            if (!drawable[t]) continue;
            const path = paths[tone(t)], o = t * 6;
            path.moveTo(shapes[o], shapes[o + 1]);
            path.lineTo(shapes[o + 2], shapes[o + 3]);
            path.lineTo(shapes[o + 4], shapes[o + 5]);
            path.closePath();
          }
          ctx.clearRect(0, 0, width, height);
          (mode === 'pairs' ? PAIR_TONES : GROUP_TONES).forEach((colour, k) => { ctx.fillStyle = colour; ctx.fill(paths[k]); });
        }
      };
    }
  };
})();
