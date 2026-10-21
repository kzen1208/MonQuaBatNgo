'use strict';

// "Slide to confirm": drag the handle to the end, a spinner turns, then the pill unfurls with a check.
// Vanilla port of the SlideCommit component. Its motion values run on a tiny spring / tween engine below.

const SC_PAD = 4, SC_SQUASH_MAX = 0.08, SC_SQUASH_DIV = 110, SC_SWELL = 1.03, SC_MIN_PENDING = 300;
const SC_SHAKE = [0, -5, 5, -3, 3, -1, 0];
const scClamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function scBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t;
  return x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 16; i++) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}
const SC_EASE_OUT = scBezier(0.23, 1, 0.32, 1);

// ---- engine: one rAF loop for every running animation ----
const scJobs = new Set();
let scRaf = 0, scLast = 0;
function scTick(now) {
  const dt = Math.min(0.05, Math.max(0, (now - scLast) / 1000));
  scLast = now;
  for (const job of [...scJobs]) job.step(dt);
  scRaf = scJobs.size ? requestAnimationFrame(scTick) : 0;
}
function scStart(job) {
  scJobs.add(job);
  if (!scRaf) { scLast = performance.now(); scRaf = requestAnimationFrame(scTick); }
}

// one animatable number; starting a new animation (or set) replaces the old one
class ScValue {
  constructor(v, onChange) { this.v = v; this.onChange = onChange; this.job = null; }
  get() { return this.v; }
  stop() { if (this.job) { scJobs.delete(this.job); this.job = null; } }
  set(v) { this.stop(); this.v = v; this.onChange(); }
  put(v) { this.v = v; this.onChange(); }

  spring(to, { stiffness, damping, mass = 1, velocity = 0 }) {
    this.stop();
    const mv = this;
    let vel = velocity;
    const job = this.job = {
      step(dt) {
        let left = dt;
        while (left > 0) {                                             // fixed small steps keep the spring stable
          const h = Math.min(left, 1 / 240);
          vel += ((-stiffness * (mv.v - to) - damping * vel) / mass) * h;
          mv.v += vel * h;
          left -= h;
        }
        if (Math.abs(vel) < 0.05 && Math.abs(mv.v - to) < 0.05) { mv.v = to; scJobs.delete(job); mv.job = null; }
        mv.onChange();
      },
    };
    scStart(job);
  }

  // frames: [a, b, c…] spread over `times` (default even); a single target means from the current value
  tween(frames, { duration, delay = 0, ease = SC_EASE_OUT, times }) {
    this.stop();
    const mv = this;
    const list = Array.isArray(frames) ? frames : [this.v, frames];
    const at = times || list.map((_, i) => i / (list.length - 1));
    let t = -delay;
    const job = this.job = {
      step(dt) {
        t += dt;
        if (t < 0) return;
        const p = scClamp(t / duration, 0, 1), e = ease(p);
        let i = 0;
        while (i < at.length - 2 && e > at[i + 1]) i++;
        const span = at[i + 1] - at[i] || 1;
        mv.v = list[i] + (list[i + 1] - list[i]) * scClamp((e - at[i]) / span, 0, 1);
        if (p >= 1) { mv.v = list[list.length - 1]; scJobs.delete(job); mv.job = null; }
        mv.onChange();
      },
    };
    scStart(job);
  }
}

const SC_ARROW = size => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12h15M13.5 6l6 6-6 6"/></svg>`;
const SC_TICK = size => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const SC_SPINNER = size => `<svg class="sc-ring" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-opacity="0.25"/><path d="M12 3a9 9 0 0 1 9 9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`;

