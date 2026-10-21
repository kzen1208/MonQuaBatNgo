'use strict';

// Text that runs round a curve, forever (vanilla port of the TextLoop component).
//
//   <div data-tl='{"text":"anh yêu em","shape":"wave","ribbonColor":"#ff5c9a"}'></div>
//
// Options: shape (wave | circle | infinity | arch | line), path (custom SVG path, 1200x520 box), speed,
// direction, separator, curviness, tilt, cross, crossColor, crossAngle, draggable, scrollBoost,
// fontSize, fontWeight, letterSpacing, uppercase, outline, color, ribbon, ribbonColor, ribbonWidth,
// edgeFade, pauseOnHover, viewH (crop the box to a thinner strip). `text` is repeated along the curve.

const TL_NS = 'http://www.w3.org/2000/svg';
const TL_W = 1200, TL_H = 520, TL_CX = TL_W / 2, TL_CY = TL_H / 2, TL_PAD = 6;
const TL_MAX_FLING = 2600, TL_MAX_BOOST = 1600;
const tlClamp = (v, a, b) => Math.min(b, Math.max(a, v));
const tlWrap = (v, n) => ((v % n) + n) % n;
const tlSmoother = t => t * t * t * (t * (t * 6 - 15) + 10);

const tlCircleRadius = (curviness, ribbonWidth) =>
  Math.min(90 + Math.max(0, curviness) * 0.95, Math.max(20, TL_CY - Math.max(0, ribbonWidth) / 2 - TL_PAD));

function tlPath(shape, curviness, ribbonWidth, mirrored = false) {
  const c = Math.max(0, curviness);
  const room = Math.max(20, TL_CY - Math.max(0, ribbonWidth) / 2 - TL_PAD);
  const flip = mirrored ? -1 : 1;
  switch (shape) {
    case 'circle': {
      const r = tlCircleRadius(curviness, ribbonWidth);
      if (mirrored) {
        const rx = r * 1.22, ry = r * 0.42;
        return `M ${TL_CX - rx} ${TL_CY} A ${rx} ${ry} 0 1 1 ${TL_CX + rx} ${TL_CY} A ${rx} ${ry} 0 1 1 ${TL_CX - rx} ${TL_CY} Z`;
      }
      return `M ${TL_CX - r} ${TL_CY} A ${r} ${r} 0 1 1 ${TL_CX + r} ${TL_CY} A ${r} ${r} 0 1 1 ${TL_CX - r} ${TL_CY} Z`;
    }
    case 'infinity': {
      const r = 150 + c * 1.4, h = Math.min(60 + c * 0.95, room);
      return [`M ${TL_CX} ${TL_CY}`,
        `C ${TL_CX + r * 0.55} ${TL_CY - h} ${TL_CX + r} ${TL_CY - h} ${TL_CX + r} ${TL_CY}`,
        `C ${TL_CX + r} ${TL_CY + h} ${TL_CX + r * 0.55} ${TL_CY + h} ${TL_CX} ${TL_CY}`,
        `C ${TL_CX - r * 0.55} ${TL_CY - h} ${TL_CX - r} ${TL_CY - h} ${TL_CX - r} ${TL_CY}`,
        `C ${TL_CX - r} ${TL_CY + h} ${TL_CX - r * 0.55} ${TL_CY + h} ${TL_CX} ${TL_CY}`, 'Z'].join(' ');
    }
    case 'arch': {
      const rise = Math.min(120 + c * 1.1, room * 2) * flip;
      return `M 120 ${TL_CY + rise / 2} Q ${TL_CX} ${TL_CY - rise * 1.5} ${TL_W - 120} ${TL_CY + rise / 2}`;
    }
    case 'line':
      return `M -320 ${TL_CY} L ${TL_W + 320} ${TL_CY}`;
    default: {
      const a = Math.min(c * 2.2, room * 2) * flip;
      return `M -320 ${TL_CY} Q -160 ${TL_CY - a} 0 ${TL_CY} T 320 ${TL_CY} T 640 ${TL_CY} T 960 ${TL_CY} T 1280 ${TL_CY} T ${TL_W + 320} ${TL_CY}`;
    }
  }
}

