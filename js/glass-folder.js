'use strict';

// Three glass folders on a dotted desk.
// Hover one and its glass leans toward you, click it and the files fan out,
// "+" adds a file, the "more" key opens a small menu.

// ---- the soft print under the front glass: a few blurred blooms of colour ----
function seeded(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};
const PRINTS = {
  rose:  { bg: ['#f7a8c4', '#e58bb8', '#b564a8'], blooms: ['#ffe0ec', '#ffc1d8', '#d9b3ff', '#ffd9c2'] },
  berry: { bg: ['#4a1031', '#8a1f54', '#c93a79'], blooms: ['#ff7fb0', '#ffb3d1', '#d94c8a', '#7a1c4d'] },
};

function paintPrint(canvas, kind, seed, w = 320, h = 240) {
  const P = PRINTS[kind] || PRINTS.rose;
  const rand = seeded(seed * 9973);
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, w * 0.4, h);
  P.bg.forEach((col, i) => g.addColorStop(i / (P.bg.length - 1), col));
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 6; i++) {
    const x = rand() * w, y = rand() * h, rad = (0.3 + rand() * 0.35) * Math.max(w, h);
    const col = P.blooms[Math.floor(rand() * P.blooms.length)];
    const rg = c.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, hexA(col, 0.55)); rg.addColorStop(1, hexA(col, 0));
    c.fillStyle = rg; c.fillRect(0, 0, w, h);
  }
}

// ---- tiny toast ----
const toastEl = document.getElementById('toast');
let toastTimer = 0;
function toast(msg, actionLabel, onAction) {
  toastEl.textContent = msg + ' ';
  if (actionLabel) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = actionLabel;
    b.addEventListener('click', () => { onAction(); toastEl.classList.remove('show'); });
    toastEl.appendChild(b);
  }
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 4200);
}

const ICON_PLUS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
const ICON_MORE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const TONES = ['rose', 'peach', 'lilac'];
const GLYPHS = ['♡', '✿', '✦', '☁'];

const folders = [];
function closeFolders() {                      // true if something was open (so Esc has done its job)
  let any = false;
  for (const f of folders) if (f.isOpen() || f.menuOpen()) { f.close(); any = true; }
  return any;
}

class GlassFolder {
  constructor({ label, meta, tone = 'light', art = 'rose', seed = 1, action = 'plus', labelPlacement = 'top-left',
                appearDelay = 0, files = [], menu = [] }) {
    this.label = label; this.fixedMeta = meta; this.action = action;
    this.files = files.slice(); this.added = 0;

    const el = this.el = document.createElement('div');
    el.className = 'gf' + (tone === 'dark' ? ' dark' : '') + (art === 'none' ? ' plain' : '');
    el.tabIndex = 0; el.setAttribute('role', 'button'); el.setAttribute('aria-expanded', 'false');
    el.style.setProperty('--delay', appearDelay + 'ms');
    el.innerHTML = `
      <div class="gf-back"></div>
      <div class="gf-files"></div>
      <div class="gf-glass">
        ${art === 'none' ? '' : '<canvas class="gf-art"></canvas>'}
        <span class="gf-grain"></span><span class="gf-sheen"></span>
        <div class="gf-top ${labelPlacement === 'top-right' ? 'right' : ''}"><span class="gf-label"></span><span class="gf-meta"></span></div>
        ${action === 'none' ? '' : `<button class="gf-action" type="button" aria-label="${action === 'more' ? 'thêm' : 'thêm một tệp'}">${action === 'more' ? ICON_MORE : ICON_PLUS}</button>`}
      </div>
      <div class="gf-menu" role="menu"></div>`;
    this.filesEl = el.querySelector('.gf-files');
    this.labelEl = el.querySelector('.gf-label');
    this.metaEl = el.querySelector('.gf-meta');
    this.menuEl = el.querySelector('.gf-menu');
    if (art !== 'none') paintPrint(el.querySelector('.gf-art'), art, seed);

    menu.forEach(item => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = item.label; b.setAttribute('role', 'menuitem');
      if (item.id === 'trash') b.className = 'danger';
      b.addEventListener('click', e => { e.stopPropagation(); this.closeMenu(); this.runMenu(item.id); });
      this.menuEl.appendChild(b);
    });

