'use strict';

// A small music corner. It plays whatever sits in the music/ folder: the folder listing is read
// (the dev server lists it), or music/playlist.json when there is one. Drop in files and press play.

const MUSIC_DIR = 'music/';
const MUSIC_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i;
const MUSIC_VOL = 0.4, MUSIC_FADE_MS = 280;

const musicEl = document.createElement('div');
musicEl.id = 'music'; musicEl.className = 'empty';
musicEl.setAttribute('role', 'group'); musicEl.setAttribute('aria-label', 'nhạc');
musicEl.innerHTML = `
  <button class="mp-play" type="button" aria-label="phát nhạc">
    <span class="mp-ring" aria-hidden="true"></span>
    <svg class="i-play" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>
    <svg class="i-pause" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/></svg>
  </button>
  <div class="mp-info">
    <div class="mp-title"><span>chưa có bài nào</span></div>
    <div class="mp-bar" role="slider" aria-label="tua bài" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><i></i></div>
  </div>
  <button class="mp-next" type="button" aria-label="bài tiếp theo">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 6.2v11.6a.9.9 0 0 0 1.4.75l8.2-5.8a.9.9 0 0 0 0-1.5L7.4 5.45A.9.9 0 0 0 6 6.2z"/><rect x="17" y="5.5" width="2.6" height="13" rx="1.1"/></svg>
  </button>
  <input class="mp-vol" type="range" min="0" max="1" step="0.01" value="${MUSIC_VOL}" aria-label="âm lượng">`;
document.body.appendChild(musicEl);

const mpPlay = musicEl.querySelector('.mp-play'), mpNext = musicEl.querySelector('.mp-next');
const mpTitle = musicEl.querySelector('.mp-title'), mpTitleText = mpTitle.firstElementChild;
const mpBar = musicEl.querySelector('.mp-bar'), mpVol = musicEl.querySelector('.mp-vol');

const musicAudio = new Audio();
musicAudio.preload = 'metadata';
let tracks = [], trackAt = 0, scanned = false, userVolume = MUSIC_VOL, fadeId = 0, everPlayed = false;

try { const v = parseFloat(localStorage.getItem('musicVolume')); if (v >= 0 && v <= 1) userVolume = v; } catch (e) { /* no storage: keep the default */ }
mpVol.value = userVolume;
musicAudio.volume = userVolume;

// ---- finding the songs ----
async function scanMusic() {
  // songs come from music/playlist.json (works on any host) and from the folder listing (the dev server shows one);
  // whatever is in either is played, so dropping a file in is enough while developing
  const files = [], seen = new Set();
  const add = f => { if (f.file && !seen.has(f.file)) { seen.add(f.file); files.push(f); } };
  try {
    const res = await fetch(MUSIC_DIR + 'playlist.json', { cache: 'no-store' });
    if (res.ok) (await res.json()).forEach(f => add(typeof f === 'string' ? { file: f } : f));
  } catch (e) { /* no playlist file */ }
  try {
    const res = await fetch(MUSIC_DIR, { cache: 'no-store' });
    if (res.ok) {
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      [...doc.querySelectorAll('a')].map(a => a.getAttribute('href') || '')
        .filter(h => MUSIC_EXT.test(h.split('?')[0]) && !/^([a-z]+:|\/|\.\.)/i.test(h))
        .forEach(h => add({ file: decodeURIComponent(h) }));
    }
  } catch (e) { /* not served with a folder listing */ }
  files.sort((a, b) => a.file.localeCompare(b.file, 'vi', { numeric: true }));
  tracks = files.map(f => ({
    src: MUSIC_DIR + f.file.split('/').map(encodeURIComponent).join('/'),
    title: f.title || f.file.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' '),
  }));
  scanned = true;
  musicEl.classList.toggle('empty', !tracks.length);
  musicEl.classList.toggle('invite', tracks.length > 0 && !everPlayed);       // a soft pulse says "press me" until it has been played once
  if (tracks.length) { trackAt = Math.min(trackAt, tracks.length - 1); showTrack(); }
  return tracks.length > 0;
}

function showTrack() {
  const t = tracks[trackAt];
  mpTitleText.textContent = t ? t.title : 'chưa có bài nào';
  mpTitle.title = t ? t.title : '';
  mpTitle.classList.remove('long');
  requestAnimationFrame(() => {                                     // a long name slides back and forth
    const over = mpTitleText.scrollWidth - mpTitle.clientWidth;
    mpTitle.style.setProperty('--mp-shift', -Math.max(0, over) + 'px');
    mpTitle.classList.toggle('long', over > 4);
  });
}