function tlParseHex(v) {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(String(v || '').trim());
  if (!m) return null;
  const hex = m[1].length === 3 ? m[1].replace(/./g, ch => ch + ch) : m[1];
  return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
}
function tlTint(color, amount) {
  const rgb = tlParseHex(color);
  if (!rgb) return color;
  return '#' + rgb.map(v => Math.round(v + (255 - v) * amount).toString(16).padStart(2, '0')).join('');
}
function tlInkOn(color) {
  const rgb = tlParseHex(color);
  if (!rgb) return '#ffffff';
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2 ? '#120f17' : '#ffffff';
}

let tlCount = 0;
const svgEl = (name, attrs = {}, parent) => {
  const e = document.createElementNS(TL_NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

class TextLoop {
  constructor(root, o = {}) {
    this.root = root;
    this.o = Object.assign({ text: 'anh yêu em', shape: 'wave', speed: 90, direction: 'forward', separator: '♡', curviness: 90, tilt: 0,
      fontSize: 46, fontWeight: 800, letterSpacing: 2, uppercase: true, outline: false, outlineWidth: 1.5, ribbon: true,
      ribbonColor: '#5227FF', ribbonWidth: 86, edgeFade: 0, pauseOnHover: true, cross: false, crossAngle: 16,
      draggable: false, scrollBoost: 0, viewH: TL_H }, o);
    this.id = 'tl' + (++tlCount);
    this.travel = 0; this.length = 0; this.crossLength = 0;
    this.build();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.measure());
    this.measure();
    this.motion();
  }

  build() {
    const { o, id, root } = this;
    root.classList.add('tl');
    if (o.draggable) root.classList.add('draggable');
    const half = o.cross ? o.crossAngle / 2 : 0;
    this.mainAngle = o.tilt + half;
    const crossAngle = o.tilt - half;
    const ribbonOn = o.ribbon;
    const crossTape = o.crossColor || tlTint(o.ribbonColor, 0.62);
    const fill = o.color || (ribbonOn ? '#ffffff' : 'currentColor');
    const crossFill = ribbonOn ? tlInkOn(crossTape) : (o.crossColor || 'currentColor');
    const crossDim = !ribbonOn && !o.crossColor ? 0.45 : 1;
    const vy = TL_CY - o.viewH / 2;

    const svg = this.svg = svgEl('svg', { viewBox: `0 ${vy} ${TL_W} ${o.viewH}`, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': o.text }, root);
    const defs = svgEl('defs', {}, svg);

    let maskAttr = null;
    if (o.edgeFade > 0) {                                      // soft left and right edges
      const width = Math.min(1, o.edgeFade) * 0.3;
      const grad = svgEl('linearGradient', { id: id + 'f', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
      const stops = [];
      for (let i = 0; i <= 8; i++) stops.push([i / 8 * width, tlSmoother(i / 8)]);
      for (let i = 8; i >= 0; i--) stops.push([1 - i / 8 * width, tlSmoother(i / 8)]);
      stops.forEach(([off, op]) => svgEl('stop', { offset: off, 'stop-color': '#fff', 'stop-opacity': op }, grad));
      const mask = svgEl('mask', { id: id + 'm', maskUnits: 'userSpaceOnUse', x: 0, y: vy, width: TL_W, height: o.viewH }, defs);
      svgEl('rect', { x: 0, y: vy, width: TL_W, height: o.viewH, fill: `url(#${id}f)` }, mask);
      maskAttr = `url(#${id}m)`;
    }

    this.measureEl = svgEl('text', { class: 'tl-measure', 'aria-hidden': 'true' }, svg);
    const textStyle = `font-size:${o.fontSize}px;font-weight:${o.fontWeight};letter-spacing:${o.letterSpacing}px`;
    this.measureEl.setAttribute('style', textStyle);

    const stage = svgEl('g', maskAttr ? { mask: maskAttr } : {}, svg);
    const paint = (ink, opacity) => o.outline
      ? { fill: 'none', stroke: ink, 'stroke-opacity': opacity, 'stroke-width': o.outlineWidth, 'stroke-linejoin': 'round' }
      : { fill: ink, 'fill-opacity': opacity };
    const ribbonAttrs = tape => ribbonOn
      ? { fill: 'none', stroke: tape, 'stroke-width': o.ribbonWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
      : { fill: 'none', stroke: 'none', 'stroke-width': 0 };
    const band = (parent, pid, d, tape, ink, opacity) => {
      const pathEl = svgEl('path', Object.assign({ id: pid, d }, ribbonAttrs(tape)), parent);
      const mkText = () => {
        const t = svgEl('text', Object.assign({ class: 'tl-text', style: textStyle, 'dominant-baseline': 'central', 'aria-hidden': 'true', lengthAdjust: 'spacing' }, paint(ink, opacity)), parent);
        const tp = svgEl('textPath', { href: '#' + pid, startOffset: 0 }, t);
        return { t, tp };
      };
      return { pathEl, head: mkText(), tail: mkText() };
    };

    const d = o.path || tlPath(o.shape, o.curviness, o.ribbonWidth);
    if (o.cross) {
      const crossD = o.path || tlPath(o.shape, o.curviness, o.ribbonWidth, ['wave', 'arch', 'circle'].includes(o.shape));
      const g = svgEl('g', crossAngle ? { transform: `rotate(${crossAngle} ${TL_CX} ${TL_CY})` } : {}, stage);
      this.crossBand = band(g, id + 'c', crossD, crossTape, crossFill, crossDim);
      if (ribbonOn) {                                          // the top band throws a soft shadow on the one below
        const filt = svgEl('filter', { id: id + 's', filterUnits: 'userSpaceOnUse', x: -TL_W, y: -TL_H, width: TL_W * 3, height: TL_H * 3 }, defs);
        svgEl('feGaussianBlur', { stdDeviation: Math.max(4, o.ribbonWidth * 0.11) }, filt);
        const under = svgEl('mask', { id: id + 'u', maskUnits: 'userSpaceOnUse', x: -TL_W, y: -TL_H, width: TL_W * 3, height: TL_H * 3 }, defs);
        const ug = svgEl('g', crossAngle ? { transform: `rotate(${crossAngle} ${TL_CX} ${TL_CY})` } : {}, under);
        svgEl('path', { d: crossD, fill: 'none', stroke: '#fff', 'stroke-width': o.ribbonWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ug);
        const shadowWrap = svgEl('g', { mask: `url(#${id}u)` }, stage);
        const sg = svgEl('g', { filter: `url(#${id}s)`, transform: `translate(0 ${Math.max(4, o.ribbonWidth * 0.08)})` }, shadowWrap);
        const mg = svgEl('g', this.mainAngle ? { transform: `rotate(${this.mainAngle} ${TL_CX} ${TL_CY})` } : {}, sg);
        svgEl('path', { d, fill: 'none', stroke: '#000', 'stroke-opacity': 0.42, 'stroke-width': o.ribbonWidth, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, mg);
      }
    }
    const main = svgEl('g', this.mainAngle ? { transform: `rotate(${this.mainAngle} ${TL_CX} ${TL_CY})` } : {}, stage);
    this.mainBand = band(main, id + 'p', d, o.ribbonColor, fill, 1);
  }

  measure() {
    const { o } = this;
    const pathEl = this.mainBand.pathEl;
    let length = 0, crossLength = 0;
    try {
      length = pathEl.getTotalLength();
      crossLength = this.crossBand ? this.crossBand.pathEl.getTotalLength() : 0;
    } catch (e) { return; }
    if (!length) return;

    const gap = '\u00A0' + o.separator + '\u00A0';
    const unit = (o.uppercase ? o.text.toUpperCase() : o.text) + gap;
    this.measureEl.textContent = unit;
    const width = this.measureEl.getComputedTextLength();
    if (!width) return;
    this.length = length; this.crossLength = crossLength;
    const fit = (band, len) => {
      const text = unit.repeat(Math.max(1, Math.round(len / width)));
      for (const part of [band.head, band.tail]) {
        part.tp.textContent = text;
        part.t.setAttribute('textLength', len);
      }
    };
    fit(this.mainBand, length);
    if (this.crossBand && crossLength) fit(this.crossBand, crossLength);
    this.apply();
  }

  apply() {
    if (!this.length) return;
    const off = tlWrap(this.travel, this.length);
    this.mainBand.head.tp.setAttribute('startOffset', off);
    this.mainBand.tail.tp.setAttribute('startOffset', off - this.length);
    if (this.crossBand && this.crossLength) {
      const co = tlWrap(-this.travel, this.crossLength);
      this.crossBand.head.tp.setAttribute('startOffset', co);
      this.crossBand.tail.tp.setAttribute('startOffset', co - this.crossLength);
    }
  }

  motion() {
    const { o, root, svg } = this;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sign = o.direction === 'reverse' ? -1 : 1;
    const base = reduced ? 0 : Math.max(0, o.speed) * sign;
    const angle = (this.mainAngle * Math.PI) / 180;
    const boosting = o.scrollBoost > 0 && !reduced;
    let hover = 1, hoverTarget = 1, fling = 0, boost = 0, scrollV = 0, scrollAt = 0, scrollPos = window.scrollY;
    let dragging = false, pid = null, lastX = 0, lastT = 0, lastY = 0, velocity = 0;
    let raf = 0, last = 0;

    const tick = now => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (dragging) return;
      hover += (hoverTarget - hover) * (1 - Math.exp(-dt / (hoverTarget === 0 ? 0.2 : 0.3)));   // eases to a stop and back up
      fling *= Math.exp(-dt / 0.55);
      if (boosting) {
        if (performance.now() - scrollAt > 90) scrollV *= Math.exp(-dt / 0.12);
        const target = tlClamp(scrollV * o.scrollBoost * 0.35 * sign, -TL_MAX_BOOST, TL_MAX_BOOST);
        boost += (target - boost) * (1 - Math.exp(-dt / 0.18));
      }
      const v = base * hover + fling + boost;
      if (Math.abs(v) < 0.01) return;
      this.travel += v * dt;
      this.apply();
    };
    const start = () => { if (!raf && !reduced) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };
    new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(root);

    if (o.pauseOnHover) {
      root.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') hoverTarget = 0; });
      root.addEventListener('pointerleave', () => { hoverTarget = 1; });
    }
    if (o.draggable) {
      root.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        dragging = true; pid = e.pointerId; root.setPointerCapture(e.pointerId);
        lastX = e.clientX; lastY = e.clientY; lastT = performance.now(); velocity = base * hover + fling + boost;
        root.style.cursor = 'grabbing';
      });
      root.addEventListener('pointermove', e => {
        if (!dragging || e.pointerId !== pid) return;
        const now = performance.now();
        const scale = TL_W / (svg.getBoundingClientRect().width || TL_W);
        const delta = ((e.clientX - lastX) * Math.cos(angle) + (e.clientY - lastY) * Math.sin(angle)) * scale;
        this.travel += delta; this.apply();
        velocity = velocity * 0.6 + (delta / (Math.max(1, now - lastT) / 1000)) * 0.4;
        lastX = e.clientX; lastY = e.clientY; lastT = now;
      });
      const up = e => {
        if (!dragging || e.pointerId !== pid) return;
        dragging = false; pid = null; root.style.cursor = '';
        if (reduced) return;
        const release = performance.now() - lastT > 90 ? 0 : tlClamp(velocity, -TL_MAX_FLING, TL_MAX_FLING);
        fling = release - (base * hover + boost);              // a throw keeps its momentum, then eases back
      };
      root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
    }
    if (boosting) {
      window.addEventListener('scroll', () => {                 // scrolling pushes the loop
        const now = performance.now(), pos = window.scrollY;
        if (now - scrollAt > 200) { scrollPos = pos; scrollAt = now; return; }
        scrollV = scrollV * 0.5 + ((pos - scrollPos) / (Math.max(8, now - scrollAt) / 1000)) * 0.5;
        scrollPos = pos; scrollAt = now;
      }, { passive: true });
    }
  }
}

const textLoops = [...document.querySelectorAll('[data-tl]')].map(el => new TextLoop(el, JSON.parse(el.dataset.tl)));
