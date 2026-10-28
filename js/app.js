import * as THREE from 'three';
import { buildScenes } from './scenes.js';
import { FILM } from './film.js';
import { Score, chakra } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const TOTAL = FILM.total;

const stage = $('#stage');
document.body.classList.add('prestart');
const intro = $('#intro');
const endcard = $('#endcard');
const chapterCard = $('#chapterCard');
const captionWrap = $('#captionWrap');
const captionEl = $('#caption');
const loader = $('#loader');
const controls = $('#controls');
const playBtn = $('#playBtn');
const muteBtn = $('#muteBtn');
const seek = $('#seek');
const trackFill = $('#trackFill');
const timeNow = $('#timeNow');
const timeTotal = $('#timeTotal');
const panel = $('#chaptersPanel');
const scrim = $('#scrim');
const chaptersBtn = $('#chaptersBtn');
const closeChapters = $('#closeChapters');
const chapterList = $('#chapterList');
const recordBtn = $('#recordBtn');
const recBadge = $('#recBadge');
const recTime = $('#recTime');
const toastEl = $('#toast');
const flashEl = $('#flash');

const score = new Score();
let scenes = [];
let renderer = null;
let time = 0;
let playing = false;
let started = false;
let ended = false;
let currentIndex = -1;
let lastFrame = performance.now();
let lastCaptionText = '';
let captionTimer = 0;
let idleTimer = 0;
let toastTimer = 0;
let suppressCard = false;
let recording = false;
let recorder = null;
let recChunks = [];
let recCanvas = null;
let recCtx = null;
let recStartedAt = 0;
let recordLabel = 'Record film';

const fmt = (t) => {
  const s = Math.max(0, Math.floor(t + 0.0001));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/* ---------------- loader chakra ---------------- */
{
  const g = $('#loaderSpokes');
  if (g) {
    const NS = 'http://www.w3.org/2000/svg';
    chakra(42).forEach(([x1, y1, x2, y2]) => {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', 50 + x1);
      line.setAttribute('y1', 50 + y1);
      line.setAttribute('x2', 50 + x2);
      line.setAttribute('y2', 50 + y2);
      g.appendChild(line);
    });
  }
}

/* ---------------- build list & track ---------------- */
{
  chapterList.innerHTML = FILM.chapters
    .map(
      (c, i) => `<li data-index="${i}">
        <button type="button" data-index="${i}" aria-label="Play chapter ${i + 1}: ${c.name}">
          <span class="n">${c.numeral}</span>
          <span class="t">${c.name}<small>${c.location}</small></span>
          <span class="d">${c.duration}s</span>
        </button>
      </li>`
    )
    .join('');

  let acc = 0;
  const ticks = $('#trackTicks');
  FILM.chapters.forEach((c, i) => {
    if (i > 0) {
      const tick = document.createElement('i');
      tick.style.left = `${(acc / TOTAL) * 100}%`;
      ticks.appendChild(tick);
    }
    acc += c.duration;
  });
  timeTotal.textContent = fmt(TOTAL);
  seek.max = String(TOTAL);
}

/* ---------------- renderer / scenes ---------------- */
function setupRenderer() {
  renderer = new THREE.WebGLRenderer({
    canvas: stage,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x0b0a08, 1);
}

function resize() {
  if (!renderer) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.7));
  renderer.setSize(w, h, false);
  for (const s of scenes) {
    s.camera.aspect = w / h;
    s.camera.updateProjectionMatrix();
  }
  if (time >= 0) renderAt(time, { announce: false });
}

/* ---------------- time helpers ---------------- */
function chapterAt(t) {
  let acc = 0;
  for (let i = 0; i < scenes.length; i++) {
    const d = scenes[i].duration;
    if (t < acc + d || i === scenes.length - 1) {
      return { index: i, local: clamp(t - acc, 0, d), start: acc };
    }
    acc += d;
  }
  return { index: 0, local: 0, start: 0 };
}

