'use strict';

// After you stop drawing for a few seconds the mirror takes a picture of what you left,
// asks if you want to keep it, and then scrolls down to the next section.

const IDLE_MS = 4000;         // quiet time after the last stroke before the photo
const INK_MIN_MS = 1500;      // how long you must have drawn for it to count as a drawing
const COUNTDOWN_MS = 2000;    // "hold still" lead-in (the last 2 of those seconds)

const mirrorEl = $('mirror'), afterEl = $('after');
const confirmEl = $('confirm'), confirmImg = $('confirmImg');
const shotImg = $('shotImg'), shotCap = $('shotCap'), saveLink = $('saveLink');

let page = 'mirror';          // 'mirror' | 'gallery'
let confirmOpen = false, mirrorVisible = true;
let inkMs = 0, lastActive = 0, lastFrameAt = 0, countdownN = 0, shotUrl = null;

// breath came back over the drawing: it is covered again, so the photo timer starts over (the glass fogs whenever you breathe)
function inkSpoiled() {
  inkMs = 0; countdownN = 0;
  statusEl.classList.add('gone');
}

// the mirror stops reacting while the photo is being confirmed or you are down on the page
const isFrozen = () => confirmOpen || page !== 'mirror';

// only strokes count as activity: room noise that happens to fog the glass must not keep the timer alive
function watchIdle(now, drawing) {
  const dt = lastFrameAt ? Math.min(100, now - lastFrameAt) : 0;
  lastFrameAt = now;
  if (drawing) inkMs += dt;
  if (drawing) {
    lastActive = now;
    if (countdownN) { countdownN = 0; statusEl.classList.add('gone'); }
    return;
  }
  if (inkMs < INK_MIN_MS) return;
  const left = IDLE_MS - (now - lastActive);
  if (left <= 0) { countdownN = 0; capture(); return; }
  if (left <= COUNTDOWN_MS) {
    const n = Math.ceil(left / 1000);
    if (n !== countdownN) { countdownN = n; say('giữ yên nha · chụp sau ' + n + ' giây', true); }
  }
}

function capture() {
  confirmOpen = true;
  for (const h of tracked) { h.penDown = false; h.pinched = false; h.wipePrev = null; h.wipePos = null; }
  renderScene();                                   // a clean frame: no star, no readouts
  canvas.toBlob(blob => {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = URL.createObjectURL(blob);
    confirmImg.src = shotUrl;
    statusEl.classList.add('gone');
    flashEl.classList.remove('pop'); void flashEl.offsetWidth; flashEl.classList.add('pop');
    confirmEl.classList.remove('hidden');
    keepSlide.reset(); againSlide.reset(); keepSlide.focus();
  }, 'image/png');
}

function resetCapture() {
  appMenu.hide();
  confirmOpen = false; page = 'mirror';
  inkMs = 0; countdownN = 0; lastFrameAt = 0; lastActive = performance.now();
  confirmEl.classList.add('hidden');
}

function drawAgain() {
  resetCapture();
  resetFog();
}

function keepShot() {
  if (!shotUrl) return;
  confirmEl.classList.add('hidden');
  confirmOpen = false;                             // from here on `page` keeps the mirror frozen
  page = 'gallery';
  blurTexts.forEach(t => t.reset());              // the words come in again each time
  fillGallery();
  appMenu.show();                                 // the menu appears once there is something to go to
  glassDesk.addPhoto(shotUrl, new Date());
  document.documentElement.classList.remove('lock');
  afterEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function backToMirror() {
  resetCapture();
  resetFog();
  // a beat later, so the key press that brought us here cannot cancel the smooth scroll; the observer re-locks the page
  setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 60);
}

function fillGallery() {
  const stamp = new Date();
  shotImg.onload = () => photoPixels.setColors(paletteFrom(shotImg));
  shotImg.src = shotUrl;
  shotCap.textContent = stamp.toLocaleString('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
  saveLink.href = shotUrl;
  saveLink.download = 'bức vẽ của em ' + stamp.toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.') + '.png';
}

// a handful of colours from the picture itself, so the ripple over it feels like it belongs to it
function paletteFrom(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 4;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, 4, 4);
  const d = g.getImageData(0, 0, 4, 4).data;
  const out = ['#ffffff'];
  for (let i = 0; i < d.length; i += 16) out.push(`rgb(${d[i]},${d[i + 1]},${d[i + 2]})`);
  return out;
}

// ---- wiring ----
$('keep').addEventListener('click', keepShot);
$('again').addEventListener('click', drawAgain);

// the two answers are slides: a short spinner, a check, and then it happens
const slideLook = { width: 300, radius: 28, holdMs: 0, landingDip: 0.03 };
const keepSlide = new SlideCommit($('keepSlide'), Object.assign({}, slideLook, {
  label: 'trượt để giữ bức này', doneLabel: 'đã giữ ♡', height: 58,
  trackColor: '#3d1230', handleColor: '#ffc2dc', inkColor: '#5a1b34', successColor: '#e0407e', okInk: '#ffffff', labelColor: 'rgba(255,214,230,0.85)',
  onConfirm: () => new Promise(r => setTimeout(r, 120)),
  onDone: () => setTimeout(() => { if (confirmOpen) keepShot(); }, 700),
}));
const againSlide = new SlideCommit($('againSlide'), Object.assign({}, slideLook, {
  label: 'trượt để vẽ lại', doneLabel: 'vẽ lại nè', height: 48, radius: 24,
  trackColor: 'rgba(255,255,255,0.12)', handleColor: '#f6dce8', inkColor: '#5a1b34', successColor: '#a64d7a', okInk: '#ffffff', labelColor: 'rgba(255,230,240,0.7)',
  onConfirm: () => new Promise(r => setTimeout(r, 120)),
  onDone: () => setTimeout(() => { if (confirmOpen) drawAgain(); }, 600),
}));
$('back').addEventListener('click', backToMirror);

window.addEventListener('keydown', e => {
  if (!running) return;
  if (confirmOpen) {
    if (e.code === 'Enter') { e.preventDefault(); keepShot(); }
    else if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); drawAgain(); }
  } else if (page === 'gallery' && e.code === 'Escape') { e.preventDefault(); if (!closeFolders()) backToMirror(); }
});

// the page stays locked on the mirror; it only scrolls once you have kept a picture
new IntersectionObserver(entries => {
  const r = entries[0].intersectionRatio;
  mirrorVisible = r > 0.5;
  document.body.classList.toggle('away', !mirrorVisible);
  if (page === 'mirror' && r >= 0.99) document.documentElement.classList.add('lock');
}, { threshold: [0, 0.5, 0.99, 1] }).observe(mirrorEl);

const notes = [...document.querySelectorAll('#after .card.note')].map(el => ({ el, px: new PixelCard(el, JSON.parse(el.dataset.colors)) }));
const photoPixels = new PixelCard($('photoCard'), ['#ffffff', '#f3efe8'], 6, 35);
