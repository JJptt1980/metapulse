/* 按鈕特效與音效（全部原創：CSS 動畫、SVG 齒輪、Web Audio 合成音、手機內建語音）
 * - timeStop()：結束進餐 → 擬聲字「ゴゴゴゴ」、畫面反色、合成「時間凍結」音，接著語音念「砸瓦魯多」
 * - gears(after)：結束斷食 → 齒輪由靜止加速轉動、合成喀啦聲，結束後執行 after
 * 設定：L.fxVisual（特效）、L.fxSound（音效）、L.fxVoice（語音），預設都開 */
import { L } from '../state.js';

const on = k => L[k] !== false;
let styled = false;
function style() {
  if (styled) return; styled = true;
  const s = document.createElement('style');
  s.textContent = `
.fx-layer{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;pointer-events:auto;overflow:hidden}
.fx-ts{background:radial-gradient(circle,rgba(70,20,110,.35),rgba(10,0,20,.75));animation:fxfade 2.4s ease forwards}
.fx-go{display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:center;max-width:90vw;transform:rotate(-8deg)}
.fx-go span{font:900 64px/1 system-ui,"Noto Sans JP","Hiragino Sans",sans-serif;color:#b04cff;-webkit-text-stroke:3px #1a0026;text-shadow:4px 4px 0 #1a0026;display:inline-block;animation:fxshake .18s linear infinite,fxpop .75s cubic-bezier(.2,1.6,.4,1) both}
.fx-go span:nth-child(2){animation-delay:0s,.12s}.fx-go span:nth-child(3){animation-delay:0s,.24s}.fx-go span:nth-child(4){animation-delay:0s,.36s}
.fx-gear{background:rgba(0,0,0,.35);animation:fxfade 2.55s ease forwards}
.fx-gear svg{width:min(70vw,300px);height:auto}
.fx-gear .g1{transform-origin:110px 110px;animation:fxspin 2.55s cubic-bezier(.6,0,.4,1) forwards}
.fx-gear .g2{transform-origin:212px 150px;animation:fxspinr 2.55s cubic-bezier(.6,0,.4,1) forwards}
.fx-gear .g3{transform-origin:160px 236px;animation:fxspinr 2.55s cubic-bezier(.6,0,.4,1) forwards}
.fx-invert{filter:invert(1) hue-rotate(180deg)}
@keyframes fxshake{0%{transform:translate(0,0)}25%{transform:translate(2px,-2px)}50%{transform:translate(-2px,1px)}75%{transform:translate(1px,2px)}100%{transform:translate(0,0)}}
@keyframes fxpop{from{opacity:0;scale:2.4}to{opacity:1;scale:1}}
@keyframes fxfade{0%,75%{opacity:1}100%{opacity:0}}
.fx-gear.stop{animation:fxfade 3.6s ease forwards}
.fx-gear.stop .g1,.fx-gear.stop .g2,.fx-gear.stop .g3{animation-duration:2.85s;animation-timing-function:cubic-bezier(.05,.75,.25,1)}
@keyframes fxspin{to{transform:rotate(540deg)}}
@keyframes fxspinr{to{transform:rotate(-810deg)}}`;
  document.head.appendChild(s);
}

function layer(cls, html, ms, after) {
  style();
  const el = document.createElement('div');
  el.className = 'fx-layer ' + cls;
  el.innerHTML = html;
  let done = false;
  const end = () => { if (done) return; done = true; el.remove(); after && after(); };
  el.onclick = end;
  document.body.appendChild(el);
  setTimeout(end, ms);
}

/* ---------- 合成音效 ---------- */
let ctx = null;
function audio() {
  try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; } catch (e) { return null; }
}
function noiseBuf(a, sec) {
  const b = a.createBuffer(1, Math.floor(a.sampleRate * sec), a.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** 時間凍結：低沉的「咚」＋往下滑的音高＋被壓住的風聲 */
function freezeSound() {
  const a = audio(); if (!a) return;
  const t = a.currentTime;
  const g = a.createGain(); g.connect(a.destination);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  const o = a.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 2.25); o.connect(g); o.start(t); o.stop(t + 2.4);
  const o2 = a.createOscillator(); o2.type = 'triangle'; o2.frequency.setValueAtTime(900, t + 0.08); o2.frequency.exponentialRampToValueAtTime(60, t + 1.8);
  const g2 = a.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.15, t + 0.15); g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
  o2.connect(g2); g2.connect(a.destination); o2.start(t); o2.stop(t + 1.95);
  const n = a.createBufferSource(); n.buffer = noiseBuf(a, 2.1);
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(4000, t); f.frequency.exponentialRampToValueAtTime(120, t + 1.95);
  const g3 = a.createGain(); g3.gain.setValueAtTime(0.12, t); g3.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
  n.connect(f); f.connect(g3); g3.connect(a.destination); n.start(t); n.stop(t + 2.1);
}