function chapterStart(i) {
  let acc = 0;
  for (let c = 0; c < i; c++) acc += scenes[c].duration;
  return acc;
}

/* ---------------- chapter / caption UI ---------------- */
function announceChapter(i) {
  const film = FILM.chapters[i];
  $('#chapterNum').textContent = film.numeral;
  $('#chapterKicker').textContent = film.kicker.toUpperCase();
  $('#chapterName').textContent = film.name;
  $('#chapterDates').textContent = film.dates;
  chapterCard.classList.remove('show');
  void chapterCard.offsetWidth;
  chapterCard.classList.add('show');
  flashEl.classList.remove('fire');
  void flashEl.offsetWidth;
  flashEl.classList.add('fire');
  score.setChapter(i);
  lastCaptionText = '';
  captionEl.textContent = '';
}

function updateChapterList(i) {
  chapterList.querySelectorAll('li').forEach((li, n) => li.classList.toggle('active', n === i));
}

function setCaption(text) {
  if (text === lastCaptionText) return;
  lastCaptionText = text;
  window.clearTimeout(captionTimer);
  if (!text) {
    captionWrap.classList.remove('show');
    captionEl.textContent = '';
    return;
  }
  captionWrap.classList.add('swap');
  captionTimer = window.setTimeout(() => {
    captionEl.textContent = text;
    captionWrap.classList.remove('swap');
  }, 140);
  captionWrap.classList.add('show');
}

function captionFor(chapter, local) {
  let found = '';
  for (const c of chapter.captions) {
    if (local >= c.t) found = c.text;
  }
  return found;
}

/* ---------------- core render ---------------- */
function renderAt(t, { announce = true } = {}) {
  if (!renderer || !scenes.length) return;
  const { index, local } = chapterAt(t);
  const scene = scenes[index];
  if (index !== currentIndex) {
    currentIndex = index;
    updateChapterList(index);
    if (started && !ended && announce && !suppressCard) announceChapter(index);
  }
  scene.update(local);
  renderer.render(scene.scene, scene.camera);

  const film = FILM.chapters[index];
  const showCaption = started && !ended && t < TOTAL - 0.2;
  const text = showCaption ? captionFor(film, local) : '';
  setCaption(text);

  timeNow.textContent = fmt(t);
  const pct = clamp(t / TOTAL) * 100;
  trackFill.style.width = `${pct}%`;
  if (document.activeElement !== seek) seek.value = String(t);

  if (recording) {
    drawComposite(t, index, local);
    recTime.textContent = fmt(t);
  }
}

function seekTo(t, { announce = false, keepPlaying = null } = {}) {
  time = clamp(t, 0, TOTAL);
  if (time < TOTAL) {
    ended = false;
    endcard.classList.remove('show');
    endcard.setAttribute('aria-hidden', 'true');
  }
  suppressCard = !announce;
  renderAt(time, { announce });
  suppressCard = false;
  if (keepPlaying !== null) playing = keepPlaying;
  controls.classList.toggle('paused', !playing);
}

/* ---------------- transport ---------------- */
async function play() {
  if (!renderer) return;
  await score.start().catch(() => {});
  if (time >= TOTAL - 0.02) {
    time = 0;
    currentIndex = -1;
    renderAt(0, { announce: false });
  }
  started = true;
  ended = false;
  playing = true;
  intro.classList.add('hidden');
  document.body.classList.remove('prestart');
  endcard.classList.remove('show');
  endcard.setAttribute('aria-hidden', 'true');
  controls.classList.remove('paused');
  if (currentIndex >= 0) announceChapter(currentIndex);
  wake();
  lastFrame = performance.now();
}

function pause() {
  playing = false;
  controls.classList.add('paused');
  if (idleTimer) window.clearTimeout(idleTimer);
  document.body.classList.remove('is-idle');
}

function togglePlay() {
  if (playing) pause();
  else play();
}