    el.addEventListener('click', e => {
      if (e.target.closest('.gf-menu') || this.labelEl.isContentEditable) return;
      if (e.target.closest('.gf-action')) { e.stopPropagation(); this.action === 'more' ? this.toggleMenu() : this.addFile(); return; }
      this.closeMenu();
      this.toggle();
    });
    el.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); this.toggle(); }
    });

    this.render();
    folders.push(this);
  }

  isOpen() { return this.el.classList.contains('open'); }
  menuOpen() { return this.el.classList.contains('menu-open'); }
  toggle() {
    const open = !this.isOpen();
    for (const f of folders) if (f !== this) f.close();
    this.el.classList.toggle('open', open);
    this.el.setAttribute('aria-expanded', String(open));
  }
  close() { this.el.classList.remove('open', 'menu-open'); this.el.setAttribute('aria-expanded', 'false'); }
  toggleMenu() {
    const open = !this.menuOpen();
    for (const f of folders) if (f !== this) f.closeMenu();
    this.el.classList.toggle('menu-open', open);
  }
  closeMenu() { this.el.classList.remove('menu-open'); }

  runMenu(id) {
    if (id === 'trash') {
      this.el.classList.add('gone'); this.close();
      toast(`đã bỏ “${this.labelEl.textContent}” vào thùng rác.`, 'hoàn tác', () => this.el.classList.remove('gone'));
    } else if (id === 'rename') {
      const l = this.labelEl;
      l.contentEditable = 'true'; l.focus();
      getSelection().selectAllChildren(l);
      const done = () => { l.contentEditable = 'false'; l.removeEventListener('blur', done); l.removeEventListener('keydown', onKey); };
      const onKey = e => { if (e.key === 'Enter') { e.preventDefault(); l.blur(); } e.stopPropagation(); };
      l.addEventListener('blur', done); l.addEventListener('keydown', onKey);
    } else if (id === 'share') {
      navigator.clipboard.writeText(location.href).then(() => toast('đã chép liên kết.'), () => toast('không chép được liên kết.'));
    }
  }

  // the newest file ends up on top of the fan
  addFile(file) {
    const n = this.added++;
    const f = file || { name: 'Bức vẽ mới ' + (n + 1), meta: 'vừa xong', tone: TONES[n % TONES.length], glyph: GLYPHS[n % GLYPHS.length] };
    this.files.push(f);
    this.render();
    this.el.classList.remove('bump'); void this.el.offsetWidth; this.el.classList.add('bump');
  }

  render() {
    this.labelEl.textContent = this.label;
    this.metaEl.textContent = this.fixedMeta || `${this.files.length} tệp`;
    const shown = this.files.slice(-5);
    this.filesEl.textContent = '';
    shown.forEach((f, i) => {
      const card = document.createElement('div');
      card.className = 'gf-file';
      card.style.setProperty('--i', i); card.style.setProperty('--n', shown.length);
      const thumb = document.createElement('div');
      thumb.className = 'thumb tone-' + (f.tone || 'rose');
      if (f.img) { const im = new Image(); im.src = f.img; im.alt = ''; thumb.appendChild(im); }
      else thumb.textContent = f.glyph || '♡';
      card.appendChild(thumb);
      card.insertAdjacentHTML('beforeend', '<div class="name"></div><div class="fmeta"></div>');
      card.querySelector('.name').textContent = f.name;
      card.querySelector('.fmeta').textContent = f.meta || '';
      this.filesEl.appendChild(card);
    });
  }
}

// ---- the desk ----
const glassDesk = (() => {
  const grid = document.getElementById('deskGrid');
  const today = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' });
  const list = [
    new GlassFolder({ label: 'Bức vẽ của tui', art: 'rose', seed: 3, appearDelay: 0 }),
    new GlassFolder({ label: 'Kỷ niệm', art: 'none', action: 'more', appearDelay: 140,
      files: [
        { name: 'Sáng có sương', tone: 'peach', glyph: '☁' },
        { name: 'Lần đầu thở lên kính', tone: 'rose', glyph: '♡' },
        { name: 'Cười một cái', tone: 'lilac', glyph: '✿' },
        { name: 'Gửi cho ai đó', tone: 'peach', glyph: '✦' },
      ],
      menu: [{ id: 'rename', label: 'Đổi tên' }, { id: 'share', label: 'Chia sẻ…' }, { id: 'trash', label: 'Bỏ vào thùng rác' }] }),
    new GlassFolder({ label: 'Đêm khuya', meta: today, tone: 'dark', art: 'berry', seed: 11, action: 'none',
      labelPlacement: 'top-right', appearDelay: 280,
      files: [
        { name: 'Ngủ ngon nhé', tone: 'night', glyph: '☾' },
        { name: 'Mơ đẹp', tone: 'lilac', glyph: '✦' },
        { name: 'Thức khuya quá', tone: 'night', glyph: '☁' },
      ] }),
  ];
  list.forEach(f => grid.appendChild(f.el));

  // they drift in when the desk scrolls into view
  new IntersectionObserver((entries, obs) => {
    if (!entries[0].isIntersecting) return;
    obs.disconnect();
    for (const f of list) {
      f.el.classList.add('in');
      setTimeout(() => f.el.classList.add('settled'), 1400 + parseInt(f.el.style.getPropertyValue('--delay'), 10));
    }
  }, { threshold: 0.2 }).observe(document.getElementById('desk'));

  document.addEventListener('click', e => { if (!e.target.closest('.gf')) closeFolders(); });

  return {
    // the picture you kept goes straight into the first folder
    addPhoto(url, stamp) {
      const t = stamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      list[0].addFile({ name: 'Bức vẽ ' + t, meta: 'ảnh của tui', img: url });
    },
  };
})();