function loadTrack() {
  musicAudio.src = tracks[trackAt].src;
  showTrack();
}

// ---- playing ----
function fadeTo(target, ms, then) {
  const id = ++fadeId, from = musicAudio.volume, t0 = performance.now();
  const step = now => {
    if (id !== fadeId) return;
    const k = Math.min(1, (now - t0) / ms);
    musicAudio.volume = from + (target - from) * k;
    if (k < 1) requestAnimationFrame(step); else if (then) then();
  };
  requestAnimationFrame(step);
}

async function playMusic() {
  if (!tracks.length && !(await scanMusic())) {                     // maybe files were added since the page opened
    toast('chưa có nhạc nào: thả file mp3 vào thư mục music nha ♡');
    return;
  }
  if (!musicAudio.src) loadTrack();
  musicAudio.volume = 0;
  try { await musicAudio.play(); } catch (e) { toast('không phát được bài này.'); return; }
  fadeTo(userVolume, MUSIC_FADE_MS);
}
function pauseMusic() { fadeTo(0, MUSIC_FADE_MS, () => musicAudio.pause()); }
function nextTrack(auto) {
  if (!tracks.length) return;
  const was = !musicAudio.paused || auto;
  trackAt = (trackAt + 1) % tracks.length;
  loadTrack();
  if (was) { musicAudio.volume = userVolume; musicAudio.play().catch(() => {}); }
}

function syncPlaying() {
  const on = !musicAudio.paused;
  if (on) { everPlayed = true; musicEl.classList.remove('invite'); }
  musicPlaying = on;                                                // the breath detector listens for this
  musicEl.classList.toggle('playing', on);
  mpPlay.setAttribute('aria-label', on ? 'tạm dừng nhạc' : 'phát nhạc');
}
musicAudio.addEventListener('play', syncPlaying);
musicAudio.addEventListener('pause', syncPlaying);
musicAudio.addEventListener('ended', () => (tracks.length > 1 ? nextTrack(true) : (musicAudio.currentTime = 0, musicAudio.play().catch(() => {}))));
musicAudio.addEventListener('error', () => { if (tracks.length > 1) nextTrack(true); });
musicAudio.addEventListener('timeupdate', () => {
  const p = musicAudio.duration ? musicAudio.currentTime / musicAudio.duration : 0;
  mpBar.style.setProperty('--p', p);
  mpBar.setAttribute('aria-valuenow', Math.round(p * 100));
});

// ---- the controls ----
mpPlay.addEventListener('click', e => {
  if (musicAudio.paused) playMusic(); else pauseMusic();
  if (e.detail) mpPlay.blur();                                      // a mouse click must not leave Space toggling the music
});
mpNext.addEventListener('click', e => {
  (async () => { if (!tracks.length && !(await scanMusic())) { toast('chưa có nhạc nào: thả file mp3 vào thư mục music nha ♡'); return; } nextTrack(false); })();
  if (e.detail) mpNext.blur();
});
mpVol.addEventListener('input', () => {
  userVolume = +mpVol.value; musicAudio.volume = userVolume;
  try { localStorage.setItem('musicVolume', userVolume); } catch (e) { /* fine */ }
});
mpVol.addEventListener('change', () => mpVol.blur());

const seekTo = clientX => {
  const r = mpBar.getBoundingClientRect();
  if (musicAudio.duration) musicAudio.currentTime = Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * musicAudio.duration;
};
mpBar.addEventListener('pointerdown', e => {
  seekTo(e.clientX); mpBar.setPointerCapture(e.pointerId);
  const move = ev => seekTo(ev.clientX);
  const up = () => { mpBar.removeEventListener('pointermove', move); mpBar.removeEventListener('pointerup', up); };
  mpBar.addEventListener('pointermove', move); mpBar.addEventListener('pointerup', up);
});
mpBar.addEventListener('keydown', e => {
  if (!musicAudio.duration) return;
  if (e.key === 'ArrowRight') { musicAudio.currentTime = Math.min(musicAudio.duration, musicAudio.currentTime + 5); e.preventDefault(); }
  else if (e.key === 'ArrowLeft') { musicAudio.currentTime = Math.max(0, musicAudio.currentTime - 5); e.preventDefault(); }
});
// keys typed in the music corner are not the mirror's (Space must not fog the glass from the play button)
musicEl.addEventListener('keydown', e => e.stopPropagation());

scanMusic();
