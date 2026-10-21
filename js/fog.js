'use strict';

// ---- constants (tuned values) ----
const HANDS_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/';
const FACE_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_detection@0.4.1646425229/';
const MAX_HANDS = 2, DETECT_CONF = 0.6, TRACK_CONF = 0.6;

const FOG_START = 0;                     // the glass starts perfectly clear: only breath fogs it
const REFOG_SPOIL = 8;                   // this much breath over a finished drawing covers it again
const FOG_MIN_DOSE = 6;                  // about a third of a second of real breath before there is fog to draw in
const FROST_BLUR = 18, FROST_BRIGHT = 1.18, FROST_SAT = 0.82, FROST_TINT = 'rgba(242,238,231,0.62)';
const FROST_SCALE = 0.5;                 // fog/frost resolution relative to device pixels

// breath: a haze over the whole glass, and a wide soft puff that is densest where the breath lands
const HAZE = 0.02, PUFF = 0.075, PUFF_REACH = 0.62, PUFF_DROP = 0.08;     // per ~33 ms of full breath; the puff sits a little below the mouth
const FACE_EVERY = 3, FACE_EASE = 0.5, FACE_LOST_MS = 1500;

const BREATH_ON = 0.0025, BREATH_FULL = 0.003, FLOOR_DOWN = 0.05, FLOOR_UP = 0.0008, KEY_QUIET_MS = 300;
const MUSIC_GATE = 2.2, MUSIC_FLOOR = 3;      // with music playing, its sound leaks into the mic: the gate is higher and the floor follows faster

const PEN_DOWN = 0.22, PEN_UP = 0.38, INDEX_OUT = 1.05;
const EASE_RAW = 0.45, EASE_BRUSH = 0.22, EASE_STAR = 0.55, TREMOR = 0.0006;
const SNAP = 0.05;      // a point further than this fraction of the width behind the finger stops being smoothed and just catches up
const LIFT_MS = 250, LIFT_FRAMES = 2;
const STAR_SIZE = 15, GHOST_SIZE = 6;

const WIPE_MULT = 1.6, WIPE_ALPHA = 0.34, WIPE_SOFT = 0.60, WIPE_MAX_STAMPS = 40, WIPE_JUMP = 0.30, WIPE_EASE = 0.5;
// an open hand wipes like a real one, but only while it sweeps across the glass (speeds in palm widths per second)
const WIPE_OPEN = 0.9, SWEEP_ON = 1.3, SWEEP_OFF = 0.55, SWEEP_EASE = 0.5;

// ---- elements ----
const $ = id => document.getElementById(id);
const canvas = $('view'), ctx = canvas.getContext('2d');
const video = $('cam');
const startEl = $('start'), goBtn = $('go'), errEl = $('err');
const hintEl = $('hint'), statusEl = $('status'), dbgEl = $('dbg'), flashEl = $('flash');
const brushEl = $('brush'), sizeEl = $('size'), shutterEl = $('shutter');

const fogCanvas = document.createElement('canvas'), fc = fogCanvas.getContext('2d');
const frostCanvas = document.createElement('canvas'), tc = frostCanvas.getContext('2d');
const smallCanvas = document.createElement('canvas'), sc = smallCanvas.getContext('2d');
const HAS_FILTER = 'filter' in CanvasRenderingContext2D.prototype;

// ---- state ----
let W = 0, H = 0, dpr = 1, S = 1;
let running = false, loopId = 0, frame = 0, fps = 0, fpsAt = 0, fpsN = 0, debug = false;
let stream = null, audioCtx = null, analyser = null, audioBuf = null;
let hands = null, faces = null, modelsPromise = null, ready = false, handsBusy = false, faceBusy = false, faceAt = 0;

let lastKey = -1e9, spaceDown = false;
let noiseFloor = null, level = 0, breath = 0, fogDose = 0, refog = 0, musicPlaying = false;

