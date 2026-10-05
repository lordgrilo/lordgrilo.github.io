// The map of the work as a page section: three questions as the vertices of a
// 2-simplex, each piece of work at its barycentric weights (works.js).
// options.mosaic draws the face as a density mosaic; without it the face is
// left open, so whatever is behind the SVG shows through.
// Editorial mode starts with a selected work and treats the marks as selectors.
// initialWork can be an index, exact title, or URL; the default is Semanticity.
window.buildMap = function buildMap({svg, readout, list, mosaic = false, editorial = false, initialWork = null}) {
  const NS = 'http://www.w3.org/2000/svg';
  const works = window.PROTO_WORKS, questions = window.PROTO_QUESTIONS;
  const V = [[110, 790], [500, 115], [890, 790]];
  const centre = [500, (790 * 2 + 115) / 3];
  const at = (w) => [0, 1].map(k => w[0] * V[0][k] + w[1] * V[1][k] + w[2] * V[2][k]);
  const hover = matchMedia('(hover: hover)').matches;
  const idle = readout.innerHTML;
  const requested = Number.isInteger(initialWork) ? initialWork : works.findIndex(work => work.title === initialWork || work.href === initialWork);
  const semanticity = works.findIndex(work => work.title.startsWith('Bound by semanticity:'));
  const initial = requested >= 0 && requested < works.length ? requested : Math.max(0, semanticity);
  let pinned = editorial ? initial : null;
  // Work lives elsewhere: open it in a new tab and keep the map where it is.
  const visit = (work) => window.open(work.href, '_blank', 'noopener');
  let displayed = null;

  function el(name, attrs = {}, parent = svg) {
    const node = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.appendChild(node);
    return node;
  }

  if (mosaic) {
    const N = 14, cells = [];
    const near = (q) => works.reduce((sum, work) => { const r = at(work.w); return sum + Math.exp(-((q[0] - r[0]) ** 2 + (q[1] - r[1]) ** 2) / 9800); }, 0);
    for (let i = 0; i < N; i++) for (let j = 0; j < N - i; j++) {
      const corners = [[i, j], [i + 1, j], [i, j + 1]];
      if (i + j + 1 < N) corners.push([i + 1, j + 1]);
      const pts = corners.map(([a, b]) => at([a / N, b / N, 1 - (a + b) / N]));
      for (const tri of pts.length === 4 ? [[pts[0], pts[1], pts[2]], [pts[1], pts[3], pts[2]]] : [pts]) {
        const c = [0, 1].map(k => (tri[0][k] + tri[1][k] + tri[2][k]) / 3);
        cells.push({tri, c, d: near(c)});
      }
    }
    const peak = Math.max(...cells.map(cell => cell.d)), g = el('g', {'aria-hidden': 'true'});
    for (const {tri, c, d} of cells) {
      const shrunk = tri.map(q => [c[0] + (q[0] - c[0]) * 0.9, c[1] + (q[1] - c[1]) * 0.9]);
      el('polygon', {points: shrunk.map(q => q.join(',')).join(' '), fill: '#a8c5e5', 'fill-opacity': (0.012 + 0.4 * (d / peak) ** 1.6).toFixed(3)}, g);
    }
  }
  const grid = el('g', {class: 'm-grid'});
  for (let t = 0.25; t < 0.99; t += 0.25) for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3, p = [0, 0, 0], q = [0, 0, 0];
    p[a] = t; p[b] = 1 - t; q[a] = t; q[c] = 1 - t;
    const [x1, y1] = at(p), [x2, y2] = at(q);
    el('line', {x1, y1, x2, y2}, grid);
  }
  el('polygon', {class: 'm-frame', points: V.map(q => q.join(',')).join(' ')});
  const pulls = el('g');
  questions.forEach((q, k) => {
    const [x, y] = V[k];
    el('circle', {class: 'm-vertex', cx: x, cy: y, r: 6});
    const anchor = k === 0 ? 'start' : k === 2 ? 'end' : 'middle';
    const tx = k === 0 ? 60 : k === 2 ? 940 : 500, ty = k === 1 ? 62 : 845;
    el('text', {class: 'm-name', x: tx, y: ty, 'text-anchor': anchor}).textContent = q.name;
    el('text', {class: 'm-question', x: tx, y: ty + 28, 'text-anchor': anchor}).textContent = q.question;
  });

  const SHAPES = {
    paper: (g) => el('path', {class: 'm-mark', d: 'M0,-10 L9,6 L-9,6 Z'}, g),
    talk: (g) => el('circle', {class: 'm-mark', r: 6.5}, g),
    conversation: (g) => el('path', {class: 'm-mark', d: 'M0,-9 L9,0 L0,9 L-9,0 Z'}, g)
  };
  const ACTION = {paper: 'Read the paper', talk: 'Watch the talk', conversation: 'Listen'};
  const marks = works.map((work, i) => {
    const [x, y] = at(work.w);
    const g = el('g', {class: 'm-work', transform: `translate(${x} ${y})`, tabindex: 0, role: editorial ? 'button' : 'link', 'aria-label': `${work.title}. ${work.venue}, ${work.year}.${editorial ? ' Select to show details.' : ''}`});
    if (editorial) {
      g.setAttribute('aria-pressed', String(i === pinned));
      if (readout.id) g.setAttribute('aria-controls', readout.id);
    }
    el('circle', {class: 'm-halo', r: 20}, g);
    SHAPES[work.kind](g);
    const dx = x - centre[0], dy = y - centre[1], n = Math.hypot(dx, dy);
    el('text', {class: 'm-year', x: dx / n * 24, y: dy / n * 24 + 4, 'text-anchor': dx < -40 ? 'end' : dx > 40 ? 'start' : 'middle'}, g).textContent = `’${String(work.year).slice(2)}`;
    g.addEventListener('pointerenter', () => { if (hover && (editorial || pinned === null)) show(i); });
    g.addEventListener('focus', () => show(i));
    g.addEventListener('click', (event) => {
      if (editorial) {
        pinned = i; show(i);
        if (matchMedia('(max-width: 760px)').matches) {
          readout.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        }
        return;
      }
      if (event.pointerType === 'touch' || !hover) { if (pinned === i) visit(work); else { pinned = i; show(i); } }
      else visit(work);
    });
    g.addEventListener('keydown', (event) => {
      if (editorial && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        pinned = i;
        show(i);
        readout.querySelector('.r-open').focus();
      } else if (!editorial && event.key === 'Enter') visit(work);
    });
    return g;
  });
  svg.addEventListener('pointerleave', () => { if (editorial || pinned === null) reset(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { pinned = editorial ? initial : null; reset(); }
  });

  function show(i) {
    const work = works[i], [x, y] = at(work.w);
    marks.forEach((m, k) => {
      m.classList.toggle('on', k === i);
      m.classList.toggle('dim', k !== i);
      if (editorial) m.setAttribute('aria-pressed', String(k === pinned));
    });
    // Preserve the readout link (and its focus) if the displayed work is unchanged.
    if (editorial && displayed === i) return;
    displayed = i;
    pulls.replaceChildren();
    if (!editorial) work.w.forEach((weight, k) => { if (weight) el('line', {class: 'm-pull', x1: x, y1: y, x2: V[k][0], y2: V[k][1], 'stroke-opacity': 0.25 + weight * 0.75}, pulls); });
    const rows = work.w.map((weight, k) => weight ? `<span>${questions[k].name}</span><b style="width:${Math.round(weight * 100)}%"></b><span>${weight.toFixed(2).slice(1)}</span>` : '').join('');
    const hadReadoutFocus = editorial && readout.contains(document.activeElement);
    readout.innerHTML = `<p class="r-kind">${work.kind[0].toUpperCase() + work.kind.slice(1)}, ${work.venue}, ${work.year}</p>
      <h3>${work.title}</h3><p class="r-who">${work.who}</p><p class="r-note">${work.note}</p>
      ${editorial ? '' : `<div class="r-weights">${rows}</div>`}<a class="r-open" href="${work.href}" target="_blank" rel="noopener">${ACTION[work.kind]} ↗</a>`;
    if (hadReadoutFocus) readout.querySelector('.r-open').focus({preventScroll: true});
  }
  function reset() {
    if (editorial) { show(pinned); return; }
    marks.forEach(m => m.classList.remove('on', 'dim'));
    pulls.replaceChildren();
    readout.innerHTML = idle;
  }

  if (editorial && works.length) show(initial);

  if (list) {
    const tiny = [[4, 32], [20, 4], [36, 32]];
    [...works].sort((a, b) => b.year - a.year).forEach(work => {
      const [x, y] = [0, 1].map(k => work.w[0] * tiny[0][k] + work.w[1] * tiny[1][k] + work.w[2] * tiny[2][k]);
      const li = document.createElement('li');
      li.innerHTML = `<a href="${work.href}" target="_blank" rel="noopener"><svg viewBox="0 0 40 36" aria-hidden="true"><polygon points="4,32 20,4 36,32" fill="none" stroke="#3a4656"/><circle cx="${x}" cy="${y}" r="3" fill="#a8c5e5"/></svg><span><span class="t">${work.title}</span><span class="m">${work.who}, ${work.venue}, ${work.year}</span></span></a>`;
      list.appendChild(li);
    });
  }
};
