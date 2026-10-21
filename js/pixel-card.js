'use strict';

// Pixel canvas for the logo cards (vanilla port of the React PixelCanvas).
// A grid of tiny squares ripples in from the centre of the card on hover and
// fades out on leave. Colours come from the card's own palette.

function createPixel(ctx, w, h, x, y, color, baseSpeed, delay) {
  const rand = (min, max) => Math.random() * (max - min) + min;
  const p = {
    x, y, color,
    speed: rand(0.1, 0.9) * baseSpeed,
    size: 0,
    sizeStep: Math.random() * 0.4,
    minSize: 0.5,
    maxSizeInt: 2,
    maxSize: rand(0.5, 2),
    delay,
    counter: 0,
    counterStep: Math.random() * 4 + (w + h) * 0.01,
    isIdle: false,
    isReverse: false,
    isShimmer: false,
    draw() {
      const offset = p.maxSizeInt * 0.5 - p.size * 0.5;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x + offset, p.y + offset, p.size, p.size);
    },
    appear() {
      p.isIdle = false;
      if (p.counter <= p.delay) { p.counter += p.counterStep; return; }
      if (p.size >= p.maxSize) p.isShimmer = true;
      if (p.isShimmer) p.shimmer();
      else p.size += p.sizeStep;
      p.draw();
    },
    disappear() {
      p.isShimmer = false;
      p.counter = 0;
      if (p.size <= 0) { p.isIdle = true; return; }
      p.size -= 0.1;
      p.draw();
    },
    shimmer() {
      if (p.size >= p.maxSize) p.isReverse = true;
      else if (p.size <= p.minSize) p.isReverse = false;
      if (p.isReverse) p.size -= p.speed;
      else p.size += p.speed;
    },
  };
  return p;
}

class PixelCard {
  constructor(card, colors, gap = 5, speed = 30) {
    this.card = card; this.colors = colors; this.gap = gap; this.speed = speed;
    this.pixels = []; this.raf = 0; this.last = performance.now();
    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this.wrap = document.createElement('div');
    this.wrap.className = 'px-wrap';
    this.canvas = document.createElement('canvas');
    this.wrap.appendChild(this.canvas);
    card.appendChild(this.wrap);

    this.init();
    new ResizeObserver(() => this.init()).observe(this.wrap);
    // hover is tracked on the card, so the canvas never blocks the logo above it
    card.addEventListener('mouseenter', () => this.animate('appear'));
    card.addEventListener('mouseleave', () => this.animate('disappear'));
  }

  setColors(colors) { this.colors = colors; this.init(); }

  init() {
    const { width, height } = this.wrap.getBoundingClientRect();
    const w = Math.floor(width), h = Math.floor(height);
    if (!w || !h) return;
    const d = Math.min(window.devicePixelRatio || 1, 2);       // crisp squares on retina
    const canvas = this.canvas;
    canvas.width = w * d; canvas.height = h * d;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(d, 0, 0, d, 0, 0);
    this.ctx = ctx; this.w = w; this.h = h; this.d = d;

    const speed = this.reduced ? 0 : Math.min(this.speed, 100) * 0.001;
    const pixels = [];
    // each pixel's delay is its distance from the centre, so the ripple travels outward
    for (let x = 0; x < w; x += this.gap) {
      for (let y = 0; y < h; y += this.gap) {
        const color = this.colors[Math.floor(Math.random() * this.colors.length)];
        const dx = x - w / 2, dy = y - h / 2;
        const delay = this.reduced ? 0 : Math.sqrt(dx * dx + dy * dy);
        pixels.push(createPixel(ctx, w, h, x, y, color, speed, delay));
      }
    }
    this.pixels = pixels;
  }

  animate(mode) {
    cancelAnimationFrame(this.raf);
    const frameInterval = 1000 / 60;
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const now = performance.now();
      const elapsed = now - this.last;
      if (elapsed < frameInterval) return;
      this.last = now - (elapsed % frameInterval);

      this.ctx.clearRect(0, 0, this.w, this.h);
      for (const px of this.pixels) px[mode]();
      if (this.pixels.every(px => px.isIdle)) cancelAnimationFrame(this.raf);
    };
    this.raf = requestAnimationFrame(loop);
  }
}
