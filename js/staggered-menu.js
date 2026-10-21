'use strict';

// A menu that slides in as a few coloured layers, then the panel, then the words one by one.
// Vanilla port of the StaggeredMenu component, built on the Web Animations API.

const SM_POWER4_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
const SM_POWER3_OUT = 'cubic-bezier(0.215, 0.61, 0.355, 1)';
const SM_POWER3_IN = 'cubic-bezier(0.32, 0, 0.67, 0)';
const SM_POWER2_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)';

class StaggeredMenu {
  constructor(root, o = {}) {
    this.root = root;
    this.o = Object.assign({ position: 'right', colors: ['#ffc2dc', '#ff7fb0'], items: [], note: '', logo: 'món quà',
      displayItemNumbering: true, accentColor: '#e0407e', closeOnClickAway: true, onOpen: null, onClose: null }, o);
    this.isOpen = false; this.token = 0;
    this.build();
  }

  build() {
    const { root, o } = this;
    root.classList.add('sm-scope');
    root.dataset.position = o.position;
    root.style.setProperty('--sm-accent', o.accentColor);

    // the stacked colour layers behind the panel (with three or more colours the middle one is dropped, as in the original)
    const layers = o.colors.slice(0, 4);
    if (layers.length >= 3) layers.splice(Math.floor(layers.length / 2), 1);

    root.innerHTML = `
      <div class="sm-prelayers" aria-hidden="true">${layers.map(c => `<div class="sm-prelayer" style="background:${c}"></div>`).join('')}</div>
      <header class="sm-header" aria-label="menu">
        <a class="sm-logo" href="#top" aria-label="${o.logo}">${o.logo}<span aria-hidden="true">♡</span></a>
        <button class="sm-toggle" type="button" aria-label="mở menu" aria-expanded="false" aria-controls="sm-panel">
          <span class="sm-toggle-wrap" aria-hidden="true"><span class="sm-toggle-inner"><span class="sm-toggle-line">menu</span></span></span>
          <span class="sm-icon" aria-hidden="true"><span class="sm-icon-line sm-h"></span><span class="sm-icon-line sm-v"></span></span>
        </button>
      </header>
      <aside class="sm-panel" id="sm-panel" aria-hidden="true" inert>
        <div class="sm-panel-inner">
          <ul class="sm-list" role="list">
            ${o.items.map((it, i) => `
              <li class="sm-itemwrap">
                <a class="sm-item" href="${it.target || '#'}" aria-label="${it.ariaLabel || it.label}" data-index="${i}">
                  <span class="sm-itemlabel">${it.label}</span>${o.displayItemNumbering ? `<span class="sm-num">${String(i + 1).padStart(2, '0')}</span>` : ''}
                </a>
              </li>`).join('')}
          </ul>
          ${o.note ? `<p class="sm-note">${o.note}</p>` : ''}
        </div>
      </aside>`;

    this.layers = [...root.querySelectorAll('.sm-prelayer')];
    this.panel = root.querySelector('.sm-panel');
    this.toggleBtn = root.querySelector('.sm-toggle');
    this.textInner = root.querySelector('.sm-toggle-inner');
    this.iconH = root.querySelector('.sm-h');
    this.iconV = root.querySelector('.sm-v');

    this.toggleBtn.addEventListener('click', () => this.toggle());
    root.querySelectorAll('.sm-item').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const it = o.items[+a.dataset.index];
      this.close();
      setTimeout(() => { if (it.onSelect) it.onSelect(); else if (it.target) { const t = document.querySelector(it.target); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, 260);
    }));
    root.querySelector('.sm-logo').addEventListener('click', e => { e.preventDefault(); this.close(); window.scrollTo({ top: document.getElementById('after').offsetTop, behavior: 'smooth' }); });

    if (o.closeOnClickAway) {
      document.addEventListener('mousedown', e => {
        if (this.isOpen && !this.panel.contains(e.target) && !this.toggleBtn.contains(e.target)) this.close();
      });
    }
    // Esc closes the menu first, before anything else reacts to it
    window.addEventListener('keydown', e => {
      if (this.isOpen && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
    }, true);
  }

  els() {
    const r = this.root;
    return {
      labels: [...r.querySelectorAll('.sm-itemlabel')], nums: [...r.querySelectorAll('.sm-num')], note: r.querySelector('.sm-note'),
    };
  }
  cancelAll() {
    const { labels, nums, note } = this.els();
    for (const el of [...this.layers, this.panel, ...labels, ...nums, note].filter(Boolean)) el.getAnimations().forEach(a => a.cancel());
  }

  toggle() { this.isOpen ? this.close() : this.open(); }

