'use strict';

// Blur-in text: every word (or letter) comes into focus on its own.
// A vanilla port of the BlurText component, built on the Web Animations API.
//
//   <h2 data-bt='{"effect":"blur","animateBy":"words","delay":140}'>text here</h2>
//
// Options: effect (blur | zoom | tilt | focus | drift), animateBy (words | letters),
// direction (top | bottom | left | right), staggerFrom (start | center | end | random),
// trigger (view | load | hover | click), delay (ms between pieces), stepDuration (s),
// loop, loopDelay (s), blur (px), distance (px), fromColor, focusOnHover, threshold, rootMargin.

const BT_EASE_OUT = 'cubic-bezier(0.33, 1, 0.68, 1)';
const BT_EASE_IN_OUT = 'cubic-bezier(0.65, 0, 0.35, 1)';
const BT_EASE_IN = 'cubic-bezier(0.55, 0, 0.9, 0.45)';
const BT_COLOR_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const BT_AXES = { top: ['y', -1], bottom: ['y', 1], left: ['x', -1], right: ['x', 1] };
const BT_REST = { blur: 0, opacity: 1, x: 0, y: 0, scale: 1, rotateX: 0, rotateY: 0, skewX: 0 };

// one place to say how each effect starts, where it goes when it leaves, and how it settles
function btEffect(effect, direction, blur, distance) {
  const [axis, sign] = BT_AXES[direction] || BT_AXES.top;
  const b = Math.max(0, blur), d = distance;
  const snap = o => Object.assign({}, BT_REST, o);

  if (effect === 'zoom') return {
    from: snap({ blur: b * 1.2, opacity: 0, scale: 1.4, [axis]: sign * d * 0.35 }),
    exit: snap({ blur: b, opacity: 0, scale: 0.82, [axis]: -sign * d * 0.2 }),
    fade: BT_EASE_OUT, bounce: 0.25, settle: 0.5, exitEase: BT_EASE_IN };

  if (effect === 'tilt') {
    const rot = axis === 'y' ? 'rotateX' : 'rotateY', lean = axis === 'y' ? -sign : sign;
    return {
      from: snap({ blur: b, opacity: 0, [rot]: lean * 55, [axis]: sign * d * 0.5, persp: 600 }),
      exit: snap({ blur: b, opacity: 0, [rot]: -lean * 40, [axis]: -sign * d * 0.3, persp: 600 }),
      fade: BT_EASE_OUT, bounce: 0.3, settle: 0.8, exitEase: BT_EASE_IN,
      origin: `${axis === 'x' ? (sign < 0 ? 0 : 100) : 50}% ${axis === 'y' ? (sign < 0 ? 0 : 100) : 50}%` };
  }

  if (effect === 'focus') {
    const soft = snap({ blur: b * 1.4, opacity: 0.32, scale: 1.12 });
    return { from: soft, exit: soft, fade: BT_EASE_IN_OUT, bounce: null, settle: 1, exitEase: BT_EASE_IN_OUT };
  }

  if (effect === 'drift') {
    const h = direction === 'right' ? 1 : -1, v = axis === 'y' ? sign : 0;
    return {
      from: snap({ blur: b, opacity: 0, x: h * d * 1.6, y: v * d * 0.3, skewX: h * 28 }),
      exit: snap({ blur: b, opacity: 0, x: -h * d * 1.2, y: -v * d * 0.2, skewX: h * 20 }),
      fade: BT_EASE_OUT, bounce: 0.3, settle: 0.55, exitEase: BT_EASE_IN };
  }

  return {                                                     // blur: slides in from a side
    from: snap({ blur: b, opacity: 0, [axis]: sign * d }),
    exit: snap({ blur: b, opacity: 0, [axis]: -sign * d * 0.6 }),
    fade: 'linear', bounce: 0.35, settle: 0.5, exitEase: BT_EASE_IN };
}

// a snapshot as CSS. Every transform function is always present, so the browser interpolates them one by one
function btCss(s, persp) {
  const t = [];
  if (persp) t.push(`perspective(${persp}px)`);
  t.push(`translate(${s.x}px, ${s.y}px)`, `rotateX(${s.rotateX}deg)`, `rotateY(${s.rotateY}deg)`, `skewX(${s.skewX}deg)`, `scale(${s.scale})`);
  return { filter: `blur(${Math.max(0, s.blur)}px)`, opacity: s.opacity, transform: t.join(' ') };
}

