// Navigation and one continuous, quiet medium for the personal page.
(() => {
  'use strict';
  const canvas = document.querySelector('#medium');
  const sections = [...document.querySelectorAll('.sec[data-scene]')];
  window.buildMap({
    svg: document.querySelector('#map-svg'),
    readout: document.querySelector('#readout'),
    list: document.querySelector('#map-list'),
    editorial: true
  });

  const menu = document.querySelector('.menu');
  const links = [...menu.querySelectorAll('a')];
  const mark = menu.querySelector('.menu-mark');
  let active = links[0];
  function positionMark() {
    mark.style.left = `${active.offsetLeft}px`;
    mark.style.width = `${active.offsetWidth}px`;
  }
  // A thin line where each section starts; the one being read is lit.
  sections.forEach(sec => {
    if (sec.id === 'hero') return;
    const line = document.createElement('div');
    line.className = 'boundary';
    line.setAttribute('aria-hidden', 'true');
    sec.prepend(line);
  });
  document.addEventListener('flow:section', ({detail: {id}}) => {
    sections.forEach(sec => sec.classList.toggle('on', sec.id === id));
    active = links.find(a => a.dataset.sec.split(' ').includes(id)) || links[0];
    links.forEach(a => {
      a.classList.toggle('on', a === active);
      if (a === active) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    });
    positionMark();
  });

  // Cache geometry when the layout moves, rather than measuring it per frame.
  const islands = [...document.querySelectorAll('[data-island]')];
  const fill = document.querySelector('.progress i');
  let zones = [], pending = false, field = null;
  function measure() {
    pending = false;
    zones = islands.map(el => el.getBoundingClientRect())
      .filter(b => b.width && b.bottom > -160 && b.top < innerHeight + 160)
      .map(({left, top, right, bottom}) => ({left, top, right, bottom}));
    const span = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, scrollY / span))})`;
    positionMark();
    field?.refresh();
  }
  function scheduleMeasure() {
    if (!pending) { pending = true; requestAnimationFrame(measure); }
  }
  addEventListener('scroll', scheduleMeasure, {passive: true});
  addEventListener('resize', scheduleMeasure);
  addEventListener('load', scheduleMeasure);
  document.fonts.ready.then(scheduleMeasure);
  document.querySelectorAll('details').forEach(el => el.addEventListener('toggle', scheduleMeasure));
  const layoutObserver = new ResizeObserver(scheduleMeasure);
  layoutObserver.observe(document.querySelector('main'));
  islands.forEach(el => layoutObserver.observe(el));
  measure();

  // Each section runs its own model behind the content (scenes.js).
  field = window.Scenes.start({canvas, quietZones: () => zones});
  const motion = document.querySelector('#motion-toggle');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  function reflectMotion() {
    const paused = field.isPaused();
    motion.disabled = reduced.matches;
    motion.textContent = reduced.matches ? 'Motion reduced' : paused ? 'Resume motion' : 'Pause motion';
  }
  motion.hidden = false;
  motion.addEventListener('click', () => { field.toggle(); reflectMotion(); });
  reduced.addEventListener('change', reflectMotion);
  reflectMotion();
})();