const scOnColor = hex => {                                              // black or white, whichever reads on this colour
  const raw = hex.replace('#', '');
  const full = raw.length === 3 ? [...raw].map(ch => ch + ch).join('') : raw.slice(0, 6);
  const n = parseInt(full, 16);
  if (Number.isNaN(n)) return '#ffffff';
  return (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 >= 128 ? '#111111' : '#ffffff';
};

class SlideCommit {
  constructor(root, o = {}) {
    this.o = Object.assign({
      label: 'Slide to pay', doneLabel: 'Paid', errorLabel: 'Payment failed', onConfirm: null, onDone: null, onError: null,
      trackColor: '#262626', handleColor: '#f5f5f5', successColor: '#22c55e', dangerColor: '#e5484d', labelColor: '',
      width: 280, height: 56, radius: 28, speed: 50, returnBounce: 0.38, landingDip: 0.026, holdMs: 1500,
      disabled: false, icon: '', fontSize: 0, inkColor: '', okInk: '',
    }, o);
    this.root = root;
    this.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.phase = 'idle'; this.held = false; this.hot = false;
    this.grip = null; this.timer = 0; this.homeTimer = 0; this.run = 0; this.unwatch = null; this.lastPercent = -1;
    this.build();
  }

  build() {
    const { o, root } = this;
    const GRIP = this.GRIP = o.height - SC_PAD * 2;
    const INNER = this.INNER = o.width - SC_PAD * 2;
    this.TRAVEL = Math.max(1, INNER - GRIP);
    const r = scClamp(o.radius, 0, o.height / 2);
    this.gripR = Math.max(0, r - SC_PAD);
    const k = 260 + (scClamp(o.speed, 0, 100) / 100) * 640, mass = 0.9, critical = 2 * Math.sqrt(k * mass);
    this.commitSpring = { stiffness: k, damping: critical, mass };
    this.homeSpring = { stiffness: k, damping: critical * (1 - scClamp(o.returnBounce, 0, 0.5)), mass };

    const fontSize = o.fontSize || scClamp(Math.round(o.height * 0.3), 14, 20);
    const iconSize = Math.round(GRIP * 0.42);
    root.classList.add('sc-root');
    root.dataset.phase = 'idle';
    if (o.disabled) root.dataset.disabled = '';
    Object.assign(root.style, { width: o.width + 'px', height: o.height + 'px' });
    const vars = {
      '--sc-track': o.trackColor, '--sc-ink': o.handleColor, '--sc-ok': o.successColor, '--sc-no': o.dangerColor,
      '--sc-on-ink': o.inkColor || scOnColor(o.handleColor), '--sc-on-ok': o.okInk || scOnColor(o.successColor), '--sc-on-no': scOnColor(o.dangerColor),
      '--sc-radius': r + 'px', '--sc-pad': SC_PAD + 'px', '--sc-font': fontSize + 'px', '--sc-grip-r': this.gripR + 'px', '--sc-inner': INNER + 'px',
      '--sc-say': o.labelColor || 'color-mix(in srgb, var(--sc-ink) 55%, transparent)',
    };
    for (const key in vars) root.style.setProperty(key, vars[key]);

    root.innerHTML = `
      <div class="sc-track">
        <span class="sc-say" aria-hidden="true"><span class="sc-label">${o.label}</span><span class="sc-err">${o.errorLabel}</span></span>
        <div class="sc-capsule" role="slider" tabindex="${o.disabled ? -1 : 0}" aria-label="${String(o.label).replace(/<[^>]*>/g, '')}"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="sc-content">
            <span class="sc-layer sc-arrow" aria-hidden="true">${o.icon || SC_ARROW(iconSize)}</span>
            <span class="sc-layer sc-spin" aria-hidden="true">${SC_SPINNER(iconSize)}</span>
            <span class="sc-layer sc-done" aria-hidden="true">${SC_TICK(Math.round(GRIP * 0.38))}<span>${o.doneLabel}</span></span>
          </div>
        </div>
        <span class="sr-only" aria-live="polite"></span>
      </div>`;
    this.track = root.querySelector('.sc-track');
    this.cap = root.querySelector('.sc-capsule');
    this.content = root.querySelector('.sc-content');
    this.say = root.querySelector('.sc-say');
    this.arrow = root.querySelector('.sc-arrow');
    this.spinEl = root.querySelector('.sc-spin');
    this.live = root.querySelector('[aria-live]');

    const change = () => this.paint();
    this.x = new ScValue(0, change);            // handle position, 0..TRAVEL (dips below 0 when it bounces off the wall)
    this.anchor = new ScValue(0, change);       // where the unfurled pill ends
    this.shown = new ScValue(1, change);        // the arrow
    this.spin = new ScValue(0, change);         // the spinner
    this.pulse = new ScValue(1, change);        // the track's little dip when the pill lands
    this.shake = new ScValue(0, change);        // sideways shake after a reject
    this.swell = new ScValue(1, change);        // hover

    this.track.addEventListener('pointerdown', e => this.down(e));
    this.cap.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse' && matchMedia('(hover: hover) and (pointer: fine)').matches) this.setHot(true); });
    this.cap.addEventListener('pointerleave', () => this.setHot(false));
    this.cap.addEventListener('keydown', e => this.keydown(e));
    this.paint();
  }

  paint() {
    const { TRAVEL, GRIP, INNER } = this;
    const xv = this.x.v, seen = scClamp(xv, 0, TRAVEL);
    const edge = seen + GRIP + scClamp(this.anchor.v - seen, 0, TRAVEL);
    this.cap.style.width = edge + 'px';
    this.content.style.transform = `translateX(${(seen + edge) / 2 - INNER / 2}px)`;
    const q = 1 - Math.min(SC_SQUASH_MAX, Math.max(0, -xv) / SC_SQUASH_DIV), sw = this.swell.v;
    this.cap.style.transform = `scale(${q * sw}, ${sw / q})`;
    this.cap.style.transformOrigin = `${seen}px 50%`;
    this.say.style.opacity = scClamp(1 - seen / (TRAVEL * 0.55), 0, 1);
    this.arrow.style.opacity = this.shown.v * scClamp(1 - (seen - TRAVEL * 0.55) / (TRAVEL * 0.4), 0, 1);
    this.spinEl.style.opacity = this.spin.v;
    this.track.style.transform = `translateX(${this.shake.v}px) scale(${this.pulse.v})`;
    const percent = Math.round((seen / TRAVEL) * 100);
    if (percent !== this.lastPercent) { this.lastPercent = percent; this.cap.setAttribute('aria-valuenow', percent); }
  }

  setPhase(p) {
    this.phase = p; this.root.dataset.phase = p;
    this.live.textContent = p === 'pending' ? 'đang xử lý' : p === 'done' ? this.o.doneLabel : p === 'error' ? this.o.errorLabel : '';
    this.refreshSwell();
  }
  setHot(on) { this.hot = on; this.refreshSwell(); }
  refreshSwell() {
    const to = this.hot && !this.held && this.phase === 'idle' && !this.reduce ? SC_SWELL : 1;
    if (this.swell.v !== to) this.swell.tween(to, { duration: 0.18 });
  }

  focus() { this.cap.focus({ preventScroll: true }); }

  // back to the start, as if never touched (the dialog it lives in is shown again)
  reset() {
    clearTimeout(this.timer); clearTimeout(this.homeTimer);
    this.run++;
    if (this.unwatch) this.unwatch();
    this.grip = null; this.held = false; delete this.root.dataset.held;
    for (const v of [this.x, this.anchor, this.spin, this.shake]) v.set(0);
    for (const v of [this.shown, this.pulse, this.swell]) v.set(1);
    this.setPhase('idle');
  }

  goHome(velocity) {
    if (this.reduce) this.x.tween(0, { duration: 0.2 });
    else this.x.spring(0, Object.assign({ velocity: Math.min(0, velocity) }, this.homeSpring));
  }

  settle() {
    this.setPhase('idle');
    this.shown.tween(1, { duration: 0.2, delay: 0.12 });
    if (this.reduce) this.anchor.set(0);
    else this.anchor.spring(0, { stiffness: 440, damping: 2 * Math.sqrt(440), mass: 1 });
  }

  resolve(viaKey) {
    const { o } = this;
    this.setPhase('done');
    this.anchor.set(this.x.get());
    this.spin.tween(0, { duration: 0.12 });
    if (this.reduce) this.x.set(0);
    else {
      this.x.spring(0, this.commitSpring);
      if (!viaKey && o.landingDip > 0) this.pulse.tween([1, 1 - o.landingDip, 1], { duration: 0.46, times: [0, 0.62, 1], delay: 0.1 });
    }
    if (o.onDone) o.onDone();
    if (o.holdMs > 0) this.timer = setTimeout(() => this.settle(), o.holdMs);
  }

  reject(reason) {
    const { o } = this;
    this.setPhase('error');
    if (o.onError) o.onError(reason);
    this.spin.tween(0, { duration: 0.12 });
    this.shown.tween(1, { duration: 0.2, delay: 0.12 });
    if (this.reduce) this.goHome(0);
    else {
      this.shake.tween(SC_SHAKE, { duration: 0.45 });
      this.homeTimer = setTimeout(() => { if (!this.grip) this.goHome(0); }, 300);
    }
    this.timer = setTimeout(() => this.setPhase('idle'), Math.max(o.holdMs, 1500));
  }

  commit(viaKey) {
    const { o } = this;
    clearTimeout(this.timer);
    const id = ++this.run;
    this.x.set(this.TRAVEL);
    let out;
    try { out = o.onConfirm ? o.onConfirm() : undefined; } catch (reason) { this.reject(reason); return; }
    const pending = out && typeof out.then === 'function' ? out : null;
    if (!pending) {
      this.shown.tween(0, { duration: 0.12 });
      this.resolve(viaKey);
      return;
    }
    this.setPhase('pending');
    this.shown.tween(0, { duration: 0.2 });
    this.spin.tween(1, { duration: 0.2 });
    const t0 = performance.now();
    const later = fn => setTimeout(() => { if (id === this.run) fn(); }, Math.max(0, SC_MIN_PENDING - (performance.now() - t0)));
    pending.then(() => later(() => this.resolve(viaKey)), reason => later(() => this.reject(reason)));
  }

  local(clientX) {
    const rect = this.track.getBoundingClientRect();
    return (clientX - rect.left) / (rect.width / this.o.width || 1);
  }

  down(e) {
    if (this.o.disabled || this.grip || this.phase === 'pending' || this.phase === 'done' || e.button !== 0) return;
    this.x.stop();
    this.grip = { id: e.pointerId, grab: null, moved: false, hist: [] };
    this.held = true; this.root.dataset.held = ''; this.refreshSwell();
    try { this.track.setPointerCapture(e.pointerId); } catch (err) { /* not capturable: window listeners still follow */ }
    if (this.unwatch) this.unwatch();
    const onMove = ev => { if (ev.isTrusted) this.move(ev); };
    const onUp = ev => { if (ev.isTrusted) this.up(ev); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    this.unwatch = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      this.unwatch = null;
    };
  }

  move(e) {
    const g = this.grip;
    if (!g || g.id !== e.pointerId) return;
    const at = this.local(e.clientX);
    if (g.grab === null) { g.grab = at - this.x.get(); return; }          // the handle stays under the finger where it was grabbed
    const next = scClamp(at - g.grab, 0, this.TRAVEL);
    if (Math.abs(next - this.x.get()) > 0.5) g.moved = true;
    g.hist.push([e.timeStamp, next]);
    if (g.hist.length > 4) g.hist.shift();
    this.x.set(next);
  }

  up(e) {
    const g = this.grip;
    if (!g || g.id !== e.pointerId) return;
    this.grip = null;
    if (this.unwatch) this.unwatch();
    try { this.track.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    this.held = false; delete this.root.dataset.held; this.refreshSwell();
    if (this.x.get() >= this.TRAVEL) this.commit(false);
    else if (g.moved) {
      const h = g.hist;
      const v = h.length < 2 ? 0 : ((h[h.length - 1][1] - h[0][1]) / Math.max(1, h[h.length - 1][0] - h[0][0])) * 1000;
      this.goHome(v);
    }
  }

  keydown(e) {
    if (this.o.disabled || this.phase === 'pending' || this.phase === 'done') return;
    const step = this.TRAVEL / 10;
    if (e.key === 'End') { e.preventDefault(); this.commit(true); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(this.TRAVEL, this.x.get() + step);
      this.x.set(next);
      if (next >= this.TRAVEL) this.commit(true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); this.x.set(Math.max(0, this.x.get() - step)); }
    else if (e.key === 'Home' || e.key === 'Escape') {
      e.preventDefault();
      if (this.grip) this.up({ pointerId: this.grip.id }); else this.x.set(0);
    }
  }
}