// a real spring, sampled into a CSS linear() easing (overshoot included)
const BT_HAS_LINEAR = window.CSS && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)');
function btSpring(bounce, visualMs) {
  const z = 1 - bounce, phi = Math.acos(z);
  const wd = (Math.PI - phi) / visualMs;                       // first reaches the target at visualMs
  const w = wd / Math.sqrt(1 - z * z);
  const end = Math.log(500) / (z * w);
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * end;
    const x = 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + (z * w / wd) * Math.sin(wd * t));
    pts.push(+x.toFixed(4));
  }
  pts[48] = 1;
  return { duration: end, easing: BT_HAS_LINEAR ? `linear(${pts.join(', ')})` : 'cubic-bezier(0.34, 1.45, 0.64, 1)' };
}

function btRanks(count, from, seedText) {
  const ranks = Array.from({ length: count }, (_, i) => i);
  if (from === 'end') return ranks.map(i => count - 1 - i);
  if (from === 'center') {
    const mid = (count - 1) / 2, off = count % 2 === 0 ? 0.5 : 0;
    return ranks.map(i => Math.abs(i - mid) - off);
  }
  if (from === 'random') {
    let seed = 2166136261;
    for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619) >>> 0;
    const next = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const order = ranks.slice();
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.forEach((piece, rank) => { ranks[piece] = rank; });
  }
  return ranks;
}

class BlurText {
  constructor(el, o = {}) {
    this.el = el;
    this.o = Object.assign({ animateBy: 'words', direction: 'top', staggerFrom: 'start', trigger: 'view', delay: 200, stepDuration: 0.35,
      loop: false, loopDelay: 2, blur: 10, distance: 50, effect: 'blur', threshold: 0.1, rootMargin: '0px', focusOnHover: false, startDelay: 0 }, o);
    this.text = (o.text || el.textContent.trim()).replace(/\s*\|\s*/g, ' | ');   // a lone | in the text is a line break
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.fx = btEffect(this.o.effect, this.o.direction, this.o.blur, this.o.distance);
    this.timer = 0; this.observer = null; this.settled = false; this.phase = 'from';
    this.onComplete = o.onAnimationComplete;
    this.build();

    const t = this.o.trigger;
    if (t === 'hover') el.addEventListener('pointerenter', () => { if (this.settled) this.replay(); });
    if (t === 'click') { el.style.cursor = 'pointer'; el.addEventListener('click', () => this.replay()); }
    this.reset();
  }

  build() {
    const { el, o } = this;
    el.classList.add('blur-text');
    el.textContent = '';
    const sr = document.createElement('span');
    sr.className = 'sr-only'; sr.textContent = this.text.replace(' | ', ' ');   // screen readers get the plain sentence
    el.appendChild(sr);

    this.pieces = [];
    const tokens = this.text.split(' ');
    const words = tokens.filter(t => t !== '|');
    let w = -1;
    tokens.forEach(word => {
      if (word === '|') { const br = document.createElement('span'); br.className = 'bt-br'; el.appendChild(br); return; }
      w++;
      const group = document.createElement('span');
      group.className = 'bt-word';
      const last = w === words.length - 1;
      const parts = o.animateBy === 'words' ? [last ? word : word + ' ']
        : [...Array.from(word), ...(last ? [] : [' '])];
      parts.forEach(content => {
        const p = document.createElement('span');
        p.className = 'bt-piece'; p.setAttribute('aria-hidden', 'true'); p.textContent = content;
        if (this.fx.origin) p.style.transformOrigin = this.fx.origin;
        group.appendChild(p); this.pieces.push(p);
      });
      if (o.focusOnHover) {
        group.addEventListener('pointerenter', () => el.querySelectorAll('.bt-word').forEach(g => g.classList.toggle('bt-dim', g !== group)));
        group.addEventListener('pointerleave', () => el.querySelectorAll('.bt-word').forEach(g => g.classList.remove('bt-dim')));
      }
      el.appendChild(group);
    });
    this.ranks = btRanks(this.pieces.length, o.staggerFrom, this.text);
    this.maxRank = this.ranks.reduce((m, r) => Math.max(m, r), 0);
  }