const mouth = { x: 0, y: 0, found: false };
const fogPos = { x: 0, y: 0 };
let brushR = +sizeEl.value;
let hintGone = false, statusTimer = 0;

const pt = () => ({ x: 0, y: 0 });
function newHand() {
  return { present: false, seenAt: 0, ratio: 1, pinched: false, penDown: false, released: 0, lastPinchAt: 0,
    fist: false, pinch: pt(), palm: pt(), hand: pt(), width: 40, speed: 0, sweeping: false, sampleAt: 0, samplePalm: pt(),
    sm1: pt(), brush: pt(), prev: pt(), mid: pt(), lastDraw: pt(), star: pt(), starOn: false,
    wipePrev: null, wipePos: null, wipeR: 30 };
}
const tracked = [];
for (let i = 0; i < MAX_HANDS; i++) tracked.push(newHand());

function say(text, keep) {
  statusEl.textContent = text;
  statusEl.classList.remove('gone');
  clearTimeout(statusTimer);
  if (!keep) statusTimer = setTimeout(() => statusEl.classList.add('gone'), 2600);
}

// ---- geometry helpers ----
function coverRect() {
  const vw = video.videoWidth, vh = video.videoHeight;
  const k = Math.max(W / vw, H / vh);
  const w = vw * k, h = vh * k;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
// normalized video landmark -> CSS px on screen (mirrored)
function toScreen(p, r) { return { x: r.x + (1 - p.x) * r.w, y: r.y + p.y * r.h }; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- canvas sizing ----
function resize() {
  W = window.innerWidth; H = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  S = dpr * FROST_SCALE;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const fw = Math.round(W * S), fh = Math.round(H * S);
  frostCanvas.width = fw; frostCanvas.height = fh;
  if (fogCanvas.width && fogCanvas.height) {
    const old = document.createElement('canvas');
    old.width = fogCanvas.width; old.height = fogCanvas.height;
    old.getContext('2d').drawImage(fogCanvas, 0, 0);
    fogCanvas.width = fw; fogCanvas.height = fh;
    fc.drawImage(old, 0, 0, fw, fh);
  } else {
    fogCanvas.width = fw; fogCanvas.height = fh;
    resetFog();
  }
}
function resetFog() {
  fogDose = 0;
  fc.setTransform(1, 0, 0, 1, 0, 0);
  fc.globalCompositeOperation = 'source-over';
  fc.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
  fc.fillStyle = `rgba(255,255,255,${FOG_START})`;
  fc.fillRect(0, 0, fogCanvas.width, fogCanvas.height);
}
window.addEventListener('resize', resize);

// ---- fog: add ----
const PUFF_STOPS = [[0, 1], [0.2, 0.86], [0.4, 0.58], [0.6, 0.31], [0.8, 0.11], [1, 0]];   // bell-shaped, no visible edge
let lastFogAt = 0;
function fogUp(strength, now) {
  const s = Math.min(1, Math.max(0, strength));
  const k = lastFogAt ? Math.min(3, (now - lastFogAt) / 33.3) : 1;                        // the same amount per second at any frame rate
  lastFogAt = now;
  fogDose += s * k;
  fc.setTransform(S, 0, 0, S, 0, 0);
  fc.globalCompositeOperation = 'source-over';
  fc.fillStyle = `rgba(255,255,255,${HAZE * s * k})`;                                      // nothing on the glass stays bare
  fc.fillRect(0, 0, W, H);
  const cx = fogPos.x, cy = fogPos.y + H * PUFF_DROP;
  const R = Math.max(W, H) * PUFF_REACH * (0.7 + 0.5 * s);                                  // a harder breath spreads wider
  const a = PUFF * s * k;
  const g = fc.createRadialGradient(cx, cy, 0, cx, cy, R);
  for (const [t, f] of PUFF_STOPS) g.addColorStop(t, `rgba(255,255,255,${a * f})`);
  fc.fillStyle = g;
  fc.fillRect(cx - R, cy - R, R * 2, R * 2);
}

// ---- fog: erase (destination-out only) ----
function eraseDot(x, y, r) {
  fc.setTransform(S, 0, 0, S, 0, 0);
  fc.globalCompositeOperation = 'destination-out';
  fc.fillStyle = '#000';
  fc.beginPath(); fc.arc(x, y, r, 0, Math.PI * 2); fc.fill();
  fc.globalCompositeOperation = 'source-over';
}
function eraseCurve(m0, c, m1, r) {
  fc.setTransform(S, 0, 0, S, 0, 0);
  fc.globalCompositeOperation = 'destination-out';
  fc.strokeStyle = '#000'; fc.lineWidth = r * 2; fc.lineCap = 'round'; fc.lineJoin = 'round';
  fc.beginPath(); fc.moveTo(m0.x, m0.y); fc.quadraticCurveTo(c.x, c.y, m1.x, m1.y); fc.stroke();
  fc.globalCompositeOperation = 'source-over';
}
function wipeStamp(x, y, r) {
  fc.setTransform(S, 0, 0, S, 0, 0);
  fc.globalCompositeOperation = 'destination-out';
  const g = fc.createRadialGradient(x, y, r * (1 - WIPE_SOFT), x, y, r);
  g.addColorStop(0, `rgba(0,0,0,${WIPE_ALPHA})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  fc.fillStyle = g;
  fc.fillRect(x - r, y - r, r * 2, r * 2);
  fc.globalCompositeOperation = 'source-over';
}

// ---- breath ----
function readBreath() {
  if (!analyser) { breath = 0; return; }
  analyser.getFloatTimeDomainData(audioBuf);
  let sum = 0;
  for (let i = 0; i < audioBuf.length; i++) sum += audioBuf[i] * audioBuf[i];
  level = Math.sqrt(sum / audioBuf.length);
  if (noiseFloor === null) noiseFloor = level;
  const quiet = performance.now() - lastKey < KEY_QUIET_MS;
  const g = musicPlaying ? MUSIC_GATE : 1;
  const over = level - noiseFloor - BREATH_ON * g;
  breath = quiet ? 0 : Math.min(1, Math.max(0, over / ((BREATH_FULL - BREATH_ON) * g)));
  // floor chases the level: quickly down, very slowly up
  noiseFloor += (level - noiseFloor) * (level < noiseFloor ? FLOOR_DOWN : FLOOR_UP * (musicPlaying ? MUSIC_FLOOR : 1));
}

// ---- gestures ----
function onHands(res) {
  const list = res.multiHandLandmarks || [], world = res.multiHandWorldLandmarks || [];
  const now = performance.now();
  for (let i = 0; i < MAX_HANDS; i++) {
    if (list[i]) updateHand(tracked[i], list[i], world[i], now);
    else loseHand(tracked[i], now);
  }
}

function loseHand(h, now) {
  h.present = false; h.fist = false; h.sweeping = false; h.speed = 0; h.sampleAt = 0;
  if (h.penDown) { h.released++; maybeLift(h, now); }   // keep the pen through a flicker
  else h.pinched = false;
}

function updateHand(h, lm, wl, now) {
  const vw = video.videoWidth, vh = video.videoHeight;
  // 3D, so a thumb that only overlaps the finger in the image (but sits in front of or behind it) is not a pinch,
  // and turning the hand does not shrink the reference length. Metric world landmarks when available.
  const P = wl ? (i => wl[i]) : (i => ({ x: lm[i].x * vw, y: lm[i].y * vh, z: lm[i].z * vw }));
  const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  h.present = true; h.seenAt = now;

  h.ratio = d3(P(4), P(8)) / d3(P(0), P(9));
  if (h.ratio < PEN_DOWN) h.pinched = true; else if (h.ratio > PEN_UP) h.pinched = false;

  const wr = P(0);
  const curled = (tip, pip) => d3(wr, P(tip)) < d3(wr, P(pip));
  const fist = curled(8, 6) && curled(12, 10) && curled(16, 14) && curled(20, 18);
  const indexOut = d3(wr, P(8)) > d3(wr, P(6)) * INDEX_OUT;

  const r = coverRect();
  const s = i => toScreen(lm[i], r);
  const t4 = s(4), t8 = s(8);
  h.pinch.x = (t4.x + t8.x) / 2; h.pinch.y = (t4.y + t8.y) / 2;
  // palm centre: wrist plus the four knuckles, steadier than any single joint
  let px = 0, py = 0;
  for (const i of [0, 5, 9, 13, 17]) { const q = s(i); px += q.x; py += q.y; }
  h.palm.x = px / 5; h.palm.y = py / 5;
  h.width = Math.max(dist(s(5), s(17)), dist(s(0), s(9)));
  // the whole hand's centre, and how fast it travels: sweeping an open hand over the glass clears it
  let hx = 0, hy = 0;
  for (let i = 0; i < 21; i++) { const q = s(i); hx += q.x; hy += q.y; }
  h.hand.x = hx / 21; h.hand.y = hy / 21;
  if (h.sampleAt && now > h.sampleAt) {
    const inst = dist(h.palm, h.samplePalm) / h.width / ((now - h.sampleAt) / 1000);
    h.speed += (inst - h.speed) * SWEEP_EASE;
  } else h.speed = 0;
  h.sampleAt = now; h.samplePalm.x = h.palm.x; h.samplePalm.y = h.palm.y;
  if (h.pinched) h.sweeping = false;
  else if (!h.sweeping && h.speed > SWEEP_ON) h.sweeping = true;
  else if (h.sweeping && h.speed < SWEEP_OFF) h.sweeping = false;

  if (!h.penDown) {
    // the extended index is what separates a pinch from a fist with the thumb resting on it
    if (h.pinched && !fist && indexOut) {
      h.penDown = true; h.released = 0; h.lastPinchAt = now;
      for (const k of ['sm1', 'brush', 'prev', 'mid', 'lastDraw']) { h[k].x = h.pinch.x; h[k].y = h.pinch.y; }
      eraseDot(h.brush.x, h.brush.y, brushR);
    }
  } else if (h.pinched) {
    h.released = 0; h.lastPinchAt = now;
  } else {
    h.released++; maybeLift(h, now);
  }
  h.fist = fist && !h.penDown;
  h.open = !fist && !h.pinched && !h.penDown;
}
function maybeLift(h, now) {
  if (h.released >= LIFT_FRAMES && now - h.lastPinchAt >= LIFT_MS) { h.penDown = false; h.pinched = false; }
}

// smooth when the finger is nearly still, follow it closely when it moves: no trailing behind a quick stroke
function chase(cur, target, ease) {
  const k = Math.min(1, ease + dist(cur, target) / (SNAP * W));
  cur.x += (target.x - cur.x) * k; cur.y += (target.y - cur.y) * k;
}

function stepPen(h) {
  if (!h.penDown) return;
  chase(h.sm1, h.pinch, EASE_RAW);
  chase(h.brush, h.sm1, EASE_BRUSH);
  if (dist(h.brush, h.lastDraw) < TREMOR * W) return;
  const mid = { x: (h.prev.x + h.brush.x) / 2, y: (h.prev.y + h.brush.y) / 2 };
  eraseCurve(h.mid, h.prev, mid, brushR);
  h.mid.x = mid.x; h.mid.y = mid.y;
  h.prev.x = h.brush.x; h.prev.y = h.brush.y;
  h.lastDraw.x = h.brush.x; h.lastDraw.y = h.brush.y;
}

function stepWipe(h) {
  const open = h.open && h.sweeping;                                  // an open hand moving across the glass
  if (!(h.present && (h.fist || open) && !h.penDown)) { h.wipePrev = null; h.wipePos = null; return; }
  const at = h.fist ? h.palm : h.hand, r = (h.fist ? WIPE_MULT : WIPE_OPEN) * h.width;
  if (!h.wipePos) { h.wipePos = { x: at.x, y: at.y }; h.wipeR = r; }
  else {
    h.wipePos.x += (at.x - h.wipePos.x) * WIPE_EASE; h.wipePos.y += (at.y - h.wipePos.y) * WIPE_EASE;
    h.wipeR += (r - h.wipeR) * WIPE_EASE;
  }
  const pos = h.wipePos, rad = h.wipeR;
  if (!h.wipePrev) { wipeStamp(pos.x, pos.y, rad); h.wipePrev = { x: pos.x, y: pos.y }; return; }
  const dx = pos.x - h.wipePrev.x, dy = pos.y - h.wipePrev.y;
  const d = Math.hypot(dx, dy);
  if (d > WIPE_JUMP * W) {            // tracking dropped out and came back: don't paint a streak
    wipeStamp(pos.x, pos.y, rad);
    h.wipePrev.x = pos.x; h.wipePrev.y = pos.y;
    return;
  }
  const spacing = rad / 2;
  const n = Math.min(WIPE_MAX_STAMPS, Math.floor(d / spacing));
  for (let i = 1; i <= n; i++) {
    wipeStamp(h.wipePrev.x + dx / d * spacing * i, h.wipePrev.y + dy / d * spacing * i, rad);
  }
  if (n > 0) { h.wipePrev.x += dx / d * spacing * n; h.wipePrev.y += dy / d * spacing * n; }
}

// ---- face ----
function onFace(res) {
  const d = res.detections && res.detections[0];
  if (!d) return;
  const pts = d.landmarks || d.keypoints;
  if (!pts || !pts[3]) return;
  const p = toScreen(pts[3], coverRect());       // index 3 = mouth centre
  mouth.x = p.x; mouth.y = p.y; mouth.found = true; faceAt = performance.now();
}

// ---- render ----
function drawMirrored(c, r) {
  c.save(); c.translate(W, 0); c.scale(-1, 1);
  c.drawImage(video, r.x, r.y, r.w, r.h);
  c.restore();
}
function renderFrost(r) {
  const fw = frostCanvas.width, fh = frostCanvas.height;
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.globalCompositeOperation = 'source-over';
  tc.clearRect(0, 0, fw, fh);
  tc.setTransform(S, 0, 0, S, 0, 0);
  const pad = FROST_BLUR * 2;                    // oversize so the blur doesn't fade at the edges
  const rp = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
  if (HAS_FILTER) {
    tc.filter = `blur(${FROST_BLUR * S}px) brightness(${FROST_BRIGHT}) saturate(${FROST_SAT})`;
    drawMirrored(tc, rp);
    tc.filter = 'none';
  } else {
    const k = Math.max(2, FROST_BLUR * S / 1.5);
    smallCanvas.width = Math.max(8, Math.round(fw / k)); smallCanvas.height = Math.max(8, Math.round(fh / k));
    sc.setTransform(smallCanvas.width / W, 0, 0, smallCanvas.height / H, 0, 0);
    drawMirrored(sc, rp);
    tc.setTransform(1, 0, 0, 1, 0, 0);
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(smallCanvas, 0, 0, fw, fh);
    tc.setTransform(S, 0, 0, S, 0, 0);
  }
  tc.fillStyle = FROST_TINT;
  tc.fillRect(0, 0, W, H);
  // the fog canvas decides how much of the frost shows
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.globalCompositeOperation = 'destination-in';
  tc.drawImage(fogCanvas, 0, 0);
  tc.globalCompositeOperation = 'source-over';
}
function renderScene() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (video.readyState < 2 || !video.videoWidth) return;
  const r = coverRect();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMirrored(ctx, r);
  renderFrost(r);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(frostCanvas, 0, 0, W, H);
}

// four-point curved star with a soft glow; spins slowly
function drawStar(x, y, spin) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(x, y); ctx.rotate(spin);
  const gr = STAR_SIZE * 1.6;
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
  g.addColorStop(0, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, fat = STAR_SIZE * 0.46;
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(Math.cos(a - .35) * fat, Math.sin(a - .35) * fat, Math.cos(a) * STAR_SIZE, Math.sin(a) * STAR_SIZE);
    ctx.quadraticCurveTo(Math.cos(a + .35) * fat, Math.sin(a + .35) * fat, 0, 0);
  }
  ctx.fill();
  ctx.restore();
}
// hand seen but not pinching: a thin ring so you know it is tracked
function drawGhost(x, y) {
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath(); ctx.arc(x, y, GHOST_SIZE, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();
}

function updateDebug() {
  const gate = noiseFloor === null ? 0 : noiseFloor + BREATH_ON;
  const lines = [
    'mic ' + level.toFixed(4) + '  floor ' + (noiseFloor || 0).toFixed(4) + '  gate ' + gate.toFixed(4) +
      (breath > 0 ? '  FOGGING ' + breath.toFixed(2) : '  quiet') + (analyser ? '' : '  (no mic)'),
    'face ' + (performance.now() - faceAt < 700 ? 'locked' : 'lost') + '   ' + fps + ' fps   ready ' + ready,
  ];
  tracked.forEach((h, i) => {
    lines.push('hand ' + i + ' ' + (h.present ? 'ratio ' + h.ratio.toFixed(2) + (h.penDown ? '  PEN' : h.pinched ? '  pinch' : '') +
      (h.fist ? '  FIST' : '') : '-'));
  });
  dbgEl.textContent = lines.join('\n');
}

// ---- main loop ----
async function pumpHands() {
  handsBusy = true;
  try { await hands.send({ image: video }); } finally { handsBusy = false; }
}
async function pumpFace() {
  faceBusy = true;
  try { await faces.send({ image: video }); } finally { faceBusy = false; }
}

function startLoop() {
  const id = ++loopId;                       // one switch: an older loop notices and ends
  const step = () => {
    if (!running || id !== loopId) return;
    requestAnimationFrame(step);
    tick();
  };
  requestAnimationFrame(step);
}

function tick() {
  frame++;
  const now = performance.now();
  fpsN++;
  if (now - fpsAt > 500) { fps = Math.round(fpsN * 1000 / (now - fpsAt)); fpsN = 0; fpsAt = now; if (debug) updateDebug(); }

  if (!mirrorVisible) return;                    // scrolled down to the next section: nothing to do

  const camOk = video.readyState >= 2 && video.videoWidth > 0;
  if (ready && camOk && !handsBusy) pumpHands();
  if (ready && camOk && frame % FACE_EVERY === 0 && !faceBusy) pumpFace();

  readBreath();
  const strength = spaceDown ? 1 : breath;

  if (mouth.found && now - faceAt > FACE_LOST_MS) mouth.found = false;        // no face for a while: breathe from the middle
  const tx = mouth.found ? mouth.x : W / 2, ty = mouth.found ? mouth.y : H * 0.45;
  fogPos.x += (tx - fogPos.x) * FACE_EASE; fogPos.y += (ty - fogPos.y) * FACE_EASE;

  let drawing = false;
  if (!isFrozen()) {
    for (const h of tracked) {
      stepPen(h); stepWipe(h);
      if (h.penDown || h.wipePrev !== null) drawing = true;
    }
    const inking = drawing && fogDose >= FOG_MIN_DOSE;             // strokes on clear glass leave nothing, so they do not count
    if (inking && !hintGone) { hintGone = true; hintEl.classList.add('gone'); }
    if (strength > 0 && !drawing) {                                 // you can always breathe the glass over again
      if (frame % 2 === 0) fogUp(strength, now);
      if (inkMs > 0 && (refog += strength) > REFOG_SPOIL) { inkSpoiled(); refog = 0; }
    } else {
      lastFogAt = 0;
      if (drawing) refog = 0;
    }
    watchIdle(now, inking);
  }

  renderScene();
  if (debug && mouth.found) {                    // D: a ring where the face tracker thinks the mouth is
    ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath(); ctx.arc(mouth.x, mouth.y, 16, 0, Math.PI * 2); ctx.strokeStyle = '#ff8fb8'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  const spin = now / 1000 * 0.18;
  for (const h of tracked) {
    if (!h.present) { h.starOn = false; continue; }
    if (!h.starOn) { h.star.x = h.pinch.x; h.star.y = h.pinch.y; h.starOn = true; }
    chase(h.star, h.pinch, EASE_STAR);
    if (h.pinched || h.penDown) drawStar(h.star.x, h.star.y, spin);
    else drawGhost(h.star.x, h.star.y);
  }
}

// ---- start / back ----
function showError(msg) { errEl.textContent = msg; if (msg) startSlide.reset(); }
function showUI(on) {
  for (const el of [brushEl, shutterEl]) el.classList.toggle('hidden', !on);
  startEl.classList.toggle('hidden', on);
  if (!on) { hintEl.classList.add('hidden'); statusEl.classList.add('gone'); }
}

async function openMedia() {
  const video_ = { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } };
  const audio_ = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  try {
    return { stream: await navigator.mediaDevices.getUserMedia({ video: video_, audio: audio_ }), mic: true };
  } catch (e) {
    // maybe only the microphone is the problem; the camera alone still makes a mirror
    return { stream: await navigator.mediaDevices.getUserMedia({ video: video_ }), mic: false };
  }
}

function describeCameraError(e) {
  let msg;
  if (e.name === 'NotAllowedError' || e.name === 'SecurityError') {
    msg = 'Camera đang bị chặn. Hãy cho phép camera cho trang này trong cài đặt trình duyệt, rồi trượt để bắt đầu lại nha.';
  } else if (e.name === 'NotFoundError' || e.name === 'OverconstrainedError') {
    msg = 'Không tìm thấy camera.';
  } else if (e.name === 'NotReadableError') {
    msg = 'Camera đang được ứng dụng khác sử dụng.';
  } else {
    msg = 'Không mở được camera: ' + e.name + (e.message ? ' (' + e.message + ')' : '');
  }
  if (location.protocol === 'file:') msg += ' Mở trực tiếp file (file://) sẽ không được: hãy chạy qua http://localhost.';
  return msg;
}

async function openCamera() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  ac.resume();
  let media;
  try {
    media = await openMedia();
  } catch (e) {
    ac.close();
    throw e;
  }
  stream = media.stream;
  audioCtx = ac;
  analyser = null;
  if (media.mic) {
    const src = ac.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
    analyser = ac.createAnalyser();
    analyser.fftSize = 2048;
    audioBuf = new Float32Array(analyser.fftSize);
    src.connect(analyser);               // not connected to the speakers
  }
  noiseFloor = null;
  video.srcObject = new MediaStream(stream.getVideoTracks());
  await video.play();
}

async function loadModels() {
  hands = new Hands({ locateFile: f => HANDS_URL + f });
  hands.setOptions({ maxNumHands: MAX_HANDS, modelComplexity: 1, minDetectionConfidence: DETECT_CONF, minTrackingConfidence: TRACK_CONF });
  hands.onResults(onHands);
  faces = new FaceDetection({ locateFile: f => FACE_URL + f });
  faces.setOptions({ model: 'short', minDetectionConfidence: 0.5 });
  faces.onResults(onFace);
  // one at a time: both runtimes share a global Module while loading
  await hands.initialize();
  await faces.initialize();
  ready = true;
}

function resetHands() {
  for (let i = 0; i < MAX_HANDS; i++) tracked[i] = newHand();
  spaceDown = false; mouth.found = false;
}

async function start() {
  showError('');
  if (typeof Hands === 'undefined' || typeof FaceDetection === 'undefined') {
    showError('Không tải được phần nhận diện bàn tay. Kiểm tra mạng rồi tải lại trang nha.');
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showError('Trang này cần https hoặc localhost mới mở được camera. Hãy chạy bằng python3 -m http.server thay vì mở file trực tiếp.');
    return;
  }
  goBtn.disabled = true; goBtn.textContent = 'đang mở camera…';
  if (!stream) {
    try {
      await openCamera();
    } catch (e) {
      goBtn.disabled = false; goBtn.textContent = 'bắt đầu';
      showError(describeCameraError(e));
      return;
    }
  }
  goBtn.disabled = false; goBtn.textContent = 'bắt đầu';

  resize(); resetFog(); resetHands();
  fogPos.x = W / 2; fogPos.y = H * 0.45;
  showUI(true);
  hintGone = false; hintEl.classList.remove('hidden', 'gone');
  running = true;
  startLoop();

  if (!analyser) say('không có micro: giữ phím cách để hà hơi', false);
  if (!ready) {
    say('đang tải nhận diện bàn tay…', true);
    if (!modelsPromise) modelsPromise = loadModels();
    await modelsPromise;
    say('sẵn sàng');
  }
}

// Esc: back to the start screen. The camera and mic stay open, so start again is instant and asks nothing twice.
function toStart() {
  if (!running) return;
  running = false; loopId++;
  resetCapture();
  resetHands();
  resetFog();
  showUI(false);
  goBtn.textContent = 'bắt đầu';
  startSlide.reset();
  blurTexts.filter(t => startEl.contains(t.el)).forEach(t => t.reset());   // the headline comes in again
}

function savePng() {
  renderScene();                                  // fresh frame without star or readouts
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bức vẽ của em ' + new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '.') + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }, 'image/png');
  flashEl.classList.remove('pop'); void flashEl.offsetWidth; flashEl.classList.add('pop');
}

// ---- input ----
goBtn.addEventListener('click', start);
const startSlide = new SlideCommit($('startSlide'), {
  label: 'trượt để bắt đầu', doneLabel: 'mở gương…', width: 300, height: 62, radius: 31,
  trackColor: 'rgba(255,255,255,0.14)', handleColor: '#ffd0e1', inkColor: '#5a1b34', successColor: '#ff5c9a', okInk: '#ffffff',
  labelColor: 'rgba(255,227,238,0.8)', holdMs: 0,
  onConfirm: () => { goBtn.click(); },                  // the slide is the user gesture the camera and audio need
});
sizeEl.addEventListener('input', () => { brushR = +sizeEl.value; });
shutterEl.addEventListener('click', savePng);
window.addEventListener('keydown', e => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (!running || isFrozen()) return;           // keys belong to the photo prompt or the page below
  if (e.code === 'Escape') { toStart(); return; }
  if (e.code === 'Space') { spaceDown = true; e.preventDefault(); return; }
  lastKey = performance.now();                    // key clicks must not read as breath
  if (e.code === 'KeyC') resetFog();
  else if (e.code === 'KeyS') savePng();
  else if (e.code === 'KeyD') { debug = !debug; dbgEl.classList.toggle('hidden', !debug); updateDebug(); }
});
window.addEventListener('keyup', e => { if (e.code === 'Space') spaceDown = false; });
window.addEventListener('blur', () => { spaceDown = false; });

// show uncaught errors on screen too (they still throw to the console)
function reportCrash(msg) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:16px;right:16px;top:48px;z-index:99;padding:10px 14px;border-radius:12px;' +
    'font:13px/1.4 ui-monospace,Menlo,monospace;color:#fff;background:rgba(160,30,20,0.85);white-space:pre-wrap';
  el.textContent = 'lỗi: ' + msg;
  document.body.appendChild(el);
}
window.addEventListener('error', e => reportCrash(e.message + (e.lineno ? ' (line ' + e.lineno + ')' : '')));
window.addEventListener('unhandledrejection', e => reportCrash(String(e.reason && e.reason.stack || e.reason)));

if (location.protocol === 'file:') {
  errEl.textContent = 'Lưu ý: đang mở trực tiếp bằng file. Camera cần https hoặc localhost (thử: python3 -m http.server).';
}
resize();