/** 齒輪：喀啦喀啦，越轉越快 */
function gearSound() {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime, buf = noiseBuf(a, 0.03);
  let t = t0, gap = 0.24;
  while (t < t0 + 2.25) {
    const n = a.createBufferSource(); n.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 600; f.Q.value = 6;
    const g = a.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    n.connect(f); f.connect(g); g.connect(a.destination); n.start(t); n.stop(t + 0.04);
    t += gap; gap = Math.max(0.0675, gap * 0.9);
  }
}

/** 齒輪減速：喀啦聲由快變慢，最後「喀」一聲停住 */
function gearStopSound() {
  const a = audio(); if (!a) return;
  const t0 = a.currentTime, buf = noiseBuf(a, 0.03);
  let t = t0, gap = 0.0675;
  const click = (at, vol, freq) => {
    const n = a.createBufferSource(); n.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 6;
    const g = a.createGain(); g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
    n.connect(f); f.connect(g); g.connect(a.destination); n.start(at); n.stop(at + 0.05);
  };
  while (t < t0 + 2.4) { click(t, 0.45, 1800 + Math.random() * 600); t += gap; gap *= 1.11; }
  click(t + 0.08, 0.9, 900);   // 最後停住
}

/** 用手機內建語音念出 */
function say(text) {
  return new Promise(res => {
  let done = false; const fin = () => { if (!done) { done = true; res(); } };
  setTimeout(fin, 3500);               // 有些手機不會回報念完，最多等 3.5 秒
  try {
    const sp = window.speechSynthesis; if (!sp) { fin(); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW'; u.rate = 0.75; u.pitch = 0.5; u.volume = 1;
    const v = sp.getVoices().find(x => /zh[-_](TW|HK|CN)/i.test(x.lang));
    if (v) u.voice = v;
    u.onend = fin; u.onerror = fin;
    sp.cancel(); sp.speak(u);
  } catch (e) { fin(); }
  });
}

/* ---------- 對外 ---------- */
/** 結束進餐：擬聲字＋時間凍結音 → 語音「砸瓦魯多」→ 齒輪逐漸停止 */
export function timeStop() {
  if (on('fxSound')) freezeSound();
  if (on('fxVisual')) {
    const main = document.querySelector('main');
    if (main) { main.classList.add('fx-invert'); setTimeout(() => main.classList.remove('fx-invert'), 675); }
    layer('fx-ts', '<div class="fx-go"><span>ゴ</span><span>ゴ</span><span>ゴ</span><span>ゴ</span></div>', 2400);
  }
  const voice = on('fxVoice') ? new Promise(r => setTimeout(() => say('砸瓦魯多').then(r), 525)) : new Promise(r => setTimeout(r, 1800));
  voice.then(() => gearsStop());
}

function gearPath(cx, cy, teeth, rIn, rOut) {
  const pts = [], step = Math.PI * 2 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = (r, ang) => (cx + r * Math.cos(ang)).toFixed(1) + ',' + (cy + r * Math.sin(ang)).toFixed(1);
    pts.push(p(rIn, a), p(rOut, a + step * 0.15), p(rOut, a + step * 0.45), p(rIn, a + step * 0.6));
  }
  return 'M' + pts.join('L') + 'Z';
}

function gearSvg() {
  const g = (cls, cx, cy, n, ri, ro, hole, col) =>
    `<g class="${cls}"><path d="${gearPath(cx, cy, n, ri, ro)}" fill="${col}" stroke="#0b3d2e" stroke-width="3" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy}" r="${hole}" fill="#0b3d2e"/></g>`;
  return `<svg viewBox="0 0 300 300" aria-hidden="true">${g('g1', 110, 110, 12, 62, 80, 16, '#3ccf9a')}${g('g2', 212, 150, 8, 36, 50, 10, '#7aa2ff')}${g('g3', 160, 236, 9, 40, 55, 11, '#f0a14a')}</svg>`;
}

/** 齒輪由快逐漸停止（時間停止） */
export function gearsStop() {
  if (on('fxSound')) gearStopSound();
  if (on('fxVisual')) layer('fx-gear stop', gearSvg(), 3600);
}

/** 結束斷食：齒輪由靜止加速轉動（時間重新開始） */
export function gears(after) {
  if (on('fxSound')) gearSound();
  if (!on('fxVisual')) { after && after(); return; }
  const g = (cls, cx, cy, n, ri, ro, hole, col) =>
    `<g class="${cls}"><path d="${gearPath(cx, cy, n, ri, ro)}" fill="${col}" stroke="#0b3d2e" stroke-width="3" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy}" r="${hole}" fill="#0b3d2e"/></g>`;
  const svg = `<svg viewBox="0 0 300 300" aria-hidden="true">${g('g1', 110, 110, 12, 62, 80, 16, '#3ccf9a')}${g('g2', 212, 150, 8, 36, 50, 10, '#7aa2ff')}${g('g3', 160, 236, 9, 40, 55, 11, '#f0a14a')}</svg>`;
  layer('fx-gear', svg, 2550, after);
}