function finishFilm() {
  playing = false;
  controls.classList.add('paused');
  ended = true;
  time = TOTAL;
  setCaption('');
  renderAt(TOTAL - 0.001, { announce: false });
  timeNow.textContent = fmt(TOTAL);
  trackFill.style.width = '100%';
  seek.value = String(TOTAL);
  endcard.classList.add('show');
  endcard.setAttribute('aria-hidden', 'false');
  document.body.classList.remove('is-idle');
  if (recording) window.setTimeout(() => stopRecording(), 700);
}

/* ---------------- idle chrome ---------------- */
function wake() {
  document.body.classList.remove('is-idle');
  if (idleTimer) window.clearTimeout(idleTimer);
  if (playing && !recording) {
    idleTimer = window.setTimeout(() => {
      if (playing && !panel.classList.contains('open')) document.body.classList.add('is-idle');
    }, 3200);
  }
}

/* ---------------- chapters panel ---------------- */
function openPanel(open) {
  panel.classList.toggle('open', open);
  scrim.classList.toggle('show', open);
  panel.setAttribute('aria-hidden', String(!open));
  chaptersBtn.setAttribute('aria-expanded', String(open));
  if (open) wake();
}

chaptersBtn.addEventListener('click', () => openPanel(!panel.classList.contains('open')));
closeChapters.addEventListener('click', () => openPanel(false));
scrim.addEventListener('click', () => openPanel(false));

chapterList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-index]');
  if (!btn) return;
  const i = Number(btn.dataset.index);
  openPanel(false);
  started = true;
  ended = false;
  intro.classList.add('hidden');
  document.body.classList.remove('prestart');
  endcard.classList.remove('show');
  endcard.setAttribute('aria-hidden', 'true');
  seekTo(chapterStart(i) + 0.02, { announce: false });
  announceChapter(i);
  play();
});

/* ---------------- transport UI ---------------- */
$('#playFilm').addEventListener('click', play);
$('#replay').addEventListener('click', play);
playBtn.addEventListener('click', togglePlay);
seek.addEventListener('input', () => {
  const t = Number(seek.value);
  const resume = playing;
  seekTo(t, { announce: false, keepPlaying: resume });
  if (t >= TOTAL - 0.01) finishFilm();
});
seek.addEventListener('pointerdown', () => wake());

function setMuted(m) {
  score.setMuted(m);
  controls.classList.toggle('muted', m);
  muteBtn.setAttribute('aria-label', m ? 'Unmute sound' : 'Mute sound');
  const soundBtn = $('#soundBtn');
  soundBtn.setAttribute('aria-pressed', String(!m));
  soundBtn.querySelector('span:last-child').textContent = m ? 'Sound off' : 'Sound on';
}
muteBtn.addEventListener('click', () => {
  score.init();
  setMuted(!score.muted);
});
$('#soundBtn').addEventListener('click', () => {
  score.init();
  setMuted(!score.muted);
});

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {
    toast('Fullscreen is not available in this browser.');
  });
}
$('#fullBtn').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', () => {
  const btn = $('#fullBtn');
  btn.setAttribute('aria-label', document.fullscreenElement ? 'Exit fullscreen' : 'Toggle fullscreen');
});

window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    seekTo(time + 5, { announce: false, keepPlaying: playing });
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    seekTo(time - 5, { announce: false, keepPlaying: playing });
  } else if (e.key.toLowerCase() === 'm') {
    score.init();
    setMuted(!score.muted);
  } else if (e.key.toLowerCase() === 'c') {
    openPanel(!panel.classList.contains('open'));
  } else if (e.key.toLowerCase() === 'f') {
    toggleFullscreen();
  } else if (e.key === 'Escape') {
    openPanel(false);
  }
});

/* ---------------- toast ---------------- */
function toast(message, ms = 4200) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), ms);
}

