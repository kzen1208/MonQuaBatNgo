'use strict';

// The music card: a small player in the bottom right corner that hides into a round button.
// "bài của anh" plays whatever sits in music/ (the folder listing the dev server shows, or music/playlist.json), by itself.
// "Spotify" embeds a Spotify playlist; it is only loaded when that tab is opened.
// playlist.json may hold plain file names or { "file": "...", "title": "...", "artist": "...", "art": "music/cover.jpg" }.

(() => {
  const MUSIC_DIR = 'music/';
  const MUSIC_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|webm)$/i;
  const VOL = 0.35, FADE_MS = 280, FADE_IN_MS = 1600;
  const ARTIST = 'dành riêng cho em ♡';
  const SP_ID = '4PoKqVqTl9z0CUTAmAVigE';
  const SP_URL = 'https://open.spotify.com/playlist/' + SP_ID;
  const SP_EMBED = 'https://open.spotify.com/embed/playlist/' + SP_ID + '?utm_source=generator&theme=0';
  const SP_OEMBED = 'https://open.spotify.com/oembed?url=' + encodeURIComponent(SP_URL);

  const svg = (d, extra = '') => `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
  const fill = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;
  const IC = {
    note: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>', 'width="28" height="28" stroke-width="2.2"'),
    noteSm: svg('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>', 'width="24" height="24"'),
    chevron: svg('<path d="M6 9l6 6 6-6"/>', 'width="18" height="18" stroke-width="2.4"'),
    play: n => fill('<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>', n),
    pause: n => fill('<rect x="6" y="5" width="4.2" height="14" rx="1.4"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.4"/>', n),
    prev: fill('<path d="M18 6.2v11.6a.9.9 0 0 1-1.4.75l-8.2-5.8a.9.9 0 0 1 0-1.5l8.2-5.8A.9.9 0 0 1 18 6.2z"/><rect x="4.4" y="5.5" width="2.6" height="13" rx="1.1"/>', 16),
    next: fill('<path d="M6 6.2v11.6a.9.9 0 0 0 1.4.75l8.2-5.8a.9.9 0 0 0 0-1.5L7.4 5.45A.9.9 0 0 0 6 6.2z"/><rect x="17" y="5.5" width="2.6" height="13" rx="1.1"/>', 16),
    heart: svg('<path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z"/>', 'width="15" height="15"'),
    more: fill('<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>', 15),
    volume: svg('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>', 'width="16" height="16"'),
    mute: svg('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>', 'width="16" height="16"'),
  };

  // ---- the card ----
  const el = document.createElement('div');
  el.id = 'music';
  el.innerHTML = `
    <button class="mc-fab" type="button" aria-label="mở thẻ nhạc" title="mở nhạc">${IC.noteSm}<span class="mc-fabring"></span></button>
    <div class="mc-card" role="group" aria-label="nhạc">
      <div class="mc-glow"></div><div class="mc-glow2"></div>
      <div class="mc-pad">
        <div class="mc-head">
          <div class="mc-who">
            <div class="mc-logo">${IC.note}</div>
            <div class="mc-brand"><span class="mc-name">nhạc của mình</span><span class="mc-sub">dành riêng cho em ♡</span></div>
          </div>
          <button class="mc-hide" type="button" aria-label="ẩn thẻ nhạc" title="ẩn">${IC.chevron}</button>
        </div>
        <div class="mc-tabs" role="tablist">
          <button class="on" type="button" role="tab" aria-selected="true" data-pane="mine">bài của anh ♡</button>
          <button type="button" role="tab" aria-selected="false" data-pane="sp">Spotify</button>
        </div>
        <p class="mc-desc">mở nhạc lên rồi thong thả nghỉ một chút nha.</p>
        <div class="mc-rule"></div>
      </div>

      <div class="mc-pane" data-pane="mine">
        <div class="mc-art">
          <img alt="" width="192" height="192">
          <div class="mc-over">
            <button class="mc-bigplay" type="button" aria-label="phát nhạc"><span class="i-play">${IC.play(20)}</span><span class="i-pause">${IC.pause(20)}</span></button>
            <div class="mc-corner">
              <button class="mc-like" type="button" aria-label="thích bài này" aria-pressed="false">${IC.heart}</button>
              <button class="mc-more" type="button" aria-label="thêm" aria-haspopup="menu">${IC.more}</button>
            </div>
          </div>
        </div>
        <div class="mc-menu" role="menu">
          <button type="button" role="menuitem" data-act="like">${IC.heart}<span>thích bài này</span></button>
          <button type="button" role="menuitem" data-act="next">${IC.next}<span>bài tiếp theo</span></button>
          <button type="button" role="menuitem" data-act="prev">${IC.prev}<span>bài trước</span></button>
          <hr>
          <button type="button" role="menuitem" data-act="hide">${IC.chevron}<span>ẩn thẻ nhạc</span></button>
        </div>
        <div class="mc-eq" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <div class="mc-dock">
          <div class="mc-prog" role="slider" tabindex="0" aria-label="tua bài" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
          <div class="mc-meta">
            <div class="mc-names"><div class="mc-title">chưa có bài nào</div><div class="mc-artist">${ARTIST}</div></div>
            <div class="mc-time">0:00 / 0:00</div>
          </div>
          <div class="mc-ctl">
            <div>
              <button class="mc-sk mc-prev" type="button" aria-label="bài trước">${IC.prev}</button>
              <button class="mc-play" type="button" aria-label="phát nhạc"><span class="i-play">${IC.play(16)}</span><span class="i-pause">${IC.pause(16)}</span></button>
              <button class="mc-sk mc-next" type="button" aria-label="bài tiếp theo">${IC.next}</button>
            </div>
            <div>
              <button class="mc-mute" type="button" aria-label="tắt tiếng">${IC.volume}</button>
              <div class="mc-vol" role="slider" tabindex="0" aria-label="âm lượng" aria-valuemin="0" aria-valuemax="100"><i></i><b></b></div>
            </div>
          </div>
        </div>
      </div>

      <div class="mc-pane mc-sp" data-pane="sp" hidden>
        <div class="mc-spbox"></div>
        <p class="mc-spname"></p>
        <a class="mc-splink" href="${SP_URL}" target="_blank" rel="noopener">mở trong ứng dụng Spotify ↗</a>
      </div>

      <div class="mc-edge"></div><div class="mc-ring"></div>
    </div>`;
  document.body.appendChild(el);

  const q = s => el.querySelector(s), qa = s => [...el.querySelectorAll(s)];
  const card = q('.mc-card'), fab = q('.mc-fab'), hideBtn = q('.mc-hide');
  const img = q('.mc-art img'), titleEl = q('.mc-title'), artistEl = q('.mc-artist'), timeEl = q('.mc-time');
  const prog = q('.mc-prog'), vol = q('.mc-vol'), muteBtn = q('.mc-mute');
  const likeBtn = q('.mc-like'), menu = q('.mc-menu');
  const spBox = q('.mc-spbox'), spName = q('.mc-spname');

  const audio = new Audio();
  audio.preload = 'metadata';
  let tracks = [], at = 0, userVol = VOL, fadeId = 0, everPlayed = false, userPaused = false, armed = false, userToggled = false;
  let pane = 'mine', spInfoLoaded = false, open = true;
  let liked = new Set();
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* no storage: fine */ } },
  };
  try { liked = new Set(JSON.parse(store.get('musicLiked') || '[]')); } catch (e) { /* ignore */ }
  { const v = parseFloat(store.get('musicVolume')); if (v >= 0 && v <= 1) userVol = v; }
  audio.volume = userVol;

  const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

  // ---- hiding it ----
  function setOpen(on, byUser) {
    open = on;
    el.classList.toggle('is-hidden', !on);
    card.setAttribute('aria-hidden', String(!on));
    if (card.toggleAttribute) card.toggleAttribute('inert', !on);
    fab.setAttribute('aria-expanded', String(on));
    if (byUser) { userToggled = true; store.set('musicOpen', on ? '1' : '0'); }
  }
  // small screens start hidden; the card also tucks itself away once the mirror starts, unless you opened or closed it yourself
  window.musicTuck = () => { if (!userToggled && open) setOpen(false, false); };
  {
    const saved = store.get('musicOpen');
    if (saved === '1' || saved === '0') { userToggled = true; setOpen(saved === '1', false); }
    else setOpen(!window.matchMedia('(max-width: 700px)').matches && window.innerHeight >= 600, false);
  }
  hideBtn.addEventListener('click', () => setOpen(false, true));
  fab.addEventListener('click', () => setOpen(true, true));

  // ---- the cover: drawn if the song has none ----
  function makeCover(seed) {
    const c = document.createElement('canvas');
    paintPrint(c, 'rose', seed, 360, 360);
    const g = c.getContext('2d');
    g.save(); g.translate(180, 188); g.scale(7.4, 7.4);
    g.beginPath(); g.moveTo(0, 10); g.bezierCurveTo(-18, -2, -10, -18, 0, -8); g.bezierCurveTo(10, -18, 18, -2, 0, 10); g.closePath();
    g.fillStyle = 'rgba(255,255,255,.16)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke();
    g.restore();
    return c.toDataURL('image/jpeg', 0.9);
  }
  const hashOf = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 997 + 1; };

  // ---- finding the songs ----
  async function scan() {
    const files = [], seen = new Set();
    const add = f => {
      if (!f.file) return;
      f.file = f.file.normalize('NFC');                                  // a Linux host matches names byte for byte; git stores them composed
      if (!seen.has(f.file)) { seen.add(f.file); files.push(f); }
    };
    try {
      const res = await fetch(MUSIC_DIR + 'playlist.json', { cache: 'no-store' });
      if (res.ok) (await res.json()).forEach(f => add(typeof f === 'string' ? { file: f } : f));
    } catch (e) { /* no playlist file */ }
    if (/^(localhost|127\.|\[::1\]|.*\.local)$/.test(location.hostname)) try {     // a hosted site has no folder listing: only ask while developing
      const res = await fetch(MUSIC_DIR, { cache: 'no-store' });
      if (res.ok) {
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        [...doc.querySelectorAll('a')].map(a => a.getAttribute('href') || '')
          .filter(h => MUSIC_EXT.test(h.split('?')[0]) && !/^([a-z]+:|\/|\.\.)/i.test(h))
          .forEach(h => add({ file: decodeURIComponent(h) }));
      }
    } catch (e) { /* not served with a folder listing */ }
    files.sort((a, b) => a.file.localeCompare(b.file, 'vi', { numeric: true }));
    tracks = files.map(f => {
      const title = f.title || f.file.replace(/\.[^.]+$/, '').replace(/_+/g, ' ');
      return { src: MUSIC_DIR + f.file.split('/').map(encodeURIComponent).join('/'), title, artist: f.artist || ARTIST, art: f.art || '' };
    });
    el.classList.toggle('empty', !tracks.length);
    el.classList.toggle('invite', tracks.length > 0 && !everPlayed);      // a soft pulse on the round button says "press me" until it has played once
    if (tracks.length) { at = Math.min(at, tracks.length - 1); showTrack(); }
    return tracks.length > 0;
  }

  function showTrack() {
    const t = tracks[at];
    titleEl.textContent = t ? t.title : 'chưa có bài nào';
    titleEl.title = t ? t.title : '';
    artistEl.textContent = t ? t.artist : ARTIST;
    if (t) {
      img.onerror = () => { img.onerror = null; img.src = makeCover(hashOf(t.title)); };
      img.src = t.art || makeCover(hashOf(t.title));
    }
    paintLike(); paintProgress();
  }
  const loadTrack = () => { audio.src = tracks[at].src; showTrack(); };

  // ---- playing ----
  function fadeTo(target, ms, then) {
    const id = ++fadeId, from = audio.volume, t0 = performance.now();
    const step = now => {
      if (id !== fadeId) return;
      const k = Math.min(1, (now - t0) / ms);
      audio.volume = from + (target - from) * k;
      if (k < 1) requestAnimationFrame(step); else if (then) then();
    };
    requestAnimationFrame(step);
  }
  async function play(quiet) {
    if (!tracks.length && !(await scan())) {                              // maybe files were added since the page opened
      if (!quiet) toast('chưa có nhạc nào: thả file mp3 vào thư mục music nha ♡');
      return false;
    }
    if (!audio.src) loadTrack();
    audio.volume = 0;
    try { await audio.play(); } catch (e) { if (!quiet) toast('không phát được bài này.'); return false; }
    fadeTo(userVol, FADE_MS);
    return true;
  }
  const pause = () => fadeTo(0, FADE_MS, () => audio.pause());
  function go(step, byUser) {
    if (!tracks.length) return;
    const was = !audio.paused;
    at = (at + step + tracks.length) % tracks.length;
    loadTrack();
    if (was || byUser) { userPaused = false; audio.volume = userVol; audio.play().catch(() => {}); }
  }
  const next = byUser => go(1, byUser), prev = byUser => {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }          // like any player: the first press restarts the song
    go(-1, byUser);
  };

  function syncPlaying() {
    const on = !audio.paused;
    if (on) { everPlayed = true; el.classList.remove('invite'); }
    el.classList.toggle('playing', on);
    for (const b of qa('.mc-play, .mc-bigplay')) b.setAttribute('aria-label', on ? 'tạm dừng nhạc' : 'phát nhạc');
    refreshGate();
  }
  // the mic hears the speakers: the breath detector is told whether anything is playing
  function refreshGate() { musicPlaying = (!audio.paused && !audio.muted && audio.volume > 0) || pane === 'sp'; }
  audio.addEventListener('play', syncPlaying);
  audio.addEventListener('pause', syncPlaying);
  audio.addEventListener('volumechange', refreshGate);
  audio.addEventListener('ended', () => (tracks.length > 1 ? go(1, false) : (audio.currentTime = 0, audio.play().catch(() => {}))));
  audio.addEventListener('error', () => { if (tracks.length > 1) go(1, false); });
  audio.addEventListener('timeupdate', paintProgress);
  audio.addEventListener('loadedmetadata', paintProgress);

  function paintProgress() {
    const d = audio.duration || 0, p = d ? audio.currentTime / d : 0;
    prog.style.setProperty('--p', p);
    prog.setAttribute('aria-valuenow', Math.round(p * 100));
    timeEl.textContent = fmt(audio.currentTime) + ' / ' + fmt(d);
  }
  function paintVol() {
    const v = audio.muted ? 0 : userVol;
    vol.style.setProperty('--v', v);
    vol.setAttribute('aria-valuenow', Math.round(v * 100));
    muteBtn.innerHTML = v === 0 ? IC.mute : IC.volume;
    muteBtn.setAttribute('aria-label', v === 0 ? 'bật tiếng' : 'tắt tiếng');
  }
  function paintLike() {
    const t = tracks[at], on = !!t && liked.has(t.src);
    likeBtn.classList.toggle('on', on);
    likeBtn.setAttribute('aria-pressed', String(on));
    menu.querySelector('[data-act="like"] span').textContent = on ? 'bỏ thích bài này' : 'thích bài này';
  }
  function toggleLike() {
    const t = tracks[at];
    if (!t) return;
    if (liked.has(t.src)) liked.delete(t.src); else liked.add(t.src);
    store.set('musicLiked', JSON.stringify([...liked]));
    paintLike();
  }

  // ---- the buttons ----
  const toggle = e => {
    if (audio.paused) { userPaused = false; play(); } else { userPaused = true; pause(); }
    if (e && e.detail) e.currentTarget.blur();                            // a mouse click must not leave Space toggling the music
  };
  q('.mc-play').addEventListener('click', toggle);
  q('.mc-bigplay').addEventListener('click', toggle);
  q('.mc-next').addEventListener('click', e => { ensure().then(ok => ok && next(true)); if (e.detail) e.currentTarget.blur(); });
  q('.mc-prev').addEventListener('click', e => { ensure().then(ok => ok && prev(true)); if (e.detail) e.currentTarget.blur(); });
  const ensure = async () => tracks.length > 0 || scan();
  likeBtn.addEventListener('click', toggleLike);
  q('.mc-more').addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('show'); });
  menu.addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (!b) return;
    menu.classList.remove('show');
    const act = b.dataset.act;
    if (act === 'like') toggleLike(); else if (act === 'next') next(true); else if (act === 'prev') prev(true); else if (act === 'hide') setOpen(false, true);
  });
  document.addEventListener('pointerdown', e => { if (menu.classList.contains('show') && !menu.contains(e.target)) menu.classList.remove('show'); });
  card.addEventListener('mouseleave', () => menu.classList.remove('show'));
  card.addEventListener('pointermove', e => {                             // the soft glow follows the pointer
    const r = card.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width) * 100 + '%');
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height) * 100 + '%');
  });

  // a bar you can press or drag
  function drag(bar, onMove) {
    bar.addEventListener('pointerdown', e => {
      e.stopPropagation();
      bar.setPointerCapture(e.pointerId); bar.classList.add('drag');
      const at_ = ev => { const r = bar.getBoundingClientRect(); onMove(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width))); };
      at_(e);
      const move = ev => at_(ev);
      const up = () => { bar.classList.remove('drag'); bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up); };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
    });
  }
  drag(prog, p => { if (audio.duration) audio.currentTime = p * audio.duration; });
  drag(vol, p => {
    userVol = p; audio.muted = p === 0; fadeId++; audio.volume = p; store.set('musicVolume', p); paintVol();
  });
  muteBtn.addEventListener('click', e => {
    audio.muted = !audio.muted;
    if (!audio.muted && userVol === 0) { userVol = VOL; audio.volume = VOL; }
    paintVol(); if (e.detail) muteBtn.blur();
  });
  prog.addEventListener('keydown', e => {
    if (!audio.duration) return;
    if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); e.preventDefault(); }
  });
  vol.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 0.05 : e.key === 'ArrowLeft' ? -0.05 : 0;
    if (!d) return;
    e.preventDefault(); userVol = Math.min(1, Math.max(0, userVol + d)); audio.muted = userVol === 0; fadeId++; audio.volume = userVol; store.set('musicVolume', userVol); paintVol();
  });
  // keys typed in the music corner are not the mirror's (Space must not fog the glass from a button)
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.classList.contains('show')) { menu.classList.remove('show'); e.stopPropagation(); return; }
    e.stopPropagation();
  });

  // ---- the two tabs ----
  async function loadSpotifyInfo() {
    if (spInfoLoaded) return;
    spInfoLoaded = true;
    try {
      const d = await (await fetch(SP_OEMBED)).json();
      if (d.title) spName.textContent = d.title.trim();
    } catch (e) { spName.textContent = 'playlist trên Spotify'; }
  }
  function setPane(name) {
    if (name === pane) return;
    pane = name;
    for (const b of qa('.mc-tabs button')) { const on = b.dataset.pane === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); }
    for (const p of qa('.mc-pane')) p.hidden = p.dataset.pane !== name;
    card.classList.toggle('on-sp', name === 'sp');
    if (name === 'sp') {
      if (!audio.paused) { userPaused = true; pause(); }                  // one thing plays at a time
      const f = document.createElement('iframe');
      f.src = SP_EMBED; f.title = 'Spotify: playlist'; f.loading = 'lazy';
      f.height = window.innerHeight < 780 ? '152' : '352'; f.width = '100%';
      f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      f.style.cssText = 'display:block;border:0;border-radius:12px';
      spBox.replaceChildren(f);                                          // only now does the page talk to Spotify
      loadSpotifyInfo();
    } else {
      spBox.replaceChildren();                                           // taking the frame away stops its sound
    }
    refreshGate();
  }
  qa('.mc-tabs button').forEach(b => b.addEventListener('click', () => setPane(b.dataset.pane)));

  // ---- the music starts by itself ----
  // at once if the browser allows it; browsers do not, until the page has been touched, so then it starts on the first
  // touch, click or key press (the slide that starts the mirror is one). Pausing it yourself is respected.
  async function autoStart() {
    if (!tracks.length || !audio.paused || userPaused || pane !== 'mine') return;
    if (!audio.src) loadTrack();
    audio.volume = 0;
    try { await audio.play(); fadeTo(userVol, FADE_IN_MS); }
    catch (e) { armFirstGesture(); }
  }
  function armFirstGesture() {
    if (armed) return;
    armed = true;
    const names = ['pointerup', 'touchend', 'keydown', 'click'];
    const first = e => {
      names.forEach(n => window.removeEventListener(n, first, true));
      armed = false;
      if (el.contains(e.target) || userPaused || !audio.paused || pane !== 'mine') return;     // the music buttons do their own thing
      audio.volume = 0;
      audio.play().then(() => fadeTo(userVol, FADE_IN_MS)).catch(armFirstGesture);
    };
    names.forEach(n => window.addEventListener(n, first, true));
  }

  paintVol(); paintProgress();
  scan().then(ok => { if (ok) autoStart(); });
})();
