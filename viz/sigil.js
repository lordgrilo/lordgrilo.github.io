// Fig. 1 variant: a generative sigil. Each cycle grows a small simplicial
// complex on a triangular lattice and draws it as worn, overshooting bars, in
// the drafting language of the Völrun mark. A new one is drawn every cycle.
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const CYCLE = 7.5;   // seconds per sigil
  const HOLD = 6.1;    // when the glitch-out starts
  const INK = '#edf0f5';
  const STEEL = 'rgba(168,197,229,0.85)';

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const between = (a, b) => a + Math.random() * (b - a);
  const key = ([i, j]) => `${i},${j}`;
  const edgeKey = (a, b) => [key(a), key(b)].sort().join('|');

  // A strip of 1–3 lattice triangles, each sharing an edge with the last,
  // plus one or two loose edges: some groups, some pairs.
  function grow() {
    const vertices = new Map(), edges = new Map(), faces = [];
    const addVertex = (v) => vertices.set(key(v), v);
    const addEdge = (a, b) => edges.set(edgeKey(a, b), [a, b]);
    let triangle = [[0, 0], [1, 0], [0, 1]];
    let previous = null;
    const count = pick([1, 2, 2, 3]);
    for (let t = 0; t < count; t++) {
      faces.push(triangle);
      triangle.forEach(addVertex);
      addEdge(triangle[0], triangle[1]); addEdge(triangle[1], triangle[2]); addEdge(triangle[0], triangle[2]);
      const options = [0, 1, 2].filter(k => !previous || edgeKey(...triangle.filter((_, m) => m !== k)) !== previous);
      const k = pick(options);
      const [a, b] = triangle.filter((_, m) => m !== k);
      const c = triangle[k];
      previous = edgeKey(a, b);
      triangle = [a, b, [a[0] + b[0] - c[0], a[1] + b[1] - c[1]]];
    }
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
    for (let d = pick([1, 1, 2]); d > 0;) {
      const from = pick([...vertices.values()]);
      const step = pick(steps);
      const to = [from[0] + step[0], from[1] + step[1]];
      if (vertices.has(key(to))) continue;
      addVertex(to); addEdge(from, to); d--;
    }
    return {vertices: [...vertices.values()], edges: [...edges.values()], faces};
  }

  (window.PETRI_VIZ ||= {}).sigil = {
    id: 'sigil',
    title: 'Fig. 1 / A mark that grows',
    name: 'A generative sigil',
    labels: {pairs: 'Pairs', groups: 'Groups'},
    captions: {
      pairs: 'Bars only: who is connected to whom.',
      groups: 'Filled faces: which groups act as one.'
    },

    create(ctx) {
      const layer = document.createElement('canvas');
      const lctx = layer.getContext('2d');
      const wear = document.createElement('canvas');
      let width = 0, height = 0, ratio = 1, mode = 'groups', time = 0, sigil = null, made = 0;

      // Speckle and scratches, punched out of the bars to look printed.
      function makeWear() {
        wear.width = layer.width; wear.height = layer.height;
        const w = wear.getContext('2d');
        w.scale(ratio, ratio);
        for (let k = 0; k < width * height / 90; k++) {
          w.fillStyle = `rgba(0,0,0,${between(0.25, 1).toFixed(2)})`;
          w.beginPath(); w.arc(Math.random() * width, Math.random() * height, between(0.3, 1.3), 0, TAU); w.fill();
        }
        w.lineCap = 'round';
        for (let k = 0; k < width / 9; k++) {
          const x = Math.random() * width, y = Math.random() * height, a = Math.random() * TAU, l = between(3, 18);
          w.strokeStyle = `rgba(0,0,0,${between(0.4, 0.9).toFixed(2)})`;
          w.lineWidth = between(0.4, 1.4);
          w.beginPath(); w.moveTo(x, y); w.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); w.stroke();
        }
      }

      function layout() {
        const size = Math.min(width, height);
        const spacing = size * between(0.2, 0.25);
        const turn = between(-0.45, 0.45);
        const e1 = [Math.cos(turn) * spacing, Math.sin(turn) * spacing];
        const e2 = [Math.cos(turn + TAU / 6) * spacing, Math.sin(turn + TAU / 6) * spacing];
        const {vertices, edges, faces} = grow();
        const raw = (v) => [v[0] * e1[0] + v[1] * e2[0], v[0] * e1[1] + v[1] * e2[1]];
        const mid = vertices.map(raw).reduce((m, p) => [m[0] + p[0] / vertices.length, m[1] + p[1] / vertices.length], [0, 0]);
        const at = (v) => { const p = raw(v); return [width / 2 + p[0] - mid[0], height / 2 + p[1] - mid[1]]; };
        const centre = [width / 2, height / 2];
        const bars = edges.map(([a, b], k) => {
          const p = at(a), q = at(b);
          const reach = () => Math.random() < 0.5 ? between(0.15, 0.6) * spacing : 0.06 * spacing;
          return {p, q, start: k * 0.17, head: reach(), tail: reach(), weight: size * between(0.03, 0.042), inner: Math.random() < 0.55};
        });
        const ticks = Array.from({length: 9}, () => {
          const a = Math.random() * TAU, r = between(0.3, 0.42) * size;
          return {x: centre[0] + Math.cos(a) * r, y: centre[1] + Math.sin(a) * r, a: pick([0, 1, 2, 3]) * TAU / 6, l: between(4, 11)};
        });
        made++;
        return {bars, ticks, centre, faces: faces.map(f => f.map(at)), counts: [vertices.length, edges.length, faces.length]};
      }

      function bar({p, q, head, tail, weight, inner}, grown) {
        const dx = q[0] - p[0], dy = q[1] - p[1], length = Math.hypot(dx, dy);
        const ux = dx / length, uy = dy / length, nx = -uy, ny = ux;
        const a = [p[0] - ux * tail, p[1] - uy * tail];
        const full = length + head + tail;
        const b = [a[0] + ux * full * grown, a[1] + uy * full * grown];
        lctx.fillStyle = INK;
        lctx.beginPath();
        lctx.moveTo(a[0] + nx * weight / 2, a[1] + ny * weight / 2);
        lctx.lineTo(b[0] + nx * weight / 2, b[1] + ny * weight / 2);
        lctx.lineTo(b[0] - nx * weight / 2, b[1] - ny * weight / 2);
        lctx.lineTo(a[0] - nx * weight / 2, a[1] - ny * weight / 2);
        lctx.fill();
        if (!inner) return;
        // A hairline riding alongside the bar, on the side facing the centre.
        const side = Math.sign((sigil.centre[0] - p[0]) * nx + (sigil.centre[1] - p[1]) * ny) || 1;
        const off = weight * 1.05 * side;
        lctx.strokeStyle = STEEL; lctx.lineWidth = 1;
        lctx.beginPath();
        lctx.moveTo(a[0] + nx * off + ux * weight, a[1] + ny * off + uy * weight);
        lctx.lineTo(b[0] + nx * off - ux * weight, b[1] + ny * off - uy * weight);
        lctx.stroke();
      }

      function face(points, alpha) {
        const cx = (points[0][0] + points[1][0] + points[2][0]) / 3;
        const cy = (points[0][1] + points[1][1] + points[2][1]) / 3;
        const inset = points.map(([x, y]) => [cx + (x - cx) * 0.52, cy + (y - cy) * 0.52]);
        lctx.save();
        lctx.globalAlpha = alpha;
        lctx.beginPath();
        inset.forEach(([x, y], k) => k ? lctx.lineTo(x, y) : lctx.moveTo(x, y));
        lctx.closePath();
        lctx.strokeStyle = INK; lctx.lineWidth = 1.2; lctx.stroke();
        lctx.clip();
        lctx.strokeStyle = STEEL; lctx.lineWidth = 0.7;
        const r = Math.max(...inset.map(([x, y]) => Math.hypot(x - cx, y - cy)));
        for (let k = -2 * r; k <= 2 * r; k += 4) {
          lctx.beginPath(); lctx.moveTo(cx + k - r, cy - r); lctx.lineTo(cx + k + r, cy + r); lctx.stroke();
        }
        lctx.restore();
      }

      function paint(t) {
        lctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        lctx.clearRect(0, 0, width, height);
        lctx.strokeStyle = 'rgba(160,171,186,0.7)'; lctx.lineWidth = 1;
        for (const {x, y, a, l} of sigil.ticks) {
          lctx.beginPath(); lctx.moveTo(x, y); lctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); lctx.stroke();
        }
        if (mode === 'groups') {
          const alpha = Math.max(0, Math.min(1, (t - 1.1) / 0.8));
          if (alpha) sigil.faces.forEach(f => face(f, alpha));
        }
        for (const b of sigil.bars) {
          const grown = Math.max(0, Math.min(1, (t - b.start) / 0.4));
          if (grown) bar(b, 1 - (1 - grown) ** 3);
        }
        lctx.setTransform(1, 0, 0, 1, 0, 0);
        lctx.globalCompositeOperation = 'destination-out';
        lctx.drawImage(wear, 0, 0);
        lctx.globalCompositeOperation = 'source-over';
      }

      // Copy the layer across in horizontal slices; shift them to glitch.
      function present(glitch) {
        ctx.clearRect(0, 0, width, height);
        if (!glitch) { ctx.drawImage(layer, 0, 0, width, height); return; }
        ctx.globalAlpha = Math.max(0, 1 - glitch * 0.8);
        for (let y = 0; y < height;) {
          const h = between(3, 22), shift = (Math.random() - 0.5) * glitch * width * 0.25;
          ctx.drawImage(layer, 0, y * ratio, layer.width, h * ratio, shift, y, width, h);
          y += h;
        }
        ctx.globalAlpha = 1;
      }

      return {
        resize(w, h) {
          width = w; height = h; ratio = Math.min(window.devicePixelRatio || 1, 2);
          layer.width = Math.round(w * ratio); layer.height = Math.round(h * ratio);
          makeWear();
          sigil = layout(); time = 0;
        },
        setMode(next) { mode = next; },
        settle() { time = HOLD - 0.5; },
        hud() {
          const [v, e, f] = sigil.counts, faces = mode === 'groups' ? f : 0;
          return `sigil ${String(made).padStart(3, '0')}\nV ${v}  E ${e}  F ${faces}\nχ = ${v - e + faces}`;
        },
        draw(dt) {
          time += dt;
          if (time > CYCLE) { time = 0; sigil = layout(); }
          paint(time);
          let glitch = time > HOLD ? (time - HOLD) / (CYCLE - HOLD) : 0;
          if (!glitch && dt && time > 2.5 && Math.random() < 0.012) glitch = 0.15;
          present(glitch);
        }
      };
    }
  };
})();
