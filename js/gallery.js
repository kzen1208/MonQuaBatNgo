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
  resetDraw();                                    // a new picture gets a new answer
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

// ---- the draw ----
// The notes round the picture light up one after another and stop on one: that note is the answer for this
// drawing (picked from the drawing itself, so the same picture always gets the same one). The answer card above
// runs through the notes like a slot machine while it happens, so it works on a phone where the notes are below the fold.
const phone = window.matchMedia('(max-width: 760px)');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const noteEls = notes.map(n => n.el);
const RING = [0, 1, 2, 4, 7, 6, 5, 3];                              // clockwise round the picture on the wide layout
const gridEl = document.querySelector('#after .grid'), answerEl = $('answer'), answerMsg = $('answerMsg'), answerTag = $('answerTag'), repickBtn = $('repick');
const TAG_IDLE = 'một lời dành riêng cho bức vẽ này', TAG_DRAWING = 'đang bốc đáp án…', TAG_DONE = 'đáp án dành cho bức vẽ này';
let drawToken = 0, drawn = false, lastWinner = -1, drawTimer = 0;

noteEls.forEach(el => {                                             // each note's own pastel, used for the glow
  const c = JSON.parse(el.dataset.colors);
  el.style.setProperty('--c1', c[1]); el.style.setProperty('--c2', c[0]);
});

// the same picture gives the same number: a hash of a tiny copy of it
function winnerFor(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 8;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, 8, 8);
    const d = g.getImageData(0, 0, 8, 8).data;
    let h = 2166136261;
    for (let i = 0; i < d.length; i += 4) { h ^= (d[i] >> 3) + (d[i + 1] >> 3) * 3 + (d[i + 2] >> 3) * 7; h = Math.imul(h, 16777619); }
    return (h >>> 0) % noteEls.length;
  } catch (e) { return Math.floor(Math.random() * noteEls.length); }
}

function light(i, on) {
  noteEls[i].classList.toggle('lit', on);
  notes[i].px.animate(on ? 'appear' : 'disappear');
}

function confetti(el) {
  const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const marks = ['♡', '♥', '✦', '✿'], tints = ['#ff5c9a', '#ff8fb8', '#ffb3d1', '#e0407e'];
  for (let i = 0; i < 18; i++) {
    const s = document.createElement('span');
    s.className = 'confetti'; s.textContent = marks[i % 4];
    s.style.cssText = `left:${cx}px;top:${cy}px;color:${tints[i % 4]};font-size:${14 + Math.random() * 16}px`;
    document.body.appendChild(s);
    const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 130;
    s.animate([
      { transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 50}px)) scale(1) rotate(${Math.random() * 90 - 45}deg)`, opacity: 0 },
    ], { duration: 1100 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).onfinish = () => s.remove();
  }
}

function resetDraw() {
  drawToken++; drawn = false; clearTimeout(drawTimer);
  noteEls.forEach((el, i) => { if (el.classList.contains('lit') || el.classList.contains('win')) notes[i].px.animate('disappear'); el.classList.remove('lit', 'win'); });
  gridEl.classList.remove('decided');
  answerEl.classList.remove('drawing', 'shown');
  answerTag.textContent = TAG_IDLE; answerMsg.classList.remove('blur-text'); answerMsg.textContent = '…';
}

function runDraw(winner) {
  const my = ++drawToken;
  clearTimeout(drawTimer);
  noteEls.forEach(el => el.classList.remove('lit', 'win'));
  gridEl.classList.remove('decided');
  answerEl.classList.add('drawing'); answerEl.classList.remove('shown');
  answerTag.textContent = TAG_DRAWING;
  const order = phone.matches ? noteEls.map((_, i) => i) : RING;
  const steps = reduceMotion.matches ? 1 : order.length * 2 + order.indexOf(winner) + 1;   // two laps, then on to the winner
  let i = 0, prev = -1;
  const step = () => {
    if (my !== drawToken) return;
    const idx = reduceMotion.matches ? winner : order[i % order.length];
    if (prev >= 0 && prev !== idx) light(prev, false);
    light(idx, true); prev = idx;
    answerMsg.classList.remove('blur-text');
    answerMsg.textContent = noteEls[idx].querySelector('.vi').textContent;                   // the card flickers through the words
    i++;
    if (i < steps) drawTimer = setTimeout(step, 70 + 380 * Math.pow(i / steps, 3));         // fast, then slower and slower
    else land(winner, my);
  };
  step();
}

function land(winner, my) {
  if (my !== drawToken) return;
  const el = noteEls[winner];
  el.classList.add('win'); gridEl.classList.add('decided');
  confetti(el);
  answerEl.classList.remove('drawing'); answerEl.classList.add('shown');
  answerTag.textContent = TAG_DONE;
  new BlurText(answerMsg, { text: el.dataset.msg, effect: 'blur', direction: 'top', trigger: 'load', animateBy: 'words', delay: 90, stepDuration: 0.5, blur: 12, distance: 30 });
  lastWinner = winner;
}

// the draw starts once the answer card is on screen
new IntersectionObserver(entries => {
  if (!entries[0].isIntersecting || drawn || page !== 'gallery') return;
  drawn = true;
  drawTimer = setTimeout(() => runDraw(winnerFor(shotImg)), 600);
}, { threshold: 0.75 }).observe(answerEl);

repickBtn.addEventListener('click', () => {
  let w;
  do { w = Math.floor(Math.random() * noteEls.length); } while (w === lastWinner && noteEls.length > 1);
  runDraw(w);
});

// on a phone the notes come up one by one as they scroll into view
const revealIO = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    revealIO.unobserve(e.target);
    const k = noteEls.indexOf(e.target) % 2;
    setTimeout(() => e.target.classList.remove('pre'), k * 90);
  }
}, { threshold: 0.2 });
if (phone.matches && !reduceMotion.matches) noteEls.forEach(el => { el.classList.add('pre'); revealIO.observe(el); });