/* ---------------- composite video export ---------------- */
function initComposite() {
  recCanvas = document.createElement('canvas');
  recCanvas.width = 1280;
  recCanvas.height = 720;
  recCtx = recCanvas.getContext('2d', { alpha: false });
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawComposite(t, index, local) {
  if (!recCtx) return;
  const ctx = recCtx;
  const W = recCanvas.width;
  const H = recCanvas.height;
  ctx.fillStyle = '#0b0a08';
  ctx.fillRect(0, 0, W, H);

  const sw = stage.width;
  const sh = stage.height;
  const scale = Math.max(W / sw, H / sh);
  ctx.drawImage(stage, (W - sw * scale) / 2, (H - sh * scale) / 2, sw * scale, sh * scale);

  const topShade = ctx.createLinearGradient(0, 0, 0, 190);
  topShade.addColorStop(0, 'rgba(7,6,4,0.66)');
  topShade.addColorStop(1, 'rgba(7,6,4,0)');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, W, 190);

  const bottomShade = ctx.createLinearGradient(0, H - 330, 0, H);
  bottomShade.addColorStop(0, 'rgba(7,6,4,0)');
  bottomShade.addColorStop(0.6, 'rgba(7,6,4,0.55)');
  bottomShade.addColorStop(1, 'rgba(7,6,4,0.82)');
  ctx.fillStyle = bottomShade;
  ctx.fillRect(0, H - 330, W, 330);

  ctx.save();
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#e8c98a';
  ctx.font = '500 12px Inter, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.textAlign = 'right';
  ctx.fillText('BHARAT · A 3D HISTORY', W - 54, 50);
  ctx.restore();

  const film = FILM.chapters[index];
  const cardAlpha = local < 0.5 ? clamp(local / 0.5) : local > 4.2 ? clamp((4.7 - local) / 0.5) : 1;
  if (cardAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = cardAlpha;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#d8b26a';
    ctx.font = '500 11px Inter, sans-serif';
    ctx.letterSpacing = '5px';
    ctx.fillText(`CHAPTER ${film.numeral}  ·  ${film.dates}`, 64, 62);
    ctx.fillStyle = '#f8eedb';
    ctx.font = '300 62px "Cormorant Garamond", Georgia, serif';
    ctx.letterSpacing = '0px';
    ctx.fillText(film.name, 62, 132);
    ctx.strokeStyle = 'rgba(216,178,106,0.75)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(64, 156);
    ctx.lineTo(158, 156);
    ctx.stroke();
    ctx.restore();
  }

  if (t < TOTAL - 0.2) {
    const caps = film.captions;
    let active = -1;
    for (let i = 0; i < caps.length; i++) if (local >= caps[i].t) active = i;
    if (active >= 0) {
      const cap = caps[active];
      const next = caps[active + 1];
      const fadeIn = clamp((local - cap.t) / 0.45);
      const fadeOut = next ? clamp((next.t - local) / 0.4) : 1;
      const alpha = Math.min(fadeIn, fadeOut) * 0.98;
      if (alpha > 0.01) {
        const size = 30;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.font = `400 ${size}px "Cormorant Garamond", Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const lines = wrapText(ctx, cap.text, 950);
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 18;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = '#fbf3e4';
        lines.forEach((line, i) => {
          ctx.fillText(line, W / 2, H - 132 - (lines.length - 1 - i) * (size * 1.28));
        });
        ctx.restore();
      }
    }
  }
}

function pickMime() {
  const options = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];
  for (const m of options) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

async function startRecording() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    toast('This browser cannot record video. Try Chrome or Edge.');
    return;
  }
  initComposite();
  await score.start().catch(() => {});
  const audioStream = score.getStream();
  if (!audioStream || !audioStream.getAudioTracks().length) {
    toast('Audio capture is unavailable, recording silent video.');
  }

  scoringUnmuteForRecord();

  seekTo(0, { announce: false });
  renderAt(0.01, { announce: false });
  drawComposite(0.01, 0, 0.01);

  const mimeType = pickMime();
  const stream = recCanvas.captureStream(30);
  if (audioStream) audioStream.getAudioTracks().forEach((track) => stream.addTrack(track));

  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond: 7_000_000,
    });
  } catch (err) {
    toast('Recording could not start in this browser.');
    return;
  }

  recChunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recChunks.push(e.data);
  };
  recorder.onstop = () => {
    const type = mimeType && mimeType.includes('mp4') ? 'video/mp4' : 'video/webm';
    const blob = new Blob(recChunks, { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `the-story-of-india-3d.${type === 'video/mp4' ? 'mp4' : 'webm'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
    recording = false;
    recBadge.classList.remove('show');
    recordBtn.classList.remove('is-recording');
    recordBtn.querySelector('span:last-child').textContent = recordLabel;
    recTime.textContent = '0:00';
    toast('Film saved. WebM uploads directly to YouTube.', 6000);
  };

  recorder.start(1000);
  recording = true;
  recStartedAt = performance.now();
  recordBtn.classList.add('is-recording');
  recordBtn.querySelector('span:last-child').textContent = 'Stop & save';
  recBadge.classList.add('show');
  toast('Recording the full film in real time. Keep this tab visible (~1 min 28 sec).', 6000);
  await play();
}

function scoringUnmuteForRecord() {
  if (score.muted) {
    setMuted(false);
  }
}

function stopRecording() {
  if (!recorder) return;
  try {
    if (recorder.state !== 'inactive') recorder.stop();
  } catch {
    /* noop */
  }
  recording = false;
  recBadge.classList.remove('show');
  recordBtn.classList.remove('is-recording');
  recordBtn.querySelector('span:last-child').textContent = recordLabel;
}

recordBtn.addEventListener('click', () => {
  if (recording) {
    stopRecording();
    toast('Recording stopped — preparing the file…', 3000);
    return;
  }
  startRecording();
});
$('#exportBtn').addEventListener('click', () => {
  if (recording) {
    toast('A recording is already in progress.');
    return;
  }
  startRecording();
});

/* ---------------- pointer / idle ---------------- */
['pointermove', 'pointerdown', 'touchstart', 'keydown'].forEach((ev) =>
  window.addEventListener(ev, wake, { passive: true })
);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && playing && !recording) pause();
});
window.addEventListener('resize', resize);

