(() => {
  'use strict';
  const configuredUrl = window.PETRI_SITE?.substackUrl;
  if (!configuredUrl) return;
  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    document.querySelectorAll('[data-substack-link]').forEach(link => {
      link.href = url.href;
      link.hidden = false;
    });
  } catch {
    // A missing or malformed publication URL must never create a dead link.
  }
})();

// Hero figure harness. Each variant in viz/*.js registers itself on
// window.PETRI_VIZ; the switch in the figure header swaps between them.
// The first one shown is ?viz=, else heroViz in site-config.js, else field.
(() => {
  'use strict';
  const registry = window.PETRI_VIZ || {};
  const canvas = document.querySelector('#topology-canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx || !registry.field) return;

  const figure = canvas.closest('figure');
  const caption = document.querySelector('#representation-caption');
  const hud = document.querySelector('#figure-hud');
  const pauseButton = document.querySelector('#motion-toggle');
  const modeButtons = document.querySelectorAll('[data-view]');
  const vizButtons = document.querySelectorAll('[data-viz-tab]');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reducedMotion.matches;
  let visible = true;
  let mode = 'groups';
  let lastTime = 0;
  let lastHud = 0;
  let frame = 0;
  let variant = null;
  let instance = null;

  function render(dt) {
    instance.draw(dt);
    figure.classList.add('canvas-ready');
  }

  function updateHud(time, force = false) {
    if (!force && time - lastHud < 250) return;
    lastHud = time;
    hud.textContent = instance.hud();
  }

  function tick(time) {
    frame = 0;
    if (paused || !visible || document.hidden) { lastTime = 0; return; }
    const dt = lastTime ? Math.min(time - lastTime, 50) / 1000 : 0;
    lastTime = time;
    render(dt);
    updateHud(time);
    frame = requestAnimationFrame(tick);
  }

  function syncMotion() {
    pauseButton.textContent = paused ? 'Play' : 'Pause';
    pauseButton.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastTime = 0;
    if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }

  // A paused figure still has to show something meaningful: let the variant
  // settle into a representative state, then draw that single frame.
  function settleAndDraw() {
    instance.settle?.();
    render(0);
    updateHud(performance.now(), true);
  }

  function setMode(next, redraw = true) {
    mode = next;
    modeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === mode)));
    caption.textContent = variant.captions[mode];
    instance.setMode(mode);
    if (redraw && paused) settleAndDraw();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    instance.resize(rect.width, rect.height);
    if (paused) settleAndDraw();
    else { render(0); updateHud(performance.now(), true); }
  }

  function show(id) {
    variant = registry[id];
    figure.dataset.viz = variant.id;
    document.querySelector('#figure-title').textContent = variant.title;
    document.querySelector('#figure-name').textContent = variant.name;
    modeButtons.forEach(button => { button.textContent = variant.labels[button.dataset.view]; });
    vizButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.vizTab === id)));
    instance = variant.create(ctx);
    setMode(mode, false);
    resize();
    syncMotion();
  }

  vizButtons.forEach(button => button.addEventListener('click', () => {
    if (button.dataset.vizTab === variant.id) return;
    show(button.dataset.vizTab);
    const url = new URL(location.href);
    url.searchParams.set('viz', variant.id);
    history.replaceState(null, '', url);
  }));
  modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.view)));
  pauseButton.addEventListener('click', () => { paused = !paused; syncMotion(); });
  reducedMotion.addEventListener('change', event => { paused = event.matches; syncMotion(); });
  document.addEventListener('visibilitychange', syncMotion);
  // Press, drag and release go to the figure (field and spins draw with
  // them). While paused, redraw at once so a click still visibly does something.
  function forward(type, event) {
    if (!instance.pointer) return;
    const rect = canvas.getBoundingClientRect();
    instance.pointer(type, event.clientX - rect.left, event.clientY - rect.top);
    if (!frame && type !== 'up') { render(0); updateHud(performance.now(), true); }
  }
  canvas.addEventListener('pointerdown', event => {
    if (instance.pointer) canvas.setPointerCapture(event.pointerId);
    forward('down', event);
  });
  canvas.addEventListener('pointermove', event => forward('move', event));
  canvas.addEventListener('pointerup', event => forward('up', event));
  canvas.addEventListener('pointercancel', event => forward('up', event));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; syncMotion(); }, {threshold: 0.05}).observe(canvas);
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  figure.querySelector('.figure-controls').hidden = false;
  figure.querySelector('.viz-switch').hidden = false;
  const requested = new URLSearchParams(location.search).get('viz');
  show([requested, window.PETRI_SITE?.heroViz].find(id => registry[id]) || 'field');
})();