  open() {
    if (this.isOpen) return;
    this.isOpen = true; this.token++;
    const { root, o } = this;
    root.classList.add('sm-open', 'sm-active');
    this.panel.removeAttribute('inert'); this.panel.setAttribute('aria-hidden', 'false');
    this.toggleBtn.setAttribute('aria-expanded', 'true'); this.toggleBtn.setAttribute('aria-label', 'đóng menu');
    this.cancelAll();

    const off = o.position === 'left' ? '-100%' : '100%';
    const slide = [{ transform: `translateX(${off})` }, { transform: 'translateX(0)' }];
    this.layers.forEach((el, i) => el.animate(slide, { duration: 500, delay: i * 70, easing: SM_POWER4_OUT, fill: 'both' }));
    const panelAt = this.layers.length ? (this.layers.length - 1) * 70 + 80 : 0;
    this.panel.animate(slide, { duration: 650, delay: panelAt, easing: SM_POWER4_OUT, fill: 'both' });

    const { labels, nums, note } = this.els();
    const itemsAt = panelAt + 650 * 0.15;
    labels.forEach((el, i) => el.animate(
      [{ transform: 'translateY(140%) rotate(10deg)' }, { transform: 'translateY(0) rotate(0deg)' }],
      { duration: 1000, delay: itemsAt + i * 100, easing: SM_POWER4_OUT, fill: 'both' }));
    nums.forEach((el, i) => el.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: 600, delay: itemsAt + 100 + i * 80, easing: SM_POWER2_OUT, fill: 'both' }));
    if (note) note.animate([{ opacity: 0, transform: 'translateY(25px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 550, delay: panelAt + 650 * 0.4, easing: SM_POWER3_OUT, fill: 'both' });

    this.animateIcon(true); this.animateText(true);
    if (o.onOpen) o.onOpen();
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    const my = ++this.token;
    const { root, o } = this;
    root.classList.remove('sm-open');
    this.toggleBtn.setAttribute('aria-expanded', 'false'); this.toggleBtn.setAttribute('aria-label', 'mở menu');
    this.panel.setAttribute('inert', ''); this.panel.setAttribute('aria-hidden', 'true');

    const off = o.position === 'left' ? '-100%' : '100%';
    const moving = [...this.layers, this.panel];
    const from = moving.map(el => getComputedStyle(el).transform);       // leave from wherever it is now
    this.cancelAll();
    const anims = moving.map((el, i) => el.animate(
      [{ transform: from[i] === 'none' ? 'translateX(0)' : from[i] }, { transform: `translateX(${off})` }],
      { duration: 320, easing: SM_POWER3_IN, fill: 'forwards' }));
    Promise.all(anims.map(a => a.finished.catch(() => {}))).then(() => {
      if (my !== this.token) return;                                   // it was opened again in the meantime
      this.cancelAll();                                                // back to the resting (hidden) styles
      root.classList.remove('sm-active');
    });
    this.animateIcon(false); this.animateText(false);
    if (o.onClose) o.onClose();
  }

  // the plus turns into a cross and back
  animateIcon(opening) {
    const base = 'translate(-50%, -50%)';
    const turn = (el, from, to, d, ease) => el.animate([{ transform: `${base} rotate(${from}deg)` }, { transform: `${base} rotate(${to}deg)` }],
      { duration: d, easing: ease, fill: 'forwards' });
    if (opening) { turn(this.iconH, 0, 45, 500, SM_POWER4_OUT); turn(this.iconV, 90, -45, 500, SM_POWER4_OUT); }
    else { turn(this.iconH, 45, 0, 350, 'cubic-bezier(0.65, 0, 0.35, 1)'); turn(this.iconV, -45, 90, 350, 'cubic-bezier(0.65, 0, 0.35, 1)'); }
  }

  // the label rolls like a slot: menu, đóng, menu, đóng…
  animateText(opening) {
    const [now, target] = opening ? ['menu', 'đóng'] : ['đóng', 'menu'];
    const seq = [now];
    let last = now;
    for (let i = 0; i < 3; i++) { last = last === 'menu' ? 'đóng' : 'menu'; seq.push(last); }
    if (last !== target) seq.push(target);
    seq.push(target);
    this.textInner.getAnimations().forEach(a => a.cancel());
    this.textInner.innerHTML = seq.map(t => `<span class="sm-toggle-line">${t}</span>`).join('');
    const shift = ((seq.length - 1) / seq.length) * 100;
    this.textInner.animate([{ transform: 'translateY(0)' }, { transform: `translateY(-${shift}%)` }],
      { duration: 500 + seq.length * 70, easing: SM_POWER4_OUT, fill: 'forwards' });
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.close(); this.root.classList.add('hidden'); }
}

const appMenu = new StaggeredMenu(document.getElementById('menu'), {
  position: 'right',
  colors: ['#ffc2dc', '#ff8fb8'],
  accentColor: '#e0407e',
  items: [
    { label: 'bức vẽ của em', ariaLabel: 'đi tới bức vẽ của em', target: '#after' },
    { label: 'anh yêu em', ariaLabel: 'đi tới anh yêu em', target: '#loop' },
    { label: 'thư mục', ariaLabel: 'đi tới thư mục', target: '#desk' },
    { label: 'về lại gương', ariaLabel: 'quay lại cái gương', onSelect: () => backToMirror() },
  ],
  note: 'mệt thì ghé đây nha ♡',
});