  get total() { return this.o.stepDuration * 2; }               // seconds for one piece to come in
  get stagger() { return Math.max(0, this.o.delay) / 1000; }

  clearAnims() { for (const p of this.pieces) p.getAnimations().forEach(a => a.cancel()); }

  show(snapshot, color) {
    const css = btCss(snapshot, snapshot.persp);
    for (const p of this.pieces) {
      p.style.transition = 'none';
      p.style.filter = css.filter; p.style.opacity = css.opacity; p.style.transform = css.transform;
      p.style.color = color || '';
    }
  }

  // back to the start; plays again when it is next in view (or at once, for `load`)
  reset() {
    clearTimeout(this.timer);
    if (this.observer) this.observer.disconnect();
    this.clearAnims(); this.settled = false;
    const t = this.o.trigger;
    if (this.reduced || t === 'hover' || t === 'click') { this.rest(); return; }
    this.phase = 'from';
    this.show(this.fx.from, this.o.fromColor);
    if (t === 'load') { this.play(); return; }
    this.observer = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { this.observer.disconnect(); this.play(); }
    }, { threshold: this.o.threshold, rootMargin: this.o.rootMargin });
    this.observer.observe(this.el);
  }

  rest() {
    this.clearAnims();
    for (const p of this.pieces) { p.style.transition = 'none'; p.style.filter = ''; p.style.opacity = ''; p.style.transform = ''; p.style.color = ''; }
    this.phase = 'rest'; this.settled = true;
    if (this.o.loop && !this.reduced) this.timer = setTimeout(() => this.leave(), this.o.loopDelay * 1000);
  }

  // the words come in
  play() {
    const { fx, o } = this;
    this.phase = 'in'; this.settled = false;
    const from = btCss(fx.from, fx.from.persp), rest = btCss(BT_REST, fx.from.persp);
    const total = this.total * 1000;
    const spring = fx.bounce === null ? null : btSpring(fx.bounce, total * fx.settle);
    this.pieces.forEach((p, i) => {
      const delay = o.startDelay + this.ranks[i] * this.stagger * 1000;
      p.getAnimations().forEach(a => a.cancel());
      if (!spring) {
        p.animate([from, rest], { duration: total, delay, easing: fx.fade, fill: 'both' });
      } else {
        p.animate([{ filter: from.filter, opacity: from.opacity }, { filter: rest.filter, opacity: rest.opacity }],
          { duration: total, delay, easing: fx.fade, fill: 'both' });
        p.animate([{ transform: from.transform }, { transform: rest.transform }],
          { duration: spring.duration, delay, easing: spring.easing, fill: 'both' });
      }
      if (o.fromColor) {                                       // starts in one colour, settles into the text colour
        p.style.transition = `color ${total * 0.9}ms ${BT_COLOR_EASE} ${delay}ms`;
        p.style.color = '';
      }
    });
    const settle = (total * (spring ? Math.max(1, fx.settle * 2.2) : 1)) + o.startDelay + this.maxRank * this.stagger * 1000;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.settled = true; this.phase = 'rest';
      if (this.onComplete) this.onComplete();
      if (o.loop) this.timer = setTimeout(() => this.leave(), o.loopDelay * 1000);
    }, settle);
  }

  // blurs back out (then comes in again)
  leave() {
    const { fx, o } = this;
    this.phase = 'out'; this.settled = false;
    const rest = btCss(BT_REST, fx.from.persp), exit = btCss(fx.exit, fx.from.persp);
    const dur = o.stepDuration * 1300, stg = this.stagger * 0.4 * 1000;
    this.pieces.forEach((p, i) => {
      p.getAnimations().forEach(a => a.cancel());
      p.animate([rest, exit], { duration: dur, delay: this.ranks[i] * stg, easing: fx.exitEase, fill: 'both' });
      if (o.fromColor) { p.style.transition = `color ${dur}ms ${BT_COLOR_EASE} ${this.ranks[i] * stg}ms`; p.style.color = o.fromColor; }
    });
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.play(), dur + this.maxRank * stg);
  }

  replay() {
    if (this.phase === 'out' || this.phase === 'from') return;
    clearTimeout(this.timer);
    this.leave();
  }
}

const blurTexts = [...document.querySelectorAll('[data-bt]')].map(el => new BlurText(el, JSON.parse(el.dataset.bt)));