/* ---------------- boot ---------------- */
function fail(message) {
  loader.innerHTML = `<p style="font-family:var(--serif);font-size:26px;max-width:80vw;text-align:center;line-height:1.3">${message}</p>`;
  console.error(message);
}

async function boot() {
  try {
    setupRenderer();
  } catch (err) {
    fail('WebGL is unavailable in this browser, so the 3D film cannot render.');
    return;
  }

  try {
    await document.fonts.ready;
  } catch { /* fonts are optional */ }

  try {
    scenes = buildScenes(renderer);
  } catch (err) {
    console.error(err);
    fail('The 3D scenes could not be built in this browser.');
    return;
  }

  for (const s of scenes) {
    s.camera.aspect = window.innerWidth / window.innerHeight;
    s.camera.updateProjectionMatrix();
  }

  updateChapterList(0);
  renderAt(0, { announce: false });
  loader.classList.add('hidden');
  window.setTimeout(() => {
    if (!started) chapterCard.classList.remove('show');
  }, 100);

  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (playing && !ended) {
    time += dt;
    if (time >= TOTAL) {
      time = TOTAL;
      renderAt(TOTAL - 0.001, { announce: false });
      finishFilm();
    } else {
      renderAt(time);
    }
  }
  requestAnimationFrame(loop);
}

boot();

window.__film = {
  get scenes() { return scenes; },
  play,
  pause,
  seekTo,
  get time() { return time; },
  get playing() { return playing; },
  get ready() { return !!renderer && scenes.length === 7; },
  get recCanvas() { return recCanvas; },
};
