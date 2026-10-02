/* 온음 — 내 목소리 TTS · single-page UI (vanilla JS, no build, offline) */
'use strict';
(() => {

/* =====================================================================
   0. Utilities
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const SVGNS = 'http://www.w3.org/2000/svg';
const IS_MAC = /Mac|iPhone|iPad/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '');
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isRail = () => matchMedia('(max-width: 1023px)').matches;

function ic(name, cls = '') {
  const s = document.createElementNS(SVGNS, 'svg');
  s.setAttribute('class', ('ico ' + cls).trim());
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVGNS, 'use');
  u.setAttribute('href', '#' + name);
  s.appendChild(u);
  return s;
}
function setIc(svg, name) { if (svg && svg.firstChild) svg.firstChild.setAttribute('href', '#' + name); }

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const c of [kids].flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
function debounce(fn, ms) { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.cancel = () => clearTimeout(t); return d; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LS = {
  str(k, d = null) { try { const v = localStorage.getItem('oneum.' + k); return v == null ? d : v; } catch { return d; } },
  setStr(k, v) { try { if (v == null) localStorage.removeItem('oneum.' + k); else localStorage.setItem('oneum.' + k, String(v)); } catch {} },
  json(k, d = null) { try { const v = localStorage.getItem('oneum.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  setJson(k, v) { try { localStorage.setItem('oneum.' + k, JSON.stringify(v)); } catch {} },
};

const nf = new Intl.NumberFormat('ko-KR');
const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' });
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
function clock(sec) { sec = Math.max(0, Math.floor(sec || 0)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function sec1(x) { return (Math.round((x || 0) * 10) / 10).toFixed(1); }
function speedFmt(v) { return Number(v).toFixed(2) + '×'; }
function speedShort(v) { const s = Number(v); return (Math.round(s * 100) / 100).toString().replace(/^(\d+)$/, '$1.0') + '×'; }
function charLen(t) { return [...(t || '')].length; }
function approxDuration(s) {
  s = Math.max(1, Math.round(s));
  if (s < 60) return `약 ${s}초`;
  return `약 ${Math.floor(s / 60)}분 ${s % 60}초`;
}
function stamp(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
function parseTime(s) { // "YYYY-MM-DD HH:MM:SS" local
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):?(\d{2})?/.exec(s || '');
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) : new Date(NaN);
}
function dayLabel(d) {
  const now = new Date();
  const start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '어제';
  if (d.getFullYear() !== now.getFullYear()) return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEK[d.getDay()]})`;
}

/* 조사: 받침 유무 → 을/를, 이/가, 은/는, 과/와, 으로/로 */
function batchim(word) {
  const ch = String(word || '').trim().slice(-1);
  if (!ch) return null;
  const c = ch.charCodeAt(0);
  if (c >= 0xAC00 && c <= 0xD7A3) { const j = (c - 0xAC00) % 28; return j === 0 ? 0 : (j === 8 ? 'l' : 1); }
  if (/[0-9]/.test(ch)) return '178'.includes(ch) ? 'l' : ('036'.includes(ch) ? 1 : 0);
  return null;
}
const JOSA = { 을를: ['을', '를'], 이가: ['이', '가'], 은는: ['은', '는'], 과와: ['과', '와'], 으로로: ['으로', '로'] };
function josa(word, pair) {
  const [a, b] = JOSA[pair];
  const k = batchim(word);
  if (k === null) return `${a}(${b})`;
  if (pair === '으로로') return k === 0 || k === 'l' ? b : a;
  return k ? a : b;
}

function avatarIndex(name) {
  let x = 0;
  for (const ch of String(name)) x = (x * 31 + ch.codePointAt(0)) >>> 0;
  return x % 8;
}
/* 기본 제공(합성) 목소리 특성: meta 가 없어도 preset_id 로 추정 */
const GENDER_LABEL = { male: '남성', female: '여성' };
const AGE_LABEL = { child: '어린이', student: '학생', adult: '성인', elderly: '어르신' };
const AGE_GLYPH = { child: '아', student: '학', adult: '성', elderly: '어' };
function presetTraits(v) {
  if (!v) return { gender: null, age: null };
  const id = String(v.preset_id || '');
  let g = String(v.gender || '').toLowerCase();
  g = /^(m|male|man|boy|남)/.test(g) ? 'male' : /^(f|female|woman|girl|여)/.test(g) ? 'female' : null;
  if (!g) g = /_m$|grandpa/.test(id) ? 'male' : /_f$|grandma/.test(id) ? 'female' : null;
  let a = String(v.age_group || '').toLowerCase();
  a = /child|kid|어린/.test(a) ? 'child' : /student|teen|학생/.test(a) ? 'student' : /elder|senior|old|grand|어르신|노인/.test(a) ? 'elderly' : /adult|성인/.test(a) ? 'adult' : null;
  if (!a) a = /^child/.test(id) ? 'child' : /^student/.test(id) ? 'student' : /^adult/.test(id) ? 'adult' : /^grand/.test(id) ? 'elderly' : null;
  return { gender: g, age: a };
}
function avatar(name, size = 36) {
  const v = typeof Voices !== 'undefined' ? Voices.get(name) : null;
  if (v && v.preset) return presetAvatar(v, size);
  return h('span', { class: `avatar s${size}`, 'data-av': avatarIndex(name), 'aria-hidden': 'true' }, [...String(name || '?').trim()][0] || '?');
}
function presetAvatar(v, size = 36) {
  const t = presetTraits(v);
  const tone = `${t.gender || 'x'}-${t.age || 'x'}`;
  const glyph = AGE_GLYPH[t.age] || [...String(v.name || '?')][0];
  return h('span', { class: `avatar preset s${size}`, 'data-tone': tone, 'aria-hidden': 'true' }, glyph,
    size >= 28 ? h('span', { class: 'av-ai' }, ic('i-sparkle')) : null);
}

/* event bus */
const bus = {
  m: new Map(),
  on(ev, fn) { if (!this.m.has(ev)) this.m.set(ev, new Set()); this.m.get(ev).add(fn); return () => this.m.get(ev).delete(fn); },
  emit(ev, ...a) { const s = this.m.get(ev); if (s) for (const fn of [...s]) { try { fn(...a); } catch (e) { console.error(e); } } },
};

const srAnnounce = (() => {
  let t;
  return msg => {
    const el = $('#sr-announce');
    el.textContent = '';
    clearTimeout(t);
    t = setTimeout(() => { el.textContent = msg; }, 60);
  };
})();

/* disabled helper: aria-disabled + reason tooltip (pointer events kept for tooltip) */
function setDisabled(btn, disabled, reason) {
  if (!btn) return;
  if (disabled) {
    btn.setAttribute('aria-disabled', 'true');
    if (reason) { btn.dataset.tip = reason; btn.dataset.tipDisabled = '1'; }
  } else {
    btn.removeAttribute('aria-disabled');
    if (btn.dataset.tipDisabled) { delete btn.dataset.tip; delete btn.dataset.tipDisabled; }
  }
}
document.addEventListener('click', e => {
  const d = e.target.closest('[aria-disabled="true"]');
  if (d) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

/* =====================================================================
   1. API
   ===================================================================== */
const NET_MSG = '앱에 연결할 수 없어요. 앱이 켜져 있는지 확인해 주세요.';
class ApiError extends Error {
  constructor(status, detail) { super(detail); this.status = status; this.detail = detail; }
}
async function api(path, opt = {}) {
  const init = { method: opt.method || 'GET', signal: opt.signal, headers: {}, cache: 'no-store' };
  if (opt.json !== undefined) { init.body = JSON.stringify(opt.json); init.headers['Content-Type'] = 'application/json'; }
  else if (opt.body) init.body = opt.body;
  if (opt.keepalive) init.keepalive = true;
  let res;
  try { res = await fetch(path, init); }
  catch (e) {
    if (e.name === 'AbortError') throw e;
    Status.netFail();
    throw new ApiError(0, NET_MSG);
  }
  if (!res.ok) {
    let d = '';
    try {
      const j = await res.clone().json();
      d = typeof j.detail === 'string' ? j.detail : (Array.isArray(j.detail) ? '요청 형식이 올바르지 않아요.' : '');
    } catch { try { d = (await res.text()).slice(0, 200); } catch {} }
    throw new ApiError(res.status, d || `HTTP ${res.status}`);
  }
  if (opt.raw) return res;
  return res.json();
}
const vpath = name => '/api/voices/' + encodeURIComponent(name);
const sampleUrl = name => vpath(name) + '/sample';
const histUrl = (id, dl) => '/api/history/' + encodeURIComponent(id) + (dl ? '?download=1' : '');

/* backend message → friendly copy (§14.5) */
function friendly(err) {
  const raw = (err && (err.detail || err.message)) || '';
  if (err && err.status === 0) return { msg: NET_MSG, where: 'toast', net: true };
  let m;
  if (/중단되었습니다/.test(raw)) return { msg: '멈췄어요', stopped: true };
  if (/읽을 텍스트가 비어/.test(raw)) return { msg: '읽을 텍스트를 입력해 주세요.' };
  if ((m = /'(.+)' 목소리가 (등록되어 있지 않습니다|없습니다)/.exec(raw))) return { msg: `'${m[1]}' 목소리를 찾을 수 없어요. 다른 목소리를 고르거나 새로 등록해 주세요.`, refreshVoices: true };
  if (/목소리의 대사가 비어/.test(raw)) return { msg: '이 목소리의 녹음 문장 정보가 없어요. 목소리를 다시 등록해 주세요.', rerecord: true };
  if (/목소리 이름은/.test(raw)) return { msg: '완성된 한글·영문·숫자·공백·_·-만 쓸 수 있어요. (1~40자)', field: 'name' };
  if (/녹음 파일이 없습니다|먼저 녹음하거나 파일을 올리세요/.test(raw)) return { msg: '먼저 녹음하거나 파일을 올려 주세요.', field: 'audio' };
  if (/녹음에서 읽은 문장을 입력/.test(raw)) return { msg: '녹음에서 말한 문장을 입력해 주세요.', field: 'transcript' };
  if (/녹음 파일을 변환하지 못했습니다/.test(raw)) return { msg: '이 파일은 읽을 수 없어요. WAV, M4A, MP3 같은 오디오 파일인지 확인해 주세요.', field: 'audio' };
  if ((m = /앞뒤 무음을 뺀 길이가 ([\d.]+)초/.exec(raw))) return { msg: `앞뒤 조용한 부분을 빼니 ${m[1]}초예요. 3~10초가 되도록 다시 녹음해 주세요.`, field: 'length' };
  if ((m = /참조 음성은 3~10초여야.*?([\d.]+)초/.exec(raw))) return { msg: `이 목소리의 녹음 길이가 맞지 않아요(${m[1]}초). 목소리를 다시 등록해 주세요.`, rerecord: true };
  if (/ffmpeg 가 없습니다/.test(raw)) return { msg: "오디오 변환 도구(ffmpeg)가 없어요. 터미널에서 'brew install ffmpeg'로 설치한 뒤 다시 시도해 주세요.", modal: true };
  if (/속도는/.test(raw)) return { msg: '속도는 0.5~2.0배 사이로 골라 주세요.' };
  if (/합성에 실패했습니다/.test(raw)) return { msg: '읽기에 실패했어요. 문장을 조금 바꾸거나 짧게 나눠서 다시 시도해 주세요.', retry: true };
  if (/합성 결과가 무음/.test(raw)) return { msg: '소리가 만들어지지 않았어요. 문장을 바꿔서 다시 시도해 주세요.' };
  if (/파일이 너무 큽니다/.test(raw) || (err && err.status === 413)) return { msg: '파일이 너무 커요(30MB 이하). 짧게 잘라서 올려 주세요.', field: 'audio' };
  if (/MP3 변환을 지원하지 않는/.test(raw)) return { msg: '이 맥의 ffmpeg는 MP3를 만들 수 없어요. M4A나 WAV로 내려받아 주세요.' };
  if (/받아쓰기에 실패/.test(raw)) return { msg: '받아쓰기에 실패했어요. 문장을 직접 입력해 주세요.', field: 'transcript' };
  return { msg: raw ? `문제가 생겼어요. 다시 시도해 주세요. (${raw})` : '문제가 생겼어요. 다시 시도해 주세요.' };
}

/* =====================================================================
   2. Toasts
   ===================================================================== */
const TOAST_ICON = { success: 'i-check-circle', error: 'i-alert', info: 'i-info' };
function toast({ type = 'info', title, body, action, duration, onClose, pinned } = {}) {
  const box = $('#toasts');
  const t = h('div', { class: `toast ${type}`, role: type === 'error' ? 'alert' : 'status' });
  if (type === 'progress') t.appendChild(h('span', { class: 'spinner', 'aria-hidden': 'true' }));
  else t.appendChild(ic(TOAST_ICON[type] || 'i-info'));
  t.appendChild(h('div', { class: 'toast-text' },
    h('div', { class: 'toast-title', text: title }),
    body ? h('div', { class: 'toast-body', text: body }) : null));
  let closed = false;
  const close = (reason = 'dismiss') => {
    if (closed) return; closed = true; clearTimeout(timer);
    if (onClose) { try { onClose(reason); } catch (e) { console.error(e); } }
    t.classList.add('leaving');
    setTimeout(() => t.remove(), reducedMotion() ? 0 : 200);
  };
  if (action) {
    t.appendChild(h('button', { class: 'toast-action', type: 'button', text: action.label, onclick: () => { close('action'); action.fn(); } }));
  }
  t.appendChild(h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기', onclick: () => close('dismiss') }, ic('i-x')));
  const ms = duration != null ? duration : (type === 'progress' ? 0 : type === 'error' ? 8000 : action ? 6000 : 4000);
  let timer, remaining = ms, started = Date.now();
  const run = () => { if (ms > 0 && !closed) { started = Date.now(); timer = setTimeout(() => close('timeout'), Math.max(0, remaining)); } };
  const pause = () => { if (ms > 0) { clearTimeout(timer); remaining -= Date.now() - started; } };
  t.addEventListener('mouseenter', pause); t.addEventListener('mouseleave', run);
  t.addEventListener('focusin', pause); t.addEventListener('focusout', run);
  t._close = close;
  if (pinned || (action && onClose)) t.dataset.pinned = '1'; // 되돌리기 토스트는 밀려나지 않게
  box.appendChild(t);
  const evictable = $$('.toast:not(.leaving)', box).filter(x => !x.dataset.pinned);
  const over = $$('.toast:not(.leaving)', box).length - 3;
  if (over > 0) evictable.slice(0, over).forEach(x => (x._close ? x._close('evicted') : x.remove()));
  t.update = ({ title: tt, body: bb }) => { if (tt != null) $('.toast-title', t).textContent = tt; const be = $('.toast-body', t); if (bb != null && be) be.textContent = bb; };
  run();
  return { close, el: t };
}
function toastError(err, extra = {}) {
  const f = friendly(err);
  if (f.stopped) { toast({ type: 'info', title: '멈췄어요' }); return f; }
  toast({ type: 'error', title: extra.title || '문제가 생겼어요', body: f.msg, action: extra.action });
  return f;
}

/* =====================================================================
   3. Tooltip
   ===================================================================== */
const Tip = {
  el: null, target: null, timer: null,
  init() {
    this.el = $('#tooltip');
    document.addEventListener('pointerover', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t === this.target) return;
      this.hide();
      if (t && e.pointerType !== 'touch') { this.target = t; this.timer = setTimeout(() => this.show(t), isRail() ? 300 : 400); }
    });
    document.addEventListener('pointerdown', () => this.hide(), true);
    document.addEventListener('focusin', e => {
      const t = e.target.closest && e.target.closest('[data-tip]');
      if (t && t.matches(':focus-visible')) { this.hide(); this.target = t; this.timer = setTimeout(() => this.show(t), 250); }
    });
    document.addEventListener('focusout', () => this.hide());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') this.hide(); });
    document.addEventListener('scroll', () => this.hide(), true);
  },
  show(t) {
    if (!t.isConnected) return;
    if (t.hasAttribute('data-tip-rail') && !isRail()) return;
    const text = t.dataset.tip;
    if (!text) return;
    const el = this.el;
    el.textContent = text;
    el.hidden = false;
    el.id = 'tooltip';
    const r = t.getBoundingClientRect();
    const tr = el.getBoundingClientRect();
    const pos = t.dataset.tipPos || 'top';
    let x, y;
    if (pos === 'right' && isRail()) { x = r.right + 10; y = r.top + r.height / 2 - tr.height / 2; }
    else if (pos === 'bottom' || r.top < tr.height + 12) { x = r.left + r.width / 2 - tr.width / 2; y = r.bottom + 8; }
    else { x = r.left + r.width / 2 - tr.width / 2; y = r.top - tr.height - 8; }
    x = Math.max(8, Math.min(innerWidth - tr.width - 8, x));
    y = Math.max(8, Math.min(innerHeight - tr.height - 8, y));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    requestAnimationFrame(() => el.classList.add('show'));
    if (t.getAttribute('aria-label') !== text) t.setAttribute('aria-describedby', 'tooltip');
  },
  hide() {
    clearTimeout(this.timer);
    if (this.target) { if (this.target.getAttribute('aria-describedby') === 'tooltip') this.target.removeAttribute('aria-describedby'); }
    this.target = null;
    if (this.el) { this.el.classList.remove('show'); this.el.hidden = true; }
  },
};

/* =====================================================================
   4. Popover / menu
   ===================================================================== */
let openPop = null;
function closePopover(restore = true) {
  if (!openPop) return;
  const { el, trigger, onClose } = openPop;
  openPop = null;
  el.classList.remove('open');
  setTimeout(() => el.remove(), reducedMotion() ? 0 : 160);
  if (trigger) { trigger.setAttribute('aria-expanded', 'false'); if (restore) trigger.focus({ preventScroll: true }); }
  if (onClose) onClose();
  document.removeEventListener('pointerdown', popOutside, true);
}
function popOutside(e) {
  if (openPop && !openPop.el.contains(e.target) && !openPop.trigger.contains(e.target)) closePopover(false);
}
function placePopover(el, trigger, side = 'auto') {
  const r = trigger.getBoundingClientRect();
  const pr = el.getBoundingClientRect();
  let x, y;
  if (side === 'right' || (side === 'auto' && r.left < 260 && r.right < innerWidth / 3)) {
    x = r.right + 8; y = Math.min(r.top, innerHeight - pr.height - 12);
    el.style.transformOrigin = 'left bottom';
  } else {
    x = r.right - pr.width; y = r.bottom + 6;
    if (y + pr.height > innerHeight - 8) { y = r.top - pr.height - 6; el.style.transformOrigin = 'bottom right'; }
  }
  x = Math.max(8, Math.min(innerWidth - pr.width - 8, x));
  y = Math.max(8, y);
  el.style.left = x + 'px'; el.style.top = y + 'px';
}
function openMenu(trigger, items, opts = {}) {
  if (openPop && openPop.trigger === trigger) { closePopover(); return; }
  closePopover(false);
  const el = h('div', { class: 'popover', role: 'menu', 'aria-label': opts.label || '메뉴' });
  for (const it of items) {
    if (!it) continue;
    if (it === '-') { el.appendChild(h('div', { class: 'menu-sep', role: 'separator' })); continue; }
    el.appendChild(h('button', {
      class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem', type: 'button', tabindex: '-1',
      onclick: () => { closePopover(!it.noRestore); it.fn(); },
    }, it.icon ? ic(it.icon) : null, it.label));
  }
  el.addEventListener('keydown', e => {
    const list = $$('.menu-item', el);
    const i = list.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopover(); }
    else if (e.key === 'Tab') { closePopover(false); }
  });
  document.body.appendChild(el);
  placePopover(el, trigger, opts.side);
  trigger.setAttribute('aria-expanded', 'true');
  openPop = { el, trigger };
  requestAnimationFrame(() => { el.classList.add('open'); const f = $('.menu-item', el); if (f) f.focus(); });
  document.addEventListener('pointerdown', popOutside, true);
}
function openInfoPopover(trigger, content, opts = {}) {
  if (openPop && openPop.trigger === trigger) { closePopover(); return; }
  closePopover(false);
  const el = h('div', { class: 'popover info', role: 'dialog', 'aria-label': opts.label || '', tabindex: '-1' }, content);
  el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopover(); } });
  document.body.appendChild(el);
  placePopover(el, trigger, opts.side || 'auto');
  trigger.setAttribute('aria-expanded', 'true');
  openPop = { el, trigger };
  requestAnimationFrame(() => { el.classList.add('open'); el.focus({ preventScroll: true }); });
  document.addEventListener('pointerdown', popOutside, true);
}

/* =====================================================================
   5. Modal (<dialog>)
   ===================================================================== */
let modalOpen = 0;
function modal({ title, body, actions = [], wide = false, dismissible = true, cls = '' }) {
  return new Promise(resolve => {
    const prev = document.activeElement;
    const titleId = 'm-title-' + Math.random().toString(36).slice(2, 8);
    const bodyId = titleId + '-b';
    const dlg = h('dialog', { class: 'modal' + (wide ? ' wide' : '') + (cls ? ' ' + cls : ''), 'aria-labelledby': titleId, 'aria-describedby': body && typeof body !== 'function' ? bodyId : null });
    const panel = h('div', { class: 'modal-panel' });
    panel.appendChild(h('h2', { class: 'modal-title', id: titleId, text: title }));
    if (body) panel.appendChild(h('div', { class: 'modal-body', id: bodyId }, typeof body === 'string' ? h('p', { text: body }) : typeof body === 'function' ? body(v => done(v)) : body));
    const acts = h('div', { class: 'modal-actions' });
    let initial = null;
    let result = null;
    const done = v => { result = v; close(); };
    for (const a of actions) {
      const b = h('button', { class: `btn btn-${a.kind || 'secondary'}`, type: 'button', onclick: () => done(a.value) }, a.label);
      if (a.initial) initial = b;
      acts.appendChild(b);
    }
    if (actions.length) panel.appendChild(acts);
    dlg.appendChild(panel);
    let closing = false;
    function close() {
      if (closing) return; closing = true;
      dlg.classList.add('closing');
      setTimeout(() => {
        try { dlg.close(); } catch {}
        dlg.remove(); modalOpen--;
        if (prev && prev.focus && prev.isConnected) prev.focus({ preventScroll: true });
        resolve(result);
      }, reducedMotion() ? 0 : 180);
    }
    dlg.addEventListener('cancel', e => { e.preventDefault(); if (dismissible) done(null); });
    dlg.addEventListener('click', e => { if (e.target === dlg && dismissible) done(null); });
    document.body.appendChild(dlg);
    modalOpen++;
    dlg.showModal();
    Tip.hide();
    (initial || $('.btn', acts) || panel).focus();
  });
}
function confirmModal(o) {
  return modal({
    title: o.title, body: o.body, actions: [
      { label: o.cancel || '취소', kind: 'secondary', value: false, initial: true },
      { label: o.ok || '확인', kind: o.danger ? 'danger' : 'primary', value: true },
    ],
  }).then(v => v === true);
}

/* =====================================================================
   6. Audio player (single <audio>) + peaks + waveform
   ===================================================================== */
const Player = {
  el: null, key: null, src: null, subs: new Set(), raf: 0,
  init() {
    const a = this.el = $('#audio');
    ['play', 'pause', 'loadedmetadata', 'seeked', 'durationchange', 'emptied'].forEach(ev => a.addEventListener(ev, () => this.emit()));
    a.addEventListener('ended', () => { try { a.currentTime = 0; } catch {} this.emit(); });
    a.addEventListener('play', () => this.loop());
    a.addEventListener('error', () => { if (this.key) this.emit(); });
  },
  loop() {
    cancelAnimationFrame(this.raf);
    const step = () => { this.emit(); if (!this.el.paused) this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step);
  },
  play(key, src, at) {
    const a = this.el;
    if (this.key !== key || this.src !== src) {
      a.pause();
      a.src = src; this.key = key; this.src = src;
      if (at) a.addEventListener('loadedmetadata', () => { try { a.currentTime = at; } catch {} }, { once: true });
    } else if (at != null) { try { a.currentTime = at; } catch {} }
    const p = a.play();
    this.emit();
    return p && p.catch ? p : Promise.resolve();
  },
  toggle(key, src) {
    if (this.key === key && !this.el.paused) { this.el.pause(); return Promise.resolve(); }
    return this.play(key, src).catch(() => {});
  },
  toggleCurrent() { if (!this.key) return false; if (this.el.paused) this.el.play().catch(() => {}); else this.el.pause(); return true; },
  stop() { this.el.pause(); },
  unlock() {
    if (this.unlocked || this.key) return;
    this.unlocked = true;
    const a = this.el;
    try {
      if (!this.silent) this.silent = URL.createObjectURL(pcmWav([new Int16Array(800)], 800, 8000));
      a.muted = true; a.src = this.silent;
      const p = a.play();
      const done = () => { if (a.src !== this.silent) { a.muted = false; return; } a.pause(); a.muted = false; if (!this.key) { a.removeAttribute('src'); try { a.load(); } catch {} } };
      if (p && p.then) p.then(done, () => { a.muted = false; this.unlocked = false; }); else done();
    } catch { a.muted = false; }
  },
  release(key) { if (this.key === key) { this.el.pause(); this.el.removeAttribute('src'); this.el.load(); this.key = null; this.src = null; this.emit(); } },
  playing(key) { return this.key === key && !this.el.paused; },
  time(key) { return this.key === key ? this.el.currentTime : 0; },
  dur(key) { return this.key === key && isFinite(this.el.duration) ? this.el.duration : 0; },
  seek(key, t) { if (this.key === key) { try { this.el.currentTime = t; } catch {} this.emit(); } },
  /* bind(el, fn): fn() is called on every player change while el stays in the DOM */
  bind(el, fn, immediate = true) { const s = { el, fn, seen: false }; this.subs.add(s); if (immediate) fn(); return s; },
  emit() {
    for (const s of this.subs) {
      if (s.el.isConnected) { s.seen = true; s.fn(); }
      else if (s.seen) this.subs.delete(s);
    }
  },
};

const Peaks = {
  cache: new Map(), ctx: null,
  get(src) {
    if (!this.cache.has(src)) {
      const p = this.decode(src);
      this.cache.set(src, p);
      p.catch(() => this.cache.delete(src));
      if (this.cache.size > 60) this.cache.delete(this.cache.keys().next().value);
    }
    return this.cache.get(src);
  },
  drop(src) { this.cache.delete(src); },
  async decode(src) {
    const buf = await (await fetch(src, { cache: 'no-store' })).arrayBuffer();
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C(); }
    const audio = await new Promise((res, rej) => {
      const p = this.ctx.decodeAudioData(buf, res, rej);
      if (p && p.then) p.then(res, rej);
    });
    const ch = audio.getChannelData(0);
    const N = Math.min(1600, ch.length);
    const out = new Float32Array(N);
    const step = ch.length / N;
    let max = 0;
    for (let i = 0; i < N; i++) {
      let m = 0;
      const a = Math.floor(i * step), b = Math.min(ch.length, Math.floor((i + 1) * step));
      for (let j = a; j < b; j += 2) { const v = ch[j] < 0 ? -ch[j] : ch[j]; if (v > m) m = v; }
      out[i] = m; if (m > max) max = m;
    }
    if (max > 0) { const k = .96 / max; for (let i = 0; i < N; i++) out[i] *= k; }
    return { peaks: out, duration: audio.duration };
  },
};

let themeColors = {};
function refreshColors() {
  const cs = getComputedStyle(document.documentElement);
  const g = n => cs.getPropertyValue(n).trim();
  themeColors = { played: g('--wave-played'), unplayed: g('--wave-unplayed'), hover: g('--wave-hover') };
}

class Waveform {
  constructor({ key, src, height = 40, label = '재생 위치', onTime } = {}) {
    this.key = key; this.src = src; this.h = height; this.onTime = onTime;
    this.peaks = null; this.duration = 0; this.pos = 0; this.hoverX = null; this.grow = 1; this.dragging = false;
    this.root = h('div', {
      class: 'wave' + (height === 32 ? ' h32' : height === 28 ? ' h28' : ''), role: 'slider', tabindex: '0',
      'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '0', 'aria-valuenow': '0',
    });
    this.canvas = h('canvas', { 'aria-hidden': 'true' });
    this.tipEl = h('span', { class: 'wave-tip', 'aria-hidden': 'true' });
    this.root.append(this.canvas, this.tipEl);
    this.bindEvents();
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(this.root);
    Waveform.all.add(this);
    this.sub = Player.bind(this.root, () => this.tick(), false);
    if (src) this.load(src);
  }
  setSource(key, src) {
    if (this.key === key && this.src === src) return;
    this.key = key; this.src = src; this.peaks = null; this.pos = 0;
    this.root.classList.remove('ready');
    this.draw();
    this.load(src);
  }
  async load(src) {
    this.root.classList.remove('error');
    const fb = $('.fallback', this.root); if (fb) fb.remove();
    try {
      const { peaks, duration } = await Peaks.get(src);
      if (src !== this.src) return;
      this.peaks = peaks; this.duration = duration;
      this.root.classList.add('ready');
      this.root.setAttribute('aria-valuemax', String(Math.round(duration)));
      this.animateIn();
      if (this.onTime) this.onTime(this.current(), this.totalDur());
    } catch (e) {
      if (src !== this.src) return;
      this.root.classList.add('error');
      this.root.setAttribute('title', '파형을 그릴 수 없어요');
      this.root.appendChild(h('div', { class: 'fallback' }, h('i')));
      this.draw();
    }
  }
  animateIn() {
    if (reducedMotion()) { this.grow = 1; this.draw(); return; }
    const t0 = performance.now();
    const f = now => {
      this.growT = now - t0;
      this.draw();
      if (this.growT < 620) requestAnimationFrame(f); else { this.growT = null; this.draw(); }
    };
    requestAnimationFrame(f);
  }
  totalDur() { return Player.dur(this.key) || this.duration || 0; }
  current() { return Player.key === this.key ? Player.el.currentTime : this.pos; }
  tick() {
    this.draw();
    const d = this.totalDur(), t = this.current();
    const s = Math.floor(t);
    if (s !== this._lastS || d !== this._lastD) {
      this._lastS = s; this._lastD = d;
      this.root.setAttribute('aria-valuemax', String(Math.round(d)));
      this.root.setAttribute('aria-valuenow', String(s));
      this.root.setAttribute('aria-valuetext', `${Math.floor(s / 60)}분 ${s % 60}초 / 전체 ${Math.floor(d / 60)}분 ${Math.round(d % 60)}초`);
    }
    if (this.onTime) this.onTime(t, d);
  }
  draw() {
    const c = this.canvas, root = this.root;
    if (!root.isConnected) return;
    const w = root.clientWidth, hh = root.clientHeight || this.h;
    if (!w) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    const fb = $('.fallback i', root);
    const d = this.totalDur(), t = this.current();
    const frac = d ? Math.min(1, t / d) : 0;
    if (fb) { fb.style.width = (frac * 100) + '%'; return; }
    const n = Math.max(8, Math.floor(w / 5));
    const P = this.peaks;
    for (let i = 0; i < n; i++) {
      let p = .04;
      if (P) {
        const a = Math.floor(i * P.length / n), b = Math.max(a + 1, Math.floor((i + 1) * P.length / n));
        p = 0; for (let j = a; j < b; j++) if (P[j] > p) p = P[j];
      }
      let g = 1;
      if (this.growT != null) { g = Math.max(0, Math.min(1, (this.growT - Math.min(300, i * 4)) / 320)); g = 1 - Math.pow(1 - g, 3); }
      const bh = Math.max(2, Math.pow(p, .8) * hh * g);
      const x = i * 5, y = (hh - bh) / 2;
      const mid = (i + .5) / n;
      ctx.fillStyle = P && mid <= frac ? themeColors.played
        : (P && this.hoverX != null && x <= this.hoverX ? themeColors.hover : themeColors.unplayed);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, 3, bh, 1.5); else ctx.rect(x, y, 3, bh);
      ctx.fill();
    }
  }
  xToTime(clientX) {
    const r = this.root.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return f * this.totalDur();
  }
  seekTo(t, startIfIdle) {
    const d = this.totalDur();
    t = Math.max(0, Math.min(d ? d - 0.05 : 0, t));
    if (Player.key === this.key) Player.seek(this.key, t);
    else if (startIfIdle) { this.pos = t; Player.play(this.key, this.src, t).catch(() => {}); }
    else { this.pos = t; this.tick(); }
  }
  bindEvents() {
    const r = this.root;
    r.addEventListener('pointerdown', e => {
      if (e.button !== 0 || !this.src) return;
      this.dragging = true; r.setPointerCapture(e.pointerId);
      this.seekTo(this.xToTime(e.clientX), true);
    });
    r.addEventListener('pointermove', e => {
      const rect = r.getBoundingClientRect();
      this.hoverX = e.clientX - rect.left;
      const d = this.totalDur();
      if (d) {
        this.tipEl.textContent = clock(this.xToTime(e.clientX));
        this.tipEl.style.left = Math.max(14, Math.min(rect.width - 14, this.hoverX)) + 'px';
      }
      if (this.dragging) this.seekTo(this.xToTime(e.clientX));
      else this.draw();
    });
    const end = () => { this.dragging = false; };
    r.addEventListener('pointerup', end); r.addEventListener('pointercancel', end);
    r.addEventListener('pointerleave', () => { this.hoverX = null; this.draw(); });
    r.addEventListener('keydown', e => {
      const t = this.current(), d = this.totalDur();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); this.seekTo(t - 5); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); this.seekTo(t + 5); }
      else if (e.key === 'Home') { e.preventDefault(); this.seekTo(0); }
      else if (e.key === 'End') { e.preventDefault(); this.seekTo(d); }
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); Player.toggle(this.key, this.src); }
    });
  }
}
Waveform.all = new Set();
function redrawWaves() { refreshColors(); for (const w of Waveform.all) { if (w.root.isConnected) w.draw(); } }

/* play button bound to a key */
function playButton(key, getSrc, { size = 36, cls = 'icon-btn round', label = '' } = {}) {
  const icon = ic('i-play');
  const b = h('button', { class: cls + ` s${size}`, type: 'button', 'aria-label': `${label}재생` }, icon);
  b.addEventListener('click', () => {
    const src = typeof getSrc === 'function' ? getSrc() : getSrc;
    if (src) Player.toggle(typeof key === 'function' ? key() : key, src);
  });
  Player.bind(b, () => {
    const k = typeof key === 'function' ? key() : key;
    const on = Player.playing(k);
    setIc(icon, on ? 'i-pause' : 'i-play');
    b.setAttribute('aria-label', label + (on ? '일시정지' : '재생'));
  });
  return b;
}

/* =====================================================================
   7. Status (model / connection)
   ===================================================================== */
const STATUS_COPY = {
  connecting: ['연결 중', '앱에 연결하고 있어요'],
  loading: ['준비 중', '모델을 불러오고 있어요'],
  ready: ['준비 완료', '바로 읽을 수 있어요'],
  busy: ['합성 중', ''],
  sleeping: ['절전 중', '20분 동안 쓰지 않아 메모리를 비웠어요. 다음 요청 때 다시 불러와요'],
  offline: ['연결 끊김', "앱이 꺼져 있어요. 'start.command'를 다시 실행해 주세요"],
};
const Status = {
  state: 'connecting', loaded: false, busy: false, defaultVoice: null, fails: 0,
  loadingSince: 0, watchedLoading: false, timer: null, inflight: false, wasOffline: false,
  get offline() { return this.state === 'offline'; },
  async poll() {
    if (this.inflight) return;
    this.inflight = true;
    clearTimeout(this.timer);
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 4000);
    try {
      const pollStart = Date.now();
      const r = await fetch('/api/status', { cache: 'no-store', signal: ctrl.signal });
      if (!r.ok) throw new Error('bad');
      const j = await r.json();
      this.fails = 0;
      this.loaded = !!j.loaded; this.busy = !!j.busy;
      if (j.engine && j.engine !== Settings.engine && !Settings.switching) { Settings.engine = j.engine; bus.emit('engine'); }
      if (!this.busy && Synth.stoppingAt && pollStart > Synth.stoppingAt) Synth.stoppingAt = 0; this.defaultVoice = j.default_voice || null; this.asrReady = !!j.asr_ready;
      if (this.wasOffline) {
        this.wasOffline = false;
        toast({ type: 'success', title: '다시 연결됐어요' });
        Voices.load();
        Settings.load();
        if (Studio.ta) Studio.loadPreview();
      }
      this.compute();
    } catch {
      this.fails++;
      if (this.fails >= 2) { this.wasOffline = true; this.set('offline'); }
    } finally {
      clearTimeout(to);
      this.inflight = false;
      this.schedule();
    }
  },
  stopping() { return Synth.stoppingAt && Date.now() - Synth.stoppingAt < 30000; },
  compute() {
    let s;
    const job = Synth.job;
    if (job && !this.loaded) s = 'loading';
    else if (job) s = 'busy';
    else if (this.loaded) s = this.busy ? 'busy' : 'ready';
    else s = this.busy ? 'loading' : 'sleeping';
    this.set(s);
  },
  set(s) {
    const prev = this.state;
    if (s === 'loading' && prev !== 'loading') { this.loadingSince = Date.now(); if (!document.hidden) this.watchedLoading = true; }
    if (s === 'ready' && prev === 'loading' && this.watchedLoading && !Synth.job) {
      this.watchedLoading = false;
      toast({ type: 'success', title: '준비됐어요', body: '이제 바로 읽을 수 있어요.' });
    }
    if (s === 'busy' && prev === 'loading') this.watchedLoading = false;
    this.state = s;
    this.render(prev !== s);
    if (prev !== s) bus.emit('status', s, prev);
  },
  render(changed) {
    const card = $('#status-card');
    card.dataset.state = this.state;
    const label = this.state === 'busy' && !Synth.job && this.stopping() ? '멈추는 중…' : STATUS_COPY[this.state][0];
    const sub = this.subText();
    const lbl = $('#status-label'), subEl = $('#status-sub');
    if (changed || lbl.textContent !== label) lbl.textContent = label;
    if (subEl.textContent !== sub) subEl.textContent = sub;
    const el = $('#status-elapsed');
    if (this.state === 'loading') el.textContent = Math.floor((Date.now() - this.loadingSince) / 1000) + '초';
    else el.textContent = '';
    const eng = Settings.engine ? Settings.label(Settings.engine) : '';
    const engEl = $('#status-engine');
    if (engEl) { engEl.hidden = !eng || this.state === 'offline' || this.state === 'connecting'; engEl.textContent = eng; }
    card.dataset.tip = `${label} — ${sub}${eng ? ` · ${eng}` : ''}`;
    $('#offline-banner').hidden = this.state !== 'offline';
  },
  subText() {
    if (this.state === 'busy') return Synth.job ? `${clock((performance.now() - Synth.job.start) / 1000)} 경과` : (this.stopping() ? '진행 중이던 읽기를 정리하고 있어요' : '다른 요청을 처리하고 있어요');
    if (this.state === 'loading') {
      const hint = Settings.engine === 'qwen' ? '처음엔 30초쯤 걸릴 수 있어요' : '처음 켤 때는 5~10초 걸려요';
      return `${Synth.job ? '목소리를 준비하고 있어요' : `${Settings.engine ? Settings.label(Settings.engine) + ' ' : ''}모델을 불러오고 있어요`} · ${hint}`;
    }
    return STATUS_COPY[this.state][1];
  },
  schedule() {
    clearTimeout(this.timer);
    let ms = 5000;
    if (Synth.job || this.stopping()) ms = 1000;
    else if (document.hidden) ms = 30000;
    else if (this.state === 'offline') ms = 2500;
    else if (['loading', 'connecting'].includes(this.state) || Synth.job) ms = 1000;
    this.timer = setTimeout(() => this.poll(), ms);
  },
  kick() { this.compute(); this.poll(); },
  netFail() { this.poll(); },
};

/* =====================================================================
   8. Data stores
   ===================================================================== */
const Voices = {
  list: [], loaded: false, error: null,
  async load() {
    try {
      this.list = await api('/api/voices');
      this.loaded = true; this.error = null;
    } catch (e) { this.error = e; if (!this.loaded) this.loaded = false; }
    bus.emit('voices');
    return this.list;
  },
  get(name) { return this.list.find(v => v.name === name); },
  get mine() { return this.list.filter(v => !v.preset); },
  get presets() { return this.list.filter(v => v.preset); },
  get defaultName() { const d = this.list.find(v => v.default); return d ? d.name : (this.list[0] && this.list[0].name) || null; },
};

const ENGINE_INFO = {
  qwen: { label: '고품질', desc: '더 자연스럽고 정확해요 · 조금 느려요', factor: 2.2 },
  sovits: { label: '빠른 모드', desc: '빠르지만 숫자·영어 발음이 덜 정확해요', factor: 0.9 },
};
const Settings = {
  engine: null, engines: [], loaded: false, switching: false,
  async load() {
    try {
      const j = await api('/api/settings');
      this.engines = Array.isArray(j.engines) && j.engines.length ? j.engines : Object.entries(ENGINE_INFO).map(([id, x]) => ({ id, label: x.label }));
      if (!this.switching) this.engine = j.engine || this.engine;
      this.loaded = true;
    } catch { /* 예전 서버: 엔진 선택 숨김 */ }
    bus.emit('engine');
  },
  label(id) { const e = this.engines.find(x => x.id === id); return (e && e.label) || (ENGINE_INFO[id] && ENGINE_INFO[id].label) || id || ''; },
  desc(id) { return (ENGINE_INFO[id] && ENGINE_INFO[id].desc) || ''; },
  factor() { return (ENGINE_INFO[this.engine] && ENGINE_INFO[this.engine].factor) || 1.3; },
  async set(id) {
    if (!id || id === this.engine || this.switching) return;
    if (Synth.job) { toast({ type: 'info', title: '읽는 중에는 바꿀 수 없어요', body: '읽기가 끝난 뒤에 바꿔 주세요.' }); return; }
    const prev = this.engine;
    this.engine = id; this.switching = true;
    bus.emit('engine');
    try {
      const j = await api('/api/settings', { method: 'PUT', json: { engine: id } });
      this.engine = j.engine || id;
      const l = this.label(this.engine);
      toast({ type: 'success', title: `${l}${josa(l, '으로로')} 바꿨어요`, body: this.engine === 'qwen' ? '모델을 불러오는 동안 잠시 기다려 주세요. 처음엔 30초쯤 걸릴 수 있어요.' : '모델을 불러오는 동안 잠시 기다려 주세요.' });
    } catch (e) {
      this.engine = prev;
      toastError(e, { title: '엔진을 바꾸지 못했어요' });
    } finally {
      this.switching = false;
      bus.emit('engine');
      Status.kick();
    }
  },
};

const stoppedError = () => Object.assign(new Error('stopped'), { stopped: true });
function concatBytes(a, b) { if (!a || !a.length) return b; const c = new Uint8Array(a.length + b.length); c.set(a, 0); c.set(b, a.length); return c; }
/* PCM16 mono parts → WAV Blob */
function pcmWav(parts, total, sr) {
  const head = new ArrayBuffer(44), dv = new DataView(head);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) dv.setUint8(o + i, str.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + total * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true);
  dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, total * 2, true);
  const body = parts.map(p => {
    if (new Uint8Array(new Uint16Array([1]).buffer)[0] === 1) return p; // little-endian host
    const b = new DataView(new ArrayBuffer(p.length * 2)); for (let i = 0; i < p.length; i++) b.setInt16(i * 2, p[i], true); return b;
  });
  return new Blob([head, ...body], { type: 'audio/wav' });
}

const Synth = {
  job: null, stoppingAt: 0,
  begin(kind, voice, text, speed, seed) {
    if (this.job) throw Object.assign(new Error('busy'), { busy: true });
    const id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'j' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const job = this.job = { id, kind, voice, text, speed, seed: seed == null ? null : seed, start: performance.now(), ctrl: new AbortController(), stopped: false, streaming: false, firstAt: null, reader: null, onStop: null };
    document.body.classList.add('is-speaking');
    bus.emit('job');
    Status.kick();
    return job;
  },
  end(job) {
    if (this.job !== job) return;
    this.job = null;
    document.body.classList.remove('is-speaking');
    bus.emit('job');
    Status.kick();
  },
  isStop(e, job) { return e.stopped || e.name === 'AbortError' || job.stopped || /중단되었습니다/.test(e.detail || ''); },
  /* 일반(비스트리밍) 합성: /api/tts */
  async wav(job) {
    const res = await api('/api/tts', { method: 'POST', json: { text: job.text, voice: job.voice, speed: job.speed, history: job.kind === 'studio', job: job.id, ...(job.seed != null ? { seed: job.seed } : {}) }, signal: job.ctrl.signal, raw: true });
    const blob = await res.blob();
    if (job.stopped) throw stoppedError();
    return {
      blob, url: URL.createObjectURL(blob),
      historyId: res.headers.get('X-History-Id'),
      duration: parseFloat(res.headers.get('X-Duration')) || 0,
      elapsed: parseFloat(res.headers.get('X-Elapsed')) || (performance.now() - job.start) / 1000,
      voice: job.voice, speed: job.speed, text: job.text, at: new Date(), streamed: false,
      seed: parseInt(res.headers.get('X-Seed'), 10) || (job.seed != null ? job.seed : 42), engine: Settings.engine,
    };
  },
  async run({ text, voice, speed, kind }) {
    const job = this.begin(kind, voice, text, speed);
    try { return await this.wav(job); }
    catch (e) { if (this.isStop(e, job)) throw stoppedError(); throw e; }
    finally { this.end(job); }
  },
  /* 스트리밍 합성: /api/tts/stream → 실시간 재생. 지원하지 않으면 /api/tts 로 대체 */
  async runStream({ text, voice, speed, kind, seed, onFirst, onChunk, onStop }) {
    const job = this.begin(kind, voice, text, speed, seed);
    job.onStop = onStop;
    try {
      let res = null;
      const canStream = !!(window.ReadableStream && window.Response && 'body' in Response.prototype);
      if (canStream) {
        job.streaming = true;
        try {
          res = await api('/api/tts/stream', { method: 'POST', json: { text, voice, speed, history: kind === 'studio', job: job.id, ...(seed != null ? { seed } : {}) }, signal: job.ctrl.signal, raw: true });
        } catch (e) {
          if (!(e.status === 404 || e.status === 405 || e.status === 501)) throw e;
          res = null;
        }
      }
      if (!res || !res.body || !res.body.getReader) {
        job.streaming = false; bus.emit('job');
        return await this.wav(job);
      }
      let out;
      try {
        out = await this.read(job, res.body.getReader(), onFirst, onChunk);
      } catch (e) {
        if (e.badStream && !job.firstAt && !job.stopped) { // 헤더를 못 읽음(브라우저 차이) → 일반 합성으로
          job.streaming = false; bus.emit('job');
          return await this.wav(job);
        }
        throw e;
      }
      if (job.stopped) throw stoppedError();
      const { sr, parts, total } = out;
      const blob = pcmWav(parts, total, sr);
      // 기록 id 는 저장이 끝나야 생긴다. 한 번 물어보고, 아직이면 기다리지 않고 뒤에서 알아낸다
      let info = null, later = null;
      if (kind === 'studio') {
        const ask = () => api('/api/jobs/' + encodeURIComponent(job.id)).catch(e => (e.status === 404 ? undefined : null));
        info = (await ask()) || null;
        if (!info) later = (async () => { for (let i = 0; i < 16; i++) { await sleep(300); const x = await ask(); if (x) return x; if (x === null) return null; } return null; })();
      }
      if (job.stopped) throw stoppedError();
      return {
        blob, url: URL.createObjectURL(blob),
        historyId: info ? info.history_id : null,
        duration: info && info.duration ? info.duration : total / sr,
        elapsed: (performance.now() - job.start) / 1000, // 요청부터 끝까지 (서버 값은 첫 소리 이후만 잼)
        voice, speed, text, at: new Date(), streamed: true,
        seed: info && info.seed != null ? info.seed : (seed != null ? seed : 42), engine: (info && info.engine) || Settings.engine,
        partial: false, later,
      };
    } catch (e) {
      if (this.isStop(e, job)) throw stoppedError();
      throw e;
    } finally {
      this.end(job);
    }
  },
  async read(job, reader, onFirst, onChunk) {
    job.reader = reader;
    let head = new Uint8Array(0), sr = 0, carry = null, total = 0;
    const parts = [];
    for (;;) {
      let r;
      try { r = await reader.read(); }
      catch (e) { if (job.stopped || e.name === 'AbortError') throw stoppedError(); throw e; }
      if (r.done) break;
      let v = r.value;
      if (!v || !v.length) continue;
      if (!sr) {
        head = concatBytes(head, v);
        if (head.length < 44) continue;
        const tag = (o) => String.fromCharCode(head[o], head[o + 1], head[o + 2], head[o + 3]);
        const dv = new DataView(head.buffer, head.byteOffset, 44);
        const ch = dv.getUint16(22, true), rate = dv.getUint32(24, true), bits = dv.getUint16(34, true);
        if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(36) !== 'data' || ch !== 1 || bits !== 16 || !rate) {
          try { reader.cancel(); } catch {}
          throw Object.assign(new Error('bad stream header'), { badStream: true });
        }
        sr = rate;
        v = head.subarray(44);
        head = null;
        if (!v.length) continue;
      }
      if (carry) { v = concatBytes(carry, v); carry = null; }
      const even = v.length & ~1;
      if (even < v.length) carry = v.slice(even);
      if (!even) continue;
      const n = even >> 1;
      const i16 = new Int16Array(n), f32 = new Float32Array(n);
      const dv = new DataView(v.buffer, v.byteOffset, even);
      for (let i = 0; i < n; i++) { const x = dv.getInt16(i * 2, true); i16[i] = x; f32[i] = x / 32768; }
      parts.push(i16); total += n;
      if (job.stopped) throw stoppedError();
      if (!job.firstAt) { job.firstAt = performance.now(); bus.emit('job'); if (onFirst) onFirst(sr); }
      if (onChunk) onChunk(f32, sr, total / sr);
    }
    if (!sr || !total) throw new ApiError(500, '합성 결과가 비어 있습니다.');
    return { sr, parts, total };
  },
  stop() {
    const job = this.job;
    if (!job) return false;
    job.stopped = true;
    this.stoppingAt = Date.now();
    if (job.onStop) { try { job.onStop(); } catch {} }
    fetch('/api/stop?job=' + encodeURIComponent(job.id), { method: 'POST', cache: 'no-store' }).catch(() => {});
    job.ctrl.abort();
    if (job.reader) { try { job.reader.cancel().catch(() => {}); } catch {} }
    return true;
  },
};

/* 실시간 재생: AudioBufferSourceNode 를 이어 붙여 예약 */
const Live = {
  ctx: null,
  /* 반드시 클릭/키 입력 처리 안에서 동기적으로 호출 (자동 재생 정책) */
  prime() {
    Player.unlock();
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    try {
      if (!this.ctx || this.ctx.state === 'closed') this.ctx = new C({ latencyHint: 'playback' });
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    } catch { this.ctx = null; }
    return this.ctx;
  },
};
class LivePlayback {
  /* 적응형 버퍼링:
     - 생성 속도(r = 받은 오디오 초 / 실제 경과 초)를 재서, 끝까지 끊기지 않을 만큼 모인 뒤에 재생을 시작한다.
       남은 생성량 G 를 속도 r 로 만들 때 끊기지 않으려면 버퍼 b ≥ G·(1/r − 1).
     - 그래도 모자라면 다음 문장 사이(무음 구간)에서 멈추고, 충분히 모이면 이어서 읽는다.
     - 짧은 글(한 문장 정도)은 끝까지 받은 뒤 재생한다. */
  constructor(ctx, { estTotal = 6, short = false, factor = 2 } = {}) {
    this.ctx = ctx; this.sources = new Set(); this.segs = [];
    this.pend = []; this.pendLen = 0; this.sr = 0;
    this.queuedUntil = 0; this.contentEnd = 0; this.received = 0;
    this.estTotal = estTotal; this.short = short; this.defaultRate = 1 / Math.max(0.5, factor);
    this.state = 'waiting'; // waiting(첫 소리 전) → buffering → playing ⇄ rebuffering
    this.started = false; this.stopped = false; this.done = false; this.underruns = 0;
    this.firstWall = 0; this.firstDur = 0; this.chunks = 0;
    this.out = ctx.createGain(); this.out.connect(ctx.destination);
    this.watch = setInterval(() => this.tick(), 100);
  }
  push(f32, sr) {
    if (this.stopped || !f32.length) return;
    this.sr = sr;
    const dur = f32.length / sr;
    this.chunks++;
    if (!this.firstWall) { this.firstWall = performance.now(); this.firstDur = dur; }
    this.received += dur;
    this.lastWall = performance.now(); this.lastDur = dur;
    this.pend.push(f32); this.pendLen += f32.length;
    if (this.state === 'waiting') this.state = 'buffering';
    this.pump();
  }
  finish() { this.done = true; this.pump(); }
  /* 생성 속도(오디오 초/실제 초). 측정이 짧을 때는 엔진 기본값보다 낙관하지 않는다 */
  rate() {
    const wall = (performance.now() - this.firstWall) / 1000;
    if (this.chunks < 2 || wall < 0.5) return this.defaultRate;
    const m = (this.received - this.firstDur) / wall;
    if (wall < 4) return Math.min(m, this.defaultRate * 1.2);
    return m;
  }
  get pendSec() { return this.sr ? this.pendLen / this.sr : 0; }
  ahead() { return Math.max(0, this.queuedUntil - this.ctx.currentTime); }
  /* 지금부터 끊김 없이 끝까지 읽으려면 얼마나 모아야 하나 (초) */
  need() {
    if (this.done) return 0;
    if (this.short) return Infinity;
    const r = this.rate();
    // 글자 수로 잡은 길이는 실제보다 짧게 나오기 쉬워 넉넉히 본다
    const G = Math.max(0, Math.max(this.estTotal * 1.4, this.received * 1.15) - this.received);
    const floor = this.state === 'rebuffering' ? 2.5 : 1.5;
    if (r >= 1) return floor;
    const b = G * (1 / Math.max(0.05, r) - 1) * 1.15 + 0.8;
    return Math.min(Math.max(floor, b), this.state === 'rebuffering' ? 10 : 14);
  }
  tick() {
    if (this.stopped) return;
    if (this.state === 'playing' && !this.done && this.ahead() < 0.05 && this.ctx.state === 'running') {
      this.state = 'rebuffering'; this.underruns++;
    }
    this.pump();
  }
  pump() {
    if (this.stopped || !this.sr) return;
    if (this.state === 'buffering' || this.state === 'rebuffering') {
      if (!this.pendLen) return;
      if (this.done || this.pendSec >= this.need()) { this.state = 'playing'; this.started = true; this.scheduleUpTo(this.pendLen); }
      return;
    }
    if (this.state !== 'playing' || !this.pendLen) return;
    if (this.done) { this.scheduleUpTo(this.pendLen); return; }
    // 다음 조각이 오기 전에 소리가 바닥날 것 같으면, 문장 사이(무음)까지만 예약해서 거기서 쉬게 한다
    const r = this.rate();
    const since = (performance.now() - (this.lastWall || 0)) / 1000;
    const nextIn = Math.max(0, (this.lastDur || 1.5) / Math.max(0.05, r) - since);
    if (this.ahead() + this.pendSec >= nextIn + 0.3) { this.scheduleUpTo(this.pendLen); return; }
    const gap = this.findGap();
    if (gap > 0) this.scheduleUpTo(gap);
    else if (this.ahead() < 0.25) this.scheduleUpTo(this.pendLen);
  }
  /* 모아 둔 소리에서 마지막 무음 구간(≥0.12초) 가운데 위치(샘플)를 찾는다 */
  findGap() {
    const all = this.joined();
    const win = Math.max(1, Math.round(this.sr * 0.01)), need = 12;
    let run = 0, best = -1;
    for (let w = 0; (w + 1) * win <= all.length; w++) {
      let m = 0;
      for (let i = w * win, e = i + win; i < e; i++) { const a = all[i] < 0 ? -all[i] : all[i]; if (a > m) m = a; }
      if (m < 0.012) { run++; if (run >= need) best = (w - Math.floor(run / 2)) * win; }
      else run = 0;
    }
    return best;
  }
  joined() {
    if (this.pend.length === 1) return this.pend[0];
    const all = new Float32Array(this.pendLen);
    let o = 0; for (const p of this.pend) { all.set(p, o); o += p.length; }
    this.pend = [all];
    return all;
  }
  scheduleUpTo(n) {
    if (!n) return;
    const all = this.joined();
    const head = all.subarray(0, n), rest = all.subarray(n);
    this.pend = rest.length ? [rest.slice()] : []; this.pendLen = rest.length;
    let buf;
    try { buf = this.ctx.createBuffer(1, head.length, this.sr); } catch { return; }
    if (buf.copyToChannel) buf.copyToChannel(head, 0); else buf.getChannelData(0).set(head);
    const now = this.ctx.currentTime;
    if (this.queuedUntil < now + 0.03) this.queuedUntil = now + 0.06; // 처음이거나 쉬었다가 다시 시작
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.connect(this.out);
    src.start(this.queuedUntil);
    src.onended = () => this.sources.delete(src);
    this.sources.add(src);
    this.segs.push({ at: this.queuedUntil, off: this.contentEnd, dur: buf.duration });
    this.queuedUntil += buf.duration; this.contentEnd += buf.duration;
  }
  position() {
    const now = this.ctx.currentTime;
    let pos = 0;
    for (const sg of this.segs) { if (sg.at > now) break; pos = sg.off + Math.min(sg.dur, now - sg.at); }
    return pos;
  }
  /* 재생이 시작되기까지(또는 다시 이어지기까지) 남은 대략적인 시간(초) */
  eta() {
    const need = this.need();
    if (!isFinite(need)) return null;
    const r = this.rate();
    return Math.max(0, (need - this.pendSec) / Math.max(0.05, r));
  }
  get paused() { return this.ctx.state === 'suspended'; }
  get buffering() { return this.state === 'waiting' || this.state === 'buffering' || this.state === 'rebuffering'; }
  waiting() { return this.buffering; }
  toggle() {
    if (this.stopped) return;
    if (this.paused) { this.userPaused = false; this.ctx.resume().catch(() => {}); }
    else if (this.started) { this.userPaused = true; this.ctx.suspend().catch(() => {}); }
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.watch);
    for (const src of this.sources) { try { src.stop(); } catch {} }
    this.sources.clear();
    try { this.out.disconnect(); } catch {}
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
}

/* 스트리밍 중에 자라나는 파형 */
class LiveWave {
  constructor(est) {
    this.est = Math.max(2, est || 6); this.blocks = []; this.blockDur = 0.05; this.acc = 0; this.accMax = 0; this.max = 0.12; this.got = 0;
    this.root = h('div', { class: 'wave live', 'aria-hidden': 'true' });
    this.canvas = h('canvas');
    this.root.appendChild(this.canvas);
  }
  add(f32, sr) {
    const per = Math.max(1, Math.round(sr * this.blockDur));
    for (let i = 0; i < f32.length; i++) {
      const a = f32[i] < 0 ? -f32[i] : f32[i];
      if (a > this.accMax) this.accMax = a;
      if (++this.acc >= per) { this.blocks.push(this.accMax); if (this.accMax > this.max) this.max = this.accMax; this.acc = 0; this.accMax = 0; }
    }
    this.got += f32.length / sr;
  }
  draw(pos) {
    const c = this.canvas, root = this.root;
    if (!root.isConnected) return;
    const w = root.clientWidth, hh = root.clientHeight || 40;
    if (!w) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(hh * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); }
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, hh);
    const n = Math.max(8, Math.floor(w / 5));
    const span = Math.max(this.est, this.got * 1.08);
    const barSec = span / n;
    const B = this.blocks;
    for (let i = 0; i < n; i++) {
      const t0 = i * barSec, t1 = t0 + barSec;
      const x = i * 5;
      if (t0 >= this.got) {
        ctx.globalAlpha = .45; ctx.fillStyle = themeColors.unplayed;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, hh / 2 - 1, 3, 2, 1); else ctx.rect(x, hh / 2 - 1, 3, 2); ctx.fill();
        ctx.globalAlpha = 1; continue;
      }
      let p = 0;
      const a = Math.floor(t0 / this.blockDur), b = Math.max(a + 1, Math.ceil(t1 / this.blockDur));
      for (let j = a; j < b && j < B.length; j++) if (B[j] > p) p = B[j];
      const bh = Math.max(2, Math.pow(Math.min(1, p / this.max), .8) * hh * .96);
      ctx.fillStyle = (t0 + barSec / 2) <= pos ? themeColors.played : themeColors.unplayed;
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, (hh - bh) / 2, 3, bh, 1.5); else ctx.rect(x, (hh - bh) / 2, 3, bh); ctx.fill();
    }
  }
}

/* preview / normalize */
async function normalizeText(text, signal) {
  const j = await api('/api/preview', { method: 'POST', json: { text }, signal });
  return j.text || '';
}
/* token-level LCS diff → fragment with <mark class="norm"> on changed tokens */
function diffFragment(orig, norm) {
  const a = (orig || '').split(/\s+/).filter(Boolean);
  const parts = (norm || '').split(/(\s+)/);
  const b = parts.filter(p => p && !/^\s+$/.test(p));
  const appended = /[.。]$/.test((norm || '').trim()) && !/[.!?。…]$/.test((orig || '').trim());
  const bk = b.map((t, i) => (appended && i === b.length - 1 ? t.replace(/[.。]$/, '') : t));
  const changed = new Uint8Array(b.length).fill(1);
  if (a.length * b.length <= 2500000 && a.length && b.length) {
    const n = a.length, m = b.length;
    const W = m + 1;
    const dp = new Uint16Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = a[i] === bk[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (a[i] === bk[j]) { changed[j] = 0; i++; j++; }
      else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) i++;
      else j++;
    }
  } else if (!a.length || a.length * b.length > 2500000) {
    changed.fill(0);
  }
  const frag = document.createDocumentFragment();
  let k = 0, runs = 0, mark = null, pendingWs = '';
  for (const p of parts) {
    if (!p) continue;
    if (/^\s+$/.test(p)) { if (mark) pendingWs += p; else frag.appendChild(document.createTextNode(p)); continue; }
    const ch = changed[k++];
    if (ch) {
      if (!mark) { mark = h('mark', { class: 'norm' }); runs++; frag.appendChild(mark); }
      else if (pendingWs) mark.appendChild(document.createTextNode(pendingWs));
      pendingWs = '';
      mark.appendChild(document.createTextNode(p));
    } else {
      if (mark) { mark = null; if (pendingWs) frag.appendChild(document.createTextNode(pendingWs)); pendingWs = ''; }
      frag.appendChild(document.createTextNode(p));
    }
  }
  if (pendingWs) frag.appendChild(document.createTextNode(pendingWs));
  return { frag, changes: runs };
}

/* =====================================================================
   9. Theme
   ===================================================================== */
const Theme = {
  val: 'system',
  init() {
    const v = LS.str('theme', 'system');
    this.val = ['light', 'dark'].includes(v) ? v : 'system';
    $$('#theme-seg button').forEach(b => b.addEventListener('click', () => this.set(b.dataset.themeVal)));
    $('#theme-seg').addEventListener('keydown', e => {
      const order = ['system', 'light', 'dark'];
      const i = order.indexOf(this.val);
      if (['ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); this.set(order[(i + 1) % 3]); $(`#theme-seg [data-theme-val="${this.val}"]`).focus(); }
      if (['ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); this.set(order[(i + 2) % 3]); $(`#theme-seg [data-theme-val="${this.val}"]`).focus(); }
    });
    $('#theme-cycle').addEventListener('click', () => {
      const order = ['system', 'light', 'dark'];
      this.set(order[(order.indexOf(this.val) + 1) % 3]);
      Tip.hide();
      const t = $('#theme-cycle'); Tip.show(t);
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => requestAnimationFrame(redrawWaves));
    this.apply();
  },
  set(v) { this.val = v; LS.setStr('theme', v === 'system' ? null : v); this.apply(); },
  apply() {
    const root = document.documentElement;
    if (this.val === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', this.val);
    $$('#theme-seg button').forEach(b => {
      const on = b.dataset.themeVal === this.val;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    positionSeg($('#theme-seg'));
    const names = { system: '시스템 설정 따르기', light: '라이트', dark: '다크' };
    const icons = { system: 'i-monitor', light: 'i-sun', dark: 'i-moon' };
    const cyc = $('#theme-cycle');
    setIc($('svg', cyc), icons[this.val]);
    cyc.dataset.tip = `화면 테마: ${names[this.val]}`;
    cyc.setAttribute('aria-label', `화면 테마: ${names[this.val]} (눌러서 바꾸기)`);
    requestAnimationFrame(redrawWaves);
  },
};
function positionSeg(seg) {
  if (!seg) return;
  const ind = $('.seg-indicator', seg);
  if (!ind) return;
  const on = $('[aria-checked="true"]', seg);
  if (!on) { ind.style.opacity = '0'; return; }
  if (seg.classList.contains('equal')) {
    const btns = $$('button', seg), n = btns.length, i = btns.indexOf(on);
    ind.style.width = `calc((100% - 4px) / ${n})`;
    ind.style.transform = `translateX(${i * 100}%)`;
    ind.style.left = '2px';
    ind.style.opacity = '1';
    return;
  }
  if (!on.offsetWidth) { ind.style.opacity = '0'; return; }
  ind.style.width = on.offsetWidth + 'px';
  ind.style.transform = `translateX(${on.offsetLeft}px)`;
  ind.style.opacity = '1';
}
const segRO = new ResizeObserver(entries => entries.forEach(e => positionSeg(e.target)));

/* =====================================================================
   10. Router
   ===================================================================== */
const Pages = {};
const Router = {
  current: null, currentKey: null, lastHash: '', ignore: false, params: {},
  parse() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const [path, qs] = raw.split('?');
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    let key = path.replace(/\/$/, '');
    if (!['studio', 'voices', 'voices/new', 'history', 'dictionary'].includes(key)) key = null;
    return { key, params };
  },
  async go() {
    if (this.ignoreHash != null && location.hash === this.ignoreHash) { this.ignoreHash = null; return; }
    this.ignoreHash = null;
    let { key, params } = this.parse();
    if (!key) { history.replaceState(history.state, '', '#/studio'); key = 'studio'; }
    const hash = location.hash;
    if (this.current && this.current.canLeave && (this.currentKey !== key || key === 'voices/new')) {
      if (this.currentKey !== key || hash !== this.lastHash) {
        const ok = await this.current.canLeave(key);
        if (!ok) { this.revert(); return; }
      }
    }
    if (this.currentKey === key && hash === this.lastHash) return;
    try { this.show(key, params); }
    catch (e) { console.error(e); toast({ type: 'error', title: '화면을 그리지 못했어요', body: '새로고침해 주세요.' }); }
    this.lastHash = location.hash;
    this.stamp();
  },
  /* each history entry carries an index so a cancelled Back/Forward can be undone without pushing entries */
  stamp() {
    const st = history.state;
    if (st && typeof st.oneumIdx === 'number') this.idx = st.oneumIdx;
    else { this.idx = Math.max(Date.now(), (this.idx || 0) + 1); try { history.replaceState({ ...(st || {}), oneumIdx: this.idx }, ''); } catch {} }
  },
  revert() {
    const st = history.state;
    const target = this.lastHash;
    this.ignoreHash = target;
    // entries are stamped with creation time: older = user went Back, newer = Forward, none = fresh push
    if (st && typeof st.oneumIdx === 'number' && st.oneumIdx < this.idx) history.go(1);
    else if (st && typeof st.oneumIdx === 'number' && st.oneumIdx > this.idx) history.go(-1);
    else history.back();
    setTimeout(() => { if (location.hash !== target) { this.ignoreHash = target; history.replaceState({ oneumIdx: this.idx }, '', target); this.ignoreHash = null; } }, 400);
  },
  show(key, params) {
    closePopover(false);
    Tip.hide();
    const page = Pages[key];
    if (this.current && this.current !== page && this.current.onHide) this.current.onHide();
    if (!page.el) { page.build(); $('#pages').appendChild(page.el); }
    for (const k in Pages) if (Pages[k].el) Pages[k].el.hidden = Pages[k] !== page;
    const changed = this.current !== page;
    this.current = page; this.currentKey = key; this.params = params;
    if (changed) {
      page.el.classList.remove('enter'); void page.el.offsetWidth; page.el.classList.add('enter');
      $('#main').scrollTop = 0;
    }
    const navKey = key === 'voices/new' ? 'voices' : key;
    $$('.nav-item').forEach(a => { if (a.dataset.nav === navKey) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    document.title = `${page.title} · 온음`;
    document.body.dataset.route = key.replace('/', '-');
    if (page.onShow) page.onShow(params, changed);
    updateDockToastOffset();
  },
  navigate(hash) { if (location.hash === hash) this.go(); else location.hash = hash; },
};
function onRoute(key) { return Router.currentKey === key; }
function restoreTitle() { if (Router.current) document.title = `${Router.current.title} · 온음`; }

function pageHeader({ title, desc, actions, before }) {
  return h('header', { class: 'page-header' },
    h('div', { class: 'titles' }, before || null, h('h1', { text: title }), desc ? h('p', { class: 'desc', text: desc }) : null),
    actions ? h('div', { class: 'page-actions' }, actions) : null);
}

/* =====================================================================
   11. STUDIO
   ===================================================================== */
const EXAMPLES = [
  ['인사말', '안녕하세요. 오늘도 좋은 하루 보내세요. 제 목소리로 직접 읽어 드리고 있어요.'],
  ['숫자와 날짜', '2026년 10월 1일 오후 3시, 기온은 -5도이고 습도는 45%입니다.'],
  ['영어 약어', 'AI와 GPU 덕분에 이제 맥에서도 TTS를 쉽게 쓸 수 있어요.'],
];
const SPEED_PRESETS = [0.8, 0.9, 1.0, 1.1, 1.2];

const Studio = Pages.studio = {
  title: '스튜디오', el: null,
  voice: LS.str('voice', null),
  speed: (() => { const v = parseFloat(LS.str('speed', '1')); return isFinite(v) ? Math.min(1.5, Math.max(0.7, v)) : 1; })(),
  result: null, dockMode: 'hidden', preview: { ctrl: null, norm: '', text: null },
  build() {
    const helpBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: showShortcuts, 'aria-label': '키보드 단축키 (?)' },
      ic('i-keyboard'), h('span', { text: '단축키' }), h('span', { class: 'kbd', text: '?' }));
    this.el = h('section', { class: 'page studio-page', 'aria-labelledby': 'studio-h1' });
    const header = pageHeader({ title: '스튜디오', desc: '텍스트를 입력하면 내 목소리로 읽어 드려요', actions: helpBtn });
    $('h1', header).id = 'studio-h1';
    this.welcome = h('div', { hidden: true });
    this.grid = h('div', { class: 'studio' }, this.buildEditorCol(), this.buildInspector());
    this.dock = h('section', { class: 'dock', 'aria-label': '결과 플레이어', hidden: true });
    this.el.append(header, h('div', { class: 'page-body' }, this.welcome, this.grid), this.dock);

    bus.on('voices', () => this.renderVoices());
    bus.on('status', () => this.updateCTA());
    bus.on('job', () => { this.updateCTA(); this.renderEngine(); const rb = this.dock && $('.retake-btn', this.dock); if (rb) setDisabled(rb, !!Synth.job, '다른 음성을 만드는 중이에요'); });
    bus.on('engine', () => { this.renderEngine(); this.renderMeta(); });
    bus.on('tick', () => { if (Synth.job && Synth.job.kind === 'studio') { this.updateCTA(true); this.updateDockGenerating(); this.updateTitle(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.doneTitle) { this.doneTitle = false; restoreTitle(); } });
    bus.on('format', () => { if (this.dockMode === 'result') this.showDock('result'); this.renderTakes(); });
    this.renderVoices();
    this.onInput(true);
  },
  onShow() { if (this.welcome && (!!this.welcomeMode() === this.welcome.hidden)) this.renderVoices(); this.autosize(); if (this.result) requestAnimationFrame(() => this.resultWave && this.resultWave.draw()); },

  /* ----- editor ----- */
  buildEditorCol() {
    const draft = LS.str('draft', '');
    this.ta = h('textarea', {
      id: 'script', 'aria-label': '읽을 텍스트', spellcheck: 'false',
      placeholder: '여기에 읽을 글을 입력하거나 붙여넣으세요. 긴 글도 괜찮아요.',
    });
    this.ta.value = draft;
    this.examples = h('div', { class: 'examples' },
      h('span', { class: 'ex-label', text: '예시로 시작하기' }),
      EXAMPLES.map(([label, text]) => h('button', { class: 'chip', type: 'button', onclick: () => { this.setText(text); this.ta.focus(); } }, ic('i-sparkle'), label)));
    const saveDraft = debounce(() => LS.setStr('draft', this.ta.value), 400);
    this.ta.addEventListener('input', () => { saveDraft(); this.onInput(); });
    this.ta.addEventListener('keydown', e => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) this.retake(); else this.generate(); }
      else if (mod && e.shiftKey && (e.key === 'e' || e.key === 'E' || e.key === 'ㄷ')) { e.preventDefault(); e.stopPropagation(); FixPron.open(); }
    });
    const onSel = () => this.onSel();
    ['select', 'keyup', 'mouseup', 'input', 'blur'].forEach(ev => this.ta.addEventListener(ev, onSel));
    document.addEventListener('selectionchange', () => { if (document.activeElement === this.ta) onSel(); });
    this.fixChip = h('button', { class: 'chip fix-chip', type: 'button', hidden: true, 'data-tip': `선택한 단어의 읽는 법을 고쳐요 (${MOD}⇧E)`, onclick: () => FixPron.open() }, ic('i-edit'), '발음 고치기');
    this.meta = h('div', { class: 'editor-meta', 'aria-live': 'off' });
    this.clearBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => this.clearText() }, '지우기');
    this.genBtn = h('button', { class: 'btn btn-primary btn-lg', id: 'gen-btn', type: 'button', onclick: () => this.generate() });
    this.stopBtn = h('button', { class: 'btn btn-secondary btn-lg', id: 'stop-btn', type: 'button', hidden: true, onclick: () => Synth.stop() },
      ic('i-stop'), '멈추기', h('span', { class: 'kbd', text: 'Esc' }));
    const card = h('div', { class: 'card editor-card' },
      h('div', { class: 'editor-wrap' }, this.ta, this.examples),
      h('div', { class: 'editor-foot' }, this.meta,
        h('div', { class: 'editor-actions' }, this.fixChip, this.clearBtn, h('div', { class: 'cta-group' }, this.genBtn, this.stopBtn))));

    // preview panel
    const open = LS.str('previewOpen', '1') !== '0';
    this.pvToggle = h('button', { class: 'icon-btn s28 toggle', type: 'button', 'aria-expanded': String(open), 'aria-controls': 'pv-body', 'aria-label': open ? '접기' : '펼치기', 'data-tip': open ? '접기' : '펼치기' }, ic('i-chevron-down'));
    this.pvSpin = h('span', { class: 'spinner s12', hidden: true, 'aria-hidden': 'true' });
    this.pvText = h('div', { class: 'preview-text muted', 'aria-live': 'off' });
    this.pvMeta = h('div', { class: 'preview-meta', hidden: true });
    this.pvBody = h('div', { class: 'preview-body', id: 'pv-body', hidden: !open }, this.pvText, this.pvMeta);
    this.pvToggle.addEventListener('click', () => {
      const o = this.pvToggle.getAttribute('aria-expanded') !== 'true';
      this.pvToggle.setAttribute('aria-expanded', String(o));
      this.pvToggle.setAttribute('aria-label', o ? '접기' : '펼치기');
      this.pvToggle.dataset.tip = o ? '접기' : '펼치기';
      this.pvBody.hidden = !o;
      LS.setStr('previewOpen', o ? '1' : '0');
    });
    const pv = h('div', { class: 'card preview-card' },
      h('div', { class: 'preview-head' }, ic('i-ear'), h('h2', { text: '이렇게 읽어요' }),
        h('span', { class: 'help', tabindex: '0', role: 'img', 'aria-label': '도움말: 숫자·날짜·시간·전화번호·단위·영어 약어·URL을 한글 읽기로 바꾼 결과예요. 실제로 이 문장을 읽어요.', 'data-tip': '숫자·날짜·시간·전화번호·단위·영어 약어·URL을 한글 읽기로 바꾼 결과예요. 실제로 이 문장을 읽어요.' }, ic('i-info')),
        this.pvSpin, this.pvToggle),
      this.pvBody);
    this.requestPreview = debounce(() => this.loadPreview(), 350);
    this.ro = new ResizeObserver(() => this.autosize());
    this.compareBox = h('div', { class: 'compare-wrap', hidden: true });
    this.takesBox = h('section', { class: 'card takes-card', 'aria-labelledby': 'takes-h', hidden: true });
    return h('div', { class: 'editor-col' }, card, pv, this.compareBox, this.takesBox);
  },
  autosize() {
    const ta = this.ta;
    if (!ta || !ta.isConnected || !ta.offsetParent) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 2 + 'px';
  },
  setText(t, { undoable = false } = {}) {
    const prev = this.ta.value;
    this.ta.value = t;
    LS.setStr('draft', t);
    this.onInput();
    this.autosize();
    return prev;
  },
  clearText() {
    const prev = this.setText('');
    this.ta.focus();
    toast({ type: 'info', title: '지웠어요', action: { label: '되돌리기', fn: () => { this.setText(prev); this.ta.focus(); } } });
  },
  ensureBuilt() { if (!this.el) { this.build(); this.el.hidden = true; $('#pages').appendChild(this.el); } },
  loadFromHistory(item) {
    this.ensureBuilt();
    const prev = this.ta.value;
    const overwrite = prev.trim() && prev !== item.text;
    this.setText(item.text);
    if (Voices.get(item.voice)) this.selectVoice(item.voice);
    if (item.speed) this.setSpeed(Math.min(1.5, Math.max(0.7, Number(item.speed))));
    Router.navigate('#/studio');
    if (overwrite) toast({ type: 'info', title: '텍스트를 바꿨어요', action: { label: '되돌리기', fn: () => this.setText(prev) } });
    setTimeout(() => this.ta.focus(), 50);
  },
  onInput(initial) {
    const text = this.ta.value;
    this.autosize();
    this.examples.hidden = text.length > 0;
    this.clearBtn.hidden = !text.length;
    this.renderMeta();
    this.updateCTA();
    if (initial) this.loadPreview(); else this.requestPreview();
  },
  renderMeta() {
    const sel = this.selText();
    const text = sel || this.ta.value;
    const n = charLen(text);
    clear(this.meta);
    const parts = [sel ? h('span', { class: 'count sel-count' }, h('i', { class: 'sel-dot', 'aria-hidden': 'true' }), `선택 ${nf.format(n)}자`) : h('span', { class: 'count', text: `${nf.format(n)}자` })];
    if (n > 0 && text.trim()) {
      const src = !sel && this.preview.text === text && this.preview.norm ? this.preview.norm : text;
      const chars = src.replace(/\s+/g, '').length;
      const s = chars / (6.8 * this.speed);
      const g = s * Settings.factor();
      parts.push(h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }), h('span', { text: `예상 ${approxDuration(s)} 분량` }),
        h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
        h('span', { 'data-tip': `${Settings.engine ? Settings.label(Settings.engine) + ' 기준 · ' : ''}맥의 사용 상태에 따라 달라지는 대략적인 시간이에요`, text: `만드는 데 대략 ${approxDuration(g).replace(/^약 /, '')}` }));
      this.estAudio = s;
    } else this.estAudio = 0;
    parts.push(h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
      h('span', { class: 'meta-chip', 'data-tip': '녹음과 텍스트는 이 맥 밖으로 나가지 않습니다' }, ic('i-lock'), '로컬 처리', h('span', { class: 'sr-only', text: ': 녹음과 텍스트는 이 맥 밖으로 나가지 않습니다' })));
    if (n > 2000 || (this.estAudio || 0) * Settings.factor() > 150) parts.push(h('span', { class: 'warn-chip' }, ic('i-alert'), '긴 글은 몇 분 걸릴 수 있어요'));
    add(this.meta, parts);
  },
  async loadPreview() {
    const text = this.ta.value;
    if (this.preview.ctrl) this.preview.ctrl.abort();
    if (!text.trim()) {
      this.preview = { ctrl: null, norm: '', text };
      this.pvSpin.hidden = true;
      this.pvText.className = 'preview-text muted';
      this.pvText.textContent = '텍스트를 입력하면 실제로 읽을 문장을 여기서 미리 볼 수 있어요.';
      this.pvMeta.hidden = true;
      return;
    }
    const ctrl = new AbortController();
    this.preview.ctrl = ctrl;
    this.pvSpin.hidden = false;
    this.pvText.classList.add('loading');
    try {
      const norm = await normalizeText(text, ctrl.signal);
      if (ctrl.signal.aborted) return;
      this.preview = { ctrl: null, norm, text };
      const { frag, changes } = diffFragment(text, norm);
      this.pvText.className = 'preview-text';
      clear(this.pvText).appendChild(frag);
      this.pvMeta.hidden = false;
      clear(this.pvMeta);
      add(this.pvMeta, [h('span', { text: changes ? `바뀐 부분 ${changes}곳` : '그대로 읽어요' }), h('span', { 'aria-hidden': 'true', text: '·' }),
        h('button', { class: 'btn btn-link', type: 'button', onclick: () => FixPron.open(), 'data-tip': `${MOD}⇧E` }, '발음 고치기'), h('span', { 'aria-hidden': 'true', text: '·' }),
        h('a', { href: '#/dictionary', text: '발음 사전 열기 →' })]);
      this.renderMeta();
    } catch (e) {
      if (e.name === 'AbortError') return;
      this.pvText.className = 'preview-text err';
      clear(this.pvText);
      add(this.pvText, [ic('i-alert'), h('span', { text: '미리보기를 불러오지 못했어요. 읽기에는 영향이 없어요.' })]);
      this.pvMeta.hidden = true;
    } finally {
      if (this.preview.ctrl === ctrl || !this.preview.ctrl) { this.pvSpin.hidden = true; this.pvText.classList.remove('loading'); }
    }
  },

  /* ----- inspector ----- */
  buildInspector() {
    this.voiceSearch = h('input', { class: 'input', type: 'search', placeholder: '목소리 검색', 'aria-label': '목소리 검색' });
    this.voiceSearchWrap = h('div', { class: 'search voice-search', hidden: true }, ic('i-search'), this.voiceSearch);
    this.voiceSearch.addEventListener('input', () => this.renderVoiceList());
    this.voiceList = h('div', { class: 'voice-list', role: 'radiogroup', 'aria-label': '목소리 선택' });
    this.voiceList.addEventListener('keydown', e => this.voiceKey(e));
    const vs = h('section', { class: 'ins-section ins-voices', 'aria-labelledby': 'ins-voice-h' },
      h('div', { class: 'ins-head' }, h('h2', { id: 'ins-voice-h', text: '목소리' }),
        h('span', { class: 'ins-links' },
          h('button', { class: 'btn-link cmp-link', type: 'button', 'data-tip': '같은 문장을 여러 목소리로 들어 보기', onclick: () => Compare.open() }, '비교'),
          h('a', { class: 'btn-link', href: '#/voices/new', text: '+ 새 목소리' }))),
      this.voiceSearchWrap, this.voiceList);

    // speed
    this.speedVal = h('span', { class: 'speed-value', 'aria-hidden': 'true' });
    this.presets = h('div', { class: 'segmented speed-presets equal', role: 'radiogroup', 'aria-label': '속도 프리셋' },
      SPEED_PRESETS.map(v => h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-v': v, text: v.toFixed(1), 'aria-label': `${v.toFixed(1)}배속`, onclick: () => this.setSpeed(v) })),
      h('span', { class: 'seg-indicator', 'aria-hidden': 'true' }));
    segRO.observe(this.presets);
    this.range = h('input', { class: 'range', type: 'range', min: '0.7', max: '1.5', step: '0.05', 'aria-label': '속도', id: 'speed-range' });
    this.rangeBubble = h('span', { class: 'range-bubble', 'aria-hidden': 'true' });
    const tick = h('span', { class: 'range-tick', 'aria-hidden': 'true', style: { left: `calc(8px + (100% - 16px) * ${(1 - 0.7) / 0.8})` } });
    this.rangeWrap = h('div', { class: 'range-wrap' }, this.range, tick, this.rangeBubble);
    this.range.addEventListener('input', () => this.setSpeed(parseFloat(this.range.value), true));
    this.range.addEventListener('dblclick', () => this.setSpeed(1));
    const startDrag = () => this.rangeWrap.classList.add('dragging');
    const endDrag = () => this.rangeWrap.classList.remove('dragging');
    this.range.addEventListener('pointerdown', startDrag);
    this.range.addEventListener('pointerup', endDrag);
    this.range.addEventListener('pointercancel', endDrag);
    this.range.addEventListener('blur', endDrag);
    const sp = h('section', { class: 'ins-section ins-speed', 'aria-labelledby': 'ins-speed-h' },
      h('div', { class: 'ins-head' }, h('h2', { id: 'ins-speed-h', text: '속도' }), this.speedVal),
      this.presets, this.rangeWrap,
      h('div', { class: 'range-labels', 'aria-hidden': 'true' }, h('span', { text: '0.7×' }), h('span', { text: '보통' }), h('span', { text: '1.5×' })));
    const tips = h('section', { class: 'ins-section ins-tips', 'aria-labelledby': 'ins-tip-h' },
      h('div', { class: 'ins-head' }, h('h2', { id: 'ins-tip-h', text: '팁' })),
      h('div', { class: 'tip-box' },
        h('p', null, ic('i-sparkle'), h('span', null, '숫자·날짜·약어는 자동으로 한글로 읽어요. 그래도 틀리는 단어는 발음 사전에 등록하세요. ', h('a', { href: '#/dictionary', text: '발음 사전 →' }))),
        h('p', null, ic('i-info'), h('span', { text: '긴 문장이 어색하면 문장을 짧게 나눠 보세요.' }))));
    this.engineSeg = h('div', { class: 'segmented engine-seg equal', role: 'radiogroup', 'aria-label': '음성 엔진' });
    this.engineDesc = h('p', { class: 'engine-desc', 'aria-live': 'polite' });
    this.engineSec = h('section', { class: 'ins-section ins-engine', 'aria-labelledby': 'ins-engine-h', hidden: true },
      h('div', { class: 'ins-head' }, h('h2', { id: 'ins-engine-h', text: '음성 엔진' })), this.engineSeg, this.engineDesc);
    this.engineSeg.addEventListener('keydown', e => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      e.preventDefault();
      const ids = Settings.engines.map(x => x.id);
      const i = ids.indexOf(Settings.engine);
      const next = ids[(i + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : ids.length - 1)) % ids.length];
      Settings.set(next).then(() => { const b = $(`[data-engine="${next}"]`, this.engineSeg); if (b) b.focus(); });
    });
    segRO.observe(this.engineSeg);
    this.inspector = h('div', { class: 'inspector' }, vs, this.engineSec, sp, tips);
    this.setSpeed(this.speed, true);
    return this.inspector;
  },
  setSpeed(v, fromRange) {
    v = Math.round(Math.min(1.5, Math.max(0.7, v)) * 100) / 100;
    this.speed = v;
    LS.setStr('speed', String(v));
    if (!fromRange || this.range.value !== String(v)) this.range.value = String(v);
    const pct = ((v - 0.7) / 0.8) * 100;
    this.range.style.setProperty('--fill', pct + '%');
    this.range.setAttribute('aria-valuetext', `${v.toFixed(2)}배속`);
    this.speedVal.textContent = speedFmt(v);
    this.rangeBubble.textContent = speedFmt(v);
    this.rangeBubble.style.left = `calc(8px + (100% - 16px) * ${pct / 100})`;
    $$('button', this.presets).forEach(b => {
      const on = Math.abs(parseFloat(b.dataset.v) - v) < 0.001;
      b.setAttribute('aria-checked', String(on));
    });
    const anyOn = $('[aria-checked="true"]', this.presets);
    $$('button', this.presets).forEach((b, i) => { b.tabIndex = (anyOn ? b === anyOn : i === 2) ? 0 : -1; });
    positionSeg(this.presets);
    if (this.meta) this.renderMeta();
  },
  renderEngine() {
    if (!this.engineSec) return;
    const show = Settings.loaded && Settings.engines.length > 1;
    this.engineSec.hidden = !show;
    if (!show) return;
    const seg = this.engineSeg;
    const ids = Settings.engines.map(x => x.id);
    if (seg.dataset.ids !== ids.join(',')) {
      clear(seg);
      for (const e of Settings.engines) {
        seg.appendChild(h('button', { type: 'button', role: 'radio', 'data-engine': e.id, 'aria-checked': 'false', 'data-tip': Settings.desc(e.id) || null,
          onclick: () => Settings.set(e.id) }, e.label));
      }
      seg.appendChild(h('span', { class: 'seg-indicator', 'aria-hidden': 'true' }));
      seg.dataset.ids = ids.join(',');
    }
    const locked = !!Synth.job || Settings.switching;
    $$('button', seg).forEach(b => {
      const on = b.dataset.engine === Settings.engine;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      if (locked && !on) setDisabled(b, true, Synth.job ? '읽는 중에는 바꿀 수 없어요' : '엔진을 바꾸는 중이에요');
      else { b.removeAttribute('aria-disabled'); if (b.dataset.tipDisabled) { b.dataset.tip = Settings.desc(b.dataset.engine); delete b.dataset.tipDisabled; } }
    });
    positionSeg(seg);
    clear(this.engineDesc);
    if (Settings.switching) add(this.engineDesc, [h('span', { class: 'spinner s12', 'aria-hidden': 'true' }), ' 엔진을 바꾸는 중이에요…']);
    else this.engineDesc.textContent = Settings.desc(Settings.engine);
  },
  currentVoice() {
    if (this.voice && Voices.get(this.voice)) return this.voice;
    return Voices.defaultName;
  },
  selectVoice(name, focus) {
    if (!this.voiceList) { this.voice = name; LS.setStr('voice', name); return; }
    this.voice = name;
    LS.setStr('voice', name);
    const sv = Voices.get(name);
    if (sv && sv.preset && LS.str('presetStart', '0') !== '1') { LS.setStr('presetStart', '1'); if (this.welcome && !this.welcome.hidden) this.renderVoices(); }
    $$('.voice-opt', this.voiceList).forEach(o => {
      const on = o.dataset.name === name;
      o.setAttribute('aria-checked', String(on));
      o.tabIndex = on ? 0 : -1;
      if (on && focus) { o.focus(); o.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    });
  },
  welcomeMode() {
    if (!Voices.loaded) return null;
    if (!Voices.list.length) return 'none';
    if (!Voices.mine.length && LS.str('presetStart', '0') !== '1') return 'presets';
    return null;
  },
  startWithPreset() {
    LS.setStr('presetStart', '1');
    const cur = Voices.get(this.voice);
    if (!cur) { const d = Voices.get(Voices.defaultName); this.voice = d ? d.name : (Voices.presets[0] && Voices.presets[0].name); if (this.voice) LS.setStr('voice', this.voice); }
    this.renderVoices();
    $('#main').scrollTop = 0;
    setTimeout(() => { if (this.ta) this.ta.focus({ preventScroll: true }); }, 30);
  },
  renderVoices() {
    const mode = this.welcomeMode();
    const empty = !!mode;
    this.welcome.hidden = !empty;
    this.grid.hidden = empty;
    if (empty) {
      if (this.welcome.dataset.mode !== mode || !this.welcome.firstChild) {
        clear(this.welcome).appendChild(welcomeCard({ presets: mode === 'presets' ? Voices.presets : [] }));
        this.welcome.dataset.mode = mode;
      }
      this.hideDockIfEmpty();
    } else this.welcome.dataset.mode = '';
    this.voiceSearch.placeholder = Voices.presets.length ? '이름·성별·나이로 검색' : '목소리 검색';
    this.voiceSearchWrap.hidden = Voices.list.length <= 5;
    this.voiceList.classList.toggle('scroll', Voices.list.length > 5);
    this.renderVoiceList();
    this.updateCTA();
  },
  renderVoiceList() {
    const list = this.voiceList;
    clear(list);
    if (!Voices.loaded) {
      for (let i = 0; i < 2; i++) list.appendChild(h('div', { class: 'voice-opt', 'aria-hidden': 'true' }, h('span', { class: 'skel', style: { width: '36px', height: '36px', borderRadius: '50%' } }), h('span', { class: 'v-text' }, h('span', { class: 'skel', style: { width: '60%', height: '12px' } }), h('span', { class: 'skel', style: { width: '40%', height: '10px', marginTop: '6px' } }))));
      return;
    }
    const q = this.voiceSearch.value.trim().toLowerCase();
    const sel = this.currentVoice();
    const match = v => {
      if (!q) return true;
      if (v.name.toLowerCase().includes(q)) return true;
      if (v.preset) { const t = presetTraits(v); return [GENDER_LABEL[t.gender], AGE_LABEL[t.age], '기본 제공', 'ai'].some(x => x && x.toLowerCase().includes(q)); }
      return false;
    };
    const mineItems = Voices.mine.filter(match), preItems = Voices.presets.filter(match);
    if (!mineItems.length && !preItems.length && q) { list.appendChild(h('p', { class: 'field-help', text: '일치하는 목소리가 없어요' })); return; }
    const grouped = Voices.presets.length > 0;
    const items = [];
    if (grouped && (mineItems.length || !q)) items.push({ header: '내 목소리', count: mineItems.length });
    items.push(...mineItems);
    if (grouped && !mineItems.length && !q) items.push({ cta: true });
    if (grouped && preItems.length) items.push({ header: '기본 제공', count: preItems.length, ai: true });
    items.push(...preItems);
    for (const v of items) {
      if (v.header) {
        list.appendChild(h('div', { class: 'voice-group', 'aria-hidden': 'true' }, h('span', { text: v.header }),
          v.ai ? h('span', { class: 'voice-group-note', 'data-tip': '실제 사람이 아닌 AI로 만든 목소리예요' }, 'AI') : null));
        continue;
      }
      if (v.cta) {
        list.appendChild(h('a', { class: 'voice-cta', href: '#/voices/new' }, ic('i-mic'), h('span', null, h('b', { text: '내 목소리 등록하기' }), h('span', { text: '10초만 읽으면 돼요' }))));
        continue;
      }
      const key = 'ref:' + v.name;
      const av = avatar(v.name, 36);
      const ring = document.createElementNS(SVGNS, 'svg'); ring.setAttribute('class', 'ring'); ring.setAttribute('viewBox', '0 0 44 44');
      const circ = document.createElementNS(SVGNS, 'circle'); circ.setAttribute('cx', '22'); circ.setAttribute('cy', '22'); circ.setAttribute('r', '21');
      const C = 2 * Math.PI * 21; circ.setAttribute('stroke-dasharray', String(C)); circ.setAttribute('stroke-dashoffset', String(C));
      ring.appendChild(circ); ring.style.display = 'none'; av.appendChild(ring);
      const pbtn = h('button', { class: 'icon-btn s28 round', type: 'button', tabindex: '-1', 'aria-label': `${v.name} 참조 음성 듣기`, 'data-tip': '미리듣기 (P)' }, ic('i-play'));
      pbtn.addEventListener('click', e => { e.stopPropagation(); Player.toggle(key, sampleUrl(v.name)); });
      const opt = h('div', {
        class: 'voice-opt', role: 'radio', 'aria-checked': String(v.name === sel), tabindex: v.name === sel ? '0' : '-1', 'data-name': v.name,
        'aria-label': v.preset ? `${v.name}, 기본 제공 AI 목소리${v.default ? ', 기본 목소리' : ''}` : `${v.name}, 참조 ${sec1(v.seconds)}초${v.default ? ', 기본 목소리' : ''}`,
      }, av,
      h('span', { class: 'v-text' }, h('span', { class: 'v-name', text: v.name, title: v.name }),
        h('span', { class: 'v-meta', text: v.preset ? 'AI 목소리 · 기본 제공' : `참조 ${sec1(v.seconds)}초` })),
      v.default ? h('span', { class: 'badge badge-default' }, ic('i-star-fill'), '기본') : null,
      pbtn);
      opt.addEventListener('click', () => this.selectVoice(v.name));
      Player.bind(opt, () => {
        const on = Player.playing(key);
        setIc($('svg', pbtn), on ? 'i-pause' : 'i-play');
        const active = Player.key === key && (on || Player.time(key) > 0);
        ring.style.display = active ? '' : 'none';
        if (active) { const d = Player.dur(key) || 1; circ.setAttribute('stroke-dashoffset', String(C * (1 - Player.time(key) / d))); }
      });
      list.appendChild(opt);
    }
    if (!$('.voice-opt[tabindex="0"]', list)) { const f = $('.voice-opt', list); if (f) f.tabIndex = 0; }
    const selEl = $('.voice-opt[aria-checked="true"]', list);
    if (selEl) requestAnimationFrame(() => { // 선택한 목소리가 보이도록 목록 안에서만 스크롤
      if (list.scrollHeight > list.clientHeight + 2) list.scrollTop = Math.max(0, selEl.offsetTop - list.offsetTop - 40);
      if (list.scrollWidth > list.clientWidth + 2) list.scrollLeft = Math.max(0, selEl.offsetLeft - list.offsetLeft - 20);
    });
  },
  voiceKey(e) {
    const opts = $$('.voice-opt', this.voiceList);
    const i = opts.indexOf(document.activeElement);
    if (i < 0) return;
    if (['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); const n = opts[(i + 1) % opts.length]; this.selectVoice(n.dataset.name, true); }
    else if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); const n = opts[(i - 1 + opts.length) % opts.length]; this.selectVoice(n.dataset.name, true); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); this.selectVoice(opts[i].dataset.name); }
    else if (e.key === 'p' || e.key === 'P' || e.key === 'ㅔ') { e.preventDefault(); const n = opts[i].dataset.name; Player.toggle('ref:' + n, sampleUrl(n)); }
  },

  /* ----- generate ----- */
  disabledReason() {
    if (Status.offline) return '앱에 연결할 수 없어요';
    if (Voices.loaded && !Voices.list.length) return '먼저 목소리를 등록하세요';
    if (Settings.switching) return '엔진을 바꾸는 중이에요';
    if (!this.ta.value.trim()) return '읽을 텍스트를 입력하세요';
    if (Synth.job && Synth.job.kind !== 'studio') return Synth.job.kind === 'compare' ? '목소리 비교를 만드는 중이에요' : '다른 음성을 만드는 중이에요';
    return null;
  },
  updateCTA(tickOnly) {
    if (!this.genBtn) return;
    const job = Synth.job && Synth.job.kind === 'studio' ? Synth.job : null;
    const b = this.genBtn;
    if (job) {
      const label = this.jobLabel(job);
      if (!b.classList.contains('running')) {
        b.classList.add('running');
        clear(b); add(b, [h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'label' })]);
        b.setAttribute('aria-busy', 'true');
        setDisabled(b, true);
        this.stopBtn.hidden = false;
      }
      $('.label', b).textContent = label;
      return;
    }
    if (tickOnly) return;
    if (b.classList.contains('running') || !b.firstChild) {
      b.classList.remove('running');
      b.removeAttribute('aria-busy');
      clear(b); add(b, [ic('i-play-wave'), h('span', { class: 'cta-label', text: '내 목소리로 읽기' }), h('span', { class: 'kbd', text: `${MOD}↵`, 'aria-hidden': 'true' })]);
      this.stopBtn.hidden = true;
    }
    b.setAttribute('aria-keyshortcuts', IS_MAC ? 'Meta+Enter' : 'Control+Enter');
    const reason = this.disabledReason();
    const sel = this.selText();
    const lbl = $('.cta-label', b);
    if (lbl) lbl.textContent = sel ? '선택한 부분만 읽기' : '내 목소리로 읽기';
    b.classList.toggle('sel-mode', !!sel);
    setDisabled(b, !!reason, reason);
    if (!reason) { if (sel) b.dataset.tip = '선택한 부분만 읽어요. 전체를 읽으려면 선택을 해제하세요.'; else delete b.dataset.tip; }
  },
  selText() {
    const ta = this.ta;
    if (!ta || ta.selectionStart === ta.selectionEnd) return '';
    const t = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    return /[0-9A-Za-z가-힣]/.test(t) ? t : '';
  },
  onSel() {
    const sel = this.selText();
    const key = sel ? `${this.ta.selectionStart}:${this.ta.selectionEnd}` : '';
    if (key === this.selKey) return;
    this.selKey = key;
    this.fixChip.hidden = !sel || charLen(sel.trim()) > 40;
    this.renderMeta();
    if (!Synth.job) this.updateCTA();
  },
  jobLabel(job) {
    const el = clock((performance.now() - job.start) / 1000);
    if (!job.firstAt && !Status.loaded) return `목소리 준비 중 ${el}`;
    if (job.streaming && !job.firstAt) return '첫 소리 준비 중…';
    if (job.streaming && job.firstAt && this.live && this.live.buffering && !this.live.stopped) return this.live.started ? '버퍼링 중…' : `소리 모으는 중 ${el}`;
    return `읽는 중 ${el}`;
  },
  toggleLive() { if (this.live && !this.live.stopped && this.live.started) { this.live.toggle(); setTimeout(() => this.updateDockGenerating(), 30); return true; } return false; },
  retakeSame() {
    const r = this.result;
    if (!r || Synth.job) return;
    this.generate({ text: r.text, voice: Voices.get(r.voice) ? r.voice : this.currentVoice(), speed: r.speed, seed: r.seed != null && r.seed !== 42 ? r.seed : null, retake: true });
  },
  retake() {
    const r = this.result;
    if (!r || Synth.job) return;
    this.generate({ text: r.text, voice: Voices.get(r.voice) ? r.voice : this.currentVoice(), speed: r.speed, seed: 1 + Math.floor(Math.random() * 2147483645), retake: true });
  },
  async generate(opts = {}) {
    if (Synth.job) return;
    const reason = opts.text ? (Status.offline ? '앱에 연결할 수 없어요' : null) : this.disabledReason();
    if (reason) { if (!this.ta.value.trim()) this.ta.focus(); return; }
    const actx = Live.prime(); // 사용자 입력 안에서 오디오를 깨워 둔다 (자동 재생 정책)
    const text = opts.text || this.selText() || this.ta.value;
    const n = charLen(text);
    if (n > 20000) {
      const mins = Math.max(1, Math.round(text.replace(/\s+/g, '').length / (6.8 * this.speed) / 60));
      const gm = Math.max(1, Math.round(mins * Settings.factor()));
      const ok = await confirmModal({ title: `아주 긴 글이에요(약 ${mins}분 분량)`, body: `${Settings.engine ? Settings.label(Settings.engine) + '로 ' : ''}만드는 데 약 ${gm}분 걸릴 수 있어요. 계속할까요?`, ok: '계속' });
      if (!ok) return;
    }
    const voice = opts.voice || this.currentVoice();
    const speed = opts.speed || this.speed;
    const seed = opts.seed != null ? opts.seed : null;
    const r0 = this.result;
    if (!opts.retake && r0 && r0.text === text && r0.voice === voice && r0.speed === speed && r0.engine === Settings.engine && LS.str('hintSeed', '0') !== '1') {
      LS.setStr('hintSeed', '1');
      toast({ type: 'info', title: '같은 설정이면 같은 소리가 나와요', body: "억양을 바꿔 보려면 '다른 억양으로 다시'를 눌러 보세요.", duration: 8000 });
    }
    const src = this.preview.text === text && this.preview.norm ? this.preview.norm : text;
    const est = src.replace(/\s+/g, '').length / (6.8 * speed);
    this.genMeta = { voice, text, est, retake: !!opts.retake };
    this.pctMax = 0; this.nudged = this.nudged || false;
    Player.stop();
    const sentences = (src.match(/[.!?。…]+(\s|$)/g) || []).length || 1;
    this.live = actx ? new LivePlayback(actx, { estTotal: est, short: sentences <= 1 && est <= 6, factor: Settings.factor() }) : null;
    this.liveWave = new LiveWave(est);
    this.lastPct = 0;
    this.showDock('generating');
    srAnnounce('읽기를 시작했어요');
    const pulse = () => { const pb = $('.play-btn', this.dock); if (pb) { pb.classList.remove('pulse'); void pb.offsetWidth; pb.classList.add('pulse'); } };
    try {
      const r = await Synth.runStream({
        text, voice, speed, seed, kind: 'studio',
        onFirst: () => { this.updateCTA(true); this.buildDockGenerating(); srAnnounce('소리가 나오기 시작했어요'); },
        onChunk: (f32, sr) => { if (this.live) this.live.push(f32, sr); if (this.liveWave) this.liveWave.add(f32, sr); },
        onStop: () => { if (this.live) this.live.stop(); },
      });
      // 실시간 재생 → 일반 플레이어로 이어 받기
      const live = this.live; this.live = null; this.liveWave = null;
      let at = 0, autoplay = true;
      if (r.streamed && live) {
        live.finish();
        const pos = live.position(), rest = live.received - pos, paused = !!live.userPaused;
        live.stop();
        if (paused) { at = pos; autoplay = false; }
        else if (rest > 0.15) at = pos;
        else autoplay = false; // 이미 끝까지 들었음
      } else if (live) live.stop();
      const tk = `${r.text}|${r.voice}|${r.speed}|${r.engine}`;
      this.takeCount = this.takeCount || new Map();
      r.take = (this.takeCount.get(tk) || 0) + 1; this.takeCount.set(tk, r.take);
      this.setResult(r);
      if (at && this.resultWave) { this.resultWave.pos = at; this.resultWave.tick(); }
      this.finishTitle();
      srAnnounce(`읽기를 마쳤어요. ${sec1(r.duration)}초 음성`);
      History.markNew(r.historyId);
      if (r.later) r.later.then(info => {
        r.later = null;
        if (info) {
          r.historyId = info.history_id; if (info.seed != null) r.seed = info.seed; if (info.engine) r.engine = info.engine;
          History.markNew(r.historyId);
          if (this.result === r && this.dockMode === 'result') { const t = Player.key === this.resultKey() ? Player.el.currentTime : null; this.showDock('result'); if (t != null && this.resultWave) this.resultWave.tick(); }
        } else {
          r.partial = true;
          toast({ type: 'error', title: '끝까지 읽지 못했어요', body: '받은 부분까지만 들을 수 있어요. 다시 시도하거나 문장을 짧게 나눠 보세요.', action: { label: '다시 시도', fn: () => this.retakeSame() } });
        }
      });
      if (r.partial) toast({ type: 'error', title: '끝까지 읽지 못했어요', body: '받은 부분까지만 들을 수 있어요. 다시 시도하거나 문장을 짧게 나눠 보세요.', action: { label: '다시 시도', fn: () => this.generate() } });
      if (!onRoute('studio')) {
        toast({ type: 'success', title: '읽기를 마쳤어요', body: `${sec1(r.duration)}초 음성`, action: { label: autoplay ? '보기' : '다시 듣기', fn: () => { Router.navigate('#/studio'); if (!autoplay) Player.play(this.resultKey(), r.url, 0).catch(() => {}); } } });
      }
      if (autoplay) Player.play(this.resultKey(), r.url, at).catch(pulse);
    } catch (e) {
      if (this.live) { this.live.stop(); this.live = null; }
      this.liveWave = null;
      restoreTitle();
      this.showDock(this.result ? 'result' : 'hidden');
      if (e.stopped) { toast({ type: 'info', title: '멈췄어요' }); srAnnounce('읽기를 멈췄어요'); return; }
      const f = friendly(e);
      if (f.refreshVoices) Voices.load();
      if (f.modal) { modal({ title: '오디오 변환 도구가 없어요', body: f.msg, actions: [{ label: '확인', kind: 'primary', value: 1, initial: true }] }); return; }
      toast({
        type: 'error', title: '읽기에 실패했어요', body: f.msg,
        action: f.rerecord ? { label: '다시 녹음', fn: () => Router.navigate('#/voices/new?replace=' + encodeURIComponent(voice)) }
          : (f.net ? null : { label: '다시 시도', fn: () => this.generate() }),
      });
    }
  },
  resultKey() { return this.result ? 'result:' + this.result.url : null; },
  setResult(r, { keepTakes } = {}) {
    const old = this.result;
    this.result = r;
    if (old && old.url !== r.url) Player.release('result:' + old.url);
    if (!keepTakes) {
      this.takes = (this.takes || []).filter(t => t !== r);
      this.takes.unshift(r);
      for (const t of this.takes.splice(5)) { // 최근 5개만 보관
        Player.release('take:' + t.url); Peaks.drop(t.url);
        if (t !== this.result) setTimeout(() => URL.revokeObjectURL(t.url), 1000);
      }
    }
    this.showDock('result');
    this.renderTakes();
  },
  /* ----- 최근 결과 ----- */
  renderTakes() {
    const box = this.takesBox;
    if (!box) return;
    const takes = this.takes || [];
    box.hidden = takes.length < 2;
    clear(box);
    if (box.hidden) return;
    box.append(h('div', { class: 'takes-head' }, h('h2', { id: 'takes-h' }, ic('i-clock'), '최근 결과'),
      h('span', { class: 'field-help', text: '이번에 만든 음성을 비교해 들어 보세요' })));
    const list = h('ul', { class: 'takes-list' });
    takes.forEach(t => {
      const key = 'take:' + t.url;
      const cur = t === this.result;
      const snip = [...t.text.replace(/\s+/g, ' ').trim()].slice(0, 28).join('') + (charLen(t.text) > 28 ? '…' : '');
      const li = h('li', { class: 'take' + (cur ? ' current' : '') },
        playButton(key, t.url, { size: 32, label: `${t.voice} 테이크 ${t.take || 1} ` }),
        h('div', { class: 'take-text' },
          h('div', { class: 'take-title' }, avatar(t.voice, 16), h('b', { text: t.voice }),
            h('span', { class: 'badge', text: `테이크 ${t.take || 1}` }),
            t.seed != null && t.seed !== 42 ? h('span', { class: 'badge', title: `seed ${t.seed}`, text: '다른 억양' }) : null,
            t.engine ? h('span', { class: 'eng-badge', 'data-eng': t.engine }, t.engine === 'qwen' ? '고품질' : '빠른') : null),
          h('div', { class: 'take-meta', title: t.text }, `${sec1(t.duration)}초 · ${speedShort(t.speed)} · "${snip}"`)),
        cur ? h('span', { class: 'take-cur', text: '지금 결과' }) : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { Player.stop(); this.setResult(t, { keepTakes: true }); } }, '결과로 보기'),
        h('button', { class: 'icon-btn s32', type: 'button', 'aria-label': `${Export.label()}로 내려받기`, 'data-tip': `${Export.label()}로 내려받기`, onclick: () => this.download(t) }, ic('i-download')));
      list.appendChild(li);
    });
    box.appendChild(list);
  },
  /* ----- 진행률 · 창 제목 ----- */
  progress() {
    const job = Synth.job;
    if (!job || !this.genMeta) return null;
    const el = (performance.now() - job.start) / 1000;
    const est = this.genMeta.est || 0;
    let p = null, rest = null;
    if (job.streaming && job.firstAt && this.liveWave && this.live) {
      const got = this.liveWave.got, tot = Math.max(est * 1.4, got * 1.05);
      p = got / tot * 100;
      const r = this.live.rate();
      rest = r > 0 ? (tot - got) / r : null;
    } else if (est > 0) {
      // 시간으로 어림: 90%까지는 비례, 그 뒤로는 천천히 다가간다 (뒤로 가지 않음)
      const total = est * Settings.factor() + 4 + (Status.loaded ? 0 : 8);
      const x = el / total;
      p = x < 0.9 ? x * 100 : 90 + 5 * (1 - Math.exp(-(x - 0.9) * 2));
      rest = x < 0.9 ? total - el : null;
    }
    if (p == null) return null;
    p = Math.min(95, Math.max(this.pctMax || 0, Math.floor(p)));
    this.pctMax = p;
    return { p, rest: rest != null ? Math.max(0, rest) : null, el };
  },
  updateTitle() {
    const pr = this.progress();
    if (pr && pr.el >= 2) document.title = `⏵ ${pr.p}% · 온음`;
    else if (Synth.job) document.title = `⏵ 읽는 중 · 온음`;
  },
  finishTitle() {
    if (document.hidden) { document.title = '✓ 다 읽었어요 · 온음'; this.doneTitle = true; }
    else restoreTitle();
  },
  hideDockIfEmpty() { if (!Synth.job && !this.result) this.showDock('hidden'); },
  showDock(mode) {
    const d = this.dock;
    const prev = this.dockMode;
    this.dockMode = mode;
    if (mode === 'hidden') {
      if (!d.hidden) {
        d.classList.add('leaving');
        setTimeout(() => { if (this.dockMode === 'hidden') { d.hidden = true; d.classList.remove('leaving'); clear(d); updateDockToastOffset(); } }, reducedMotion() ? 0 : 300);
      }
      return;
    }
    d.classList.remove('leaving');
    const wasHidden = d.hidden;
    d.hidden = false;
    if (!wasHidden && prev !== mode) d.style.animation = 'none'; else d.style.animation = '';
    clear(d);
    if (mode === 'generating') this.buildDockGenerating();
    else this.buildDockResult();
    updateDockToastOffset();
  },
  buildDockGenerating() {
    const d = this.dock;
    if (this.dockMode !== 'generating') return;
    clear(d);
    const job = Synth.job;
    const streaming = !!(job && job.firstAt && this.liveWave);
    let mid;
    if (streaming) {
      mid = this.liveWave.root;
      this.livePlayBtn = h('button', { class: 'icon-btn play-btn s44', type: 'button', 'aria-label': '일시정지', onclick: () => this.toggleLive() }, ic('i-pause'));
    } else {
      mid = h('div', { class: 'wave-skel', 'aria-hidden': 'true' });
      let seed = 7;
      const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let i = 0; i < 40; i++) mid.appendChild(h('i', { style: { height: Math.round(6 + rnd() * 30) + 'px' } }));
      this.livePlayBtn = null;
    }
    this.genTime = h('span', { class: 'dock-time', 'aria-hidden': 'true', text: '0:00' });
    this.genMetaEl = h('span', { class: 'txt' });
    const v = this.genMeta ? this.genMeta.voice : '';
    d.append(h('div', { class: 'ibar', 'aria-hidden': 'true' }),
      h('div', { class: 'dock-inner' },
        h('div', { class: 'dock-row' },
          streaming ? this.livePlayBtn : h('span', { class: 'gen-ring', 'aria-hidden': 'true' }, h('span', { class: 'spinner s20' })),
          mid, this.genTime,
          h('button', { class: 'icon-btn s36', type: 'button', 'aria-label': '멈추기', 'data-tip': '멈추기 (Esc)', onclick: () => Synth.stop() }, ic('i-stop'))),
        h('div', { class: 'dock-meta' }, v ? avatar(v, 16) : null, this.genMetaEl)));
    this.updateDockGenerating();
    if (streaming) this.liveLoop();
  },
  liveLoop() {
    cancelAnimationFrame(this.liveRaf);
    const step = () => {
      if (this.dockMode !== 'generating' || !this.liveWave) return;
      const pos = this.live ? this.live.position() : 0;
      this.liveWave.draw(pos);
      if (this.genTime && Synth.job && Synth.job.firstAt) this.genTime.textContent = `${clock(pos)} / ${clock(this.liveWave.got)}`;
      this.liveRaf = requestAnimationFrame(step);
    };
    this.liveRaf = requestAnimationFrame(step);
  },
  updateDockGenerating() {
    if (this.dockMode !== 'generating' || !this.genTime || !Synth.job) return;
    const job = Synth.job;
    const el = (performance.now() - job.start) / 1000;
    if (!job.firstAt || !this.liveWave) this.genTime.textContent = clock(el);
    const v = this.genMeta ? this.genMeta.voice : '';
    const est = this.genMeta ? this.genMeta.est || 0 : 0;
    const long = est * Settings.factor() > 40 || (this.genMeta && charLen(this.genMeta.text) > 300);
    let prep;
    if (!job.firstAt && !Status.loaded) prep = '목소리를 준비하는 중';
    else if (job.streaming && !job.firstAt) prep = '첫 소리를 준비하는 중';
    else if (this.live && this.live.paused && this.live.userPaused) prep = '일시정지됨 · 계속 만들고 있어요';
    else if (this.live && this.live.paused && this.live.started) prep = '브라우저가 소리를 막았어요 · 재생 버튼을 눌러 주세요';
    else if (this.live && this.live.state === 'buffering') {
      const need = this.live.need();
      const pct = isFinite(need) && need > 0 ? Math.min(99, Math.floor(this.live.pendSec / need * 100)) : null;
      prep = this.live.short ? '짧은 글이라 다 만든 뒤에 바로 들려 드려요' : `끊기지 않게 소리를 모으는 중…${pct != null ? ` ${Math.max(this.lastPct || 0, pct)}%` : ''}`;
      this.lastPct = Math.max(this.lastPct || 0, pct || 0);
    }
    else if (this.live && this.live.state === 'rebuffering') prep = '버퍼링 중… 곧 이어서 읽어요';
    else prep = `${v}${josa(v, '으로로')} 읽는 중`;
    const pr = this.progress();
    const prog = pr && pr.el >= 5 && !(this.live && this.live.short) ? ` · 약 ${pr.p}%${pr.rest != null && pr.rest >= 1 ? ` · 남은 시간 약 ${approxDuration(pr.rest).replace(/^약 /, '')}` : ''}` : '';
    if (!this.nudged && Settings.engine === 'qwen' && el > 90 && est * Settings.factor() > 180) {
      this.nudged = true;
      toast({ type: 'info', title: "더 빨리 만들고 싶다면 '빠른 모드'도 있어요", body: '발음 정확도는 조금 낮아요. 지금 작업은 그대로 계속돼요.', duration: 9000, action: { label: '엔진 보기', fn: () => { Router.navigate('#/studio'); setTimeout(() => { if (this.engineSec) { this.engineSec.scrollIntoView({ block: 'center' }); const b = $('[aria-checked="true"]', this.engineSeg); if (b) b.focus(); } }, 100); } } });
    }
    this.genMetaEl.textContent = `${prep}${prog} · ${clock(el)} 경과 · 멈추려면 Esc` + (long ? ' · 긴 글이라 몇 분 걸릴 수 있어요. 다른 화면으로 이동해도 계속 읽어요.' : '');
    if (this.live && this.live.state === 'playing') this.lastPct = 0;
    if (this.livePlayBtn && this.live) {
      setDisabled(this.livePlayBtn, !this.live.started && !this.live.paused, '소리를 모으는 중이에요');
      const paused = this.live.paused;
      setIc($('svg', this.livePlayBtn), paused ? 'i-play' : 'i-pause');
      this.livePlayBtn.setAttribute('aria-label', paused ? '재생' : '일시정지');
    }
  },
  buildDockResult() {
    const r = this.result;
    if (!r) return;
    const key = this.resultKey();
    const timeEl = h('span', { class: 'dock-time', 'aria-hidden': 'true' });
    const wave = this.resultWave = new Waveform({ key, src: r.url, height: 40, onTime: (t, d) => { timeEl.textContent = `${clock(t)} / ${clock(d || r.duration)}`; } });
    const play = playButton(key, () => r.url, { size: 44, cls: 'icon-btn play-btn' });
    const dl = h('button', { class: 'icon-btn s36', type: 'button', 'aria-label': `${Export.label()}로 내려받기`, 'data-tip': `${Export.label()}로 내려받기 (${MOD}⇧D)`, onclick: () => this.download() }, ic('i-download'));
    const fmt = h('button', { class: 'btn btn-ghost btn-sm fmt-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': `내려받기 형식: ${Export.label()}`, 'data-tip': '내려받기 형식' }, Export.label(), ic('i-chevron-down'));
    fmt.addEventListener('click', () => Export.menu(fmt));
    const again = h('button', { class: 'icon-btn s36 retake-btn', type: 'button', 'aria-label': '다른 억양으로 다시 읽기', 'data-tip': `다른 억양으로 다시 읽기 (${MOD}⇧↵)`, onclick: () => this.retake() }, ic('i-shuffle'));
    if (Synth.job) setDisabled(again, true, '다른 음성을 만드는 중이에요');
    const more = h('button', { class: 'icon-btn s36', type: 'button', 'aria-label': '더보기', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-tip': '더보기' }, ic('i-more'));
    more.addEventListener('click', () => openMenu(more, [
      r.historyId ? { label: '기록에서 보기', icon: 'i-clock', fn: () => { History.focusId = r.historyId; Router.navigate('#/history'); }, noRestore: true } : null,
      { label: '텍스트 다시 불러오기', icon: 'i-rewrite', fn: () => {
        const prev = this.ta.value;
        if (prev === r.text) { this.ta.focus(); return; }
        this.setText(r.text); this.ta.focus();
        if (prev.trim()) toast({ type: 'info', title: '텍스트를 바꿨어요', action: { label: '되돌리기', fn: () => this.setText(prev) } });
      } },
      { label: '다른 억양으로 다시 읽기', icon: 'i-shuffle', fn: () => this.retake() },
      { label: `${Export.label()}로 내려받기`, icon: 'i-download', fn: () => this.download() },
      { label: '내려받기 형식 바꾸기…', icon: 'i-file-audio', fn: () => Export.menu(more) },
    ], { label: '결과 더보기' }));
    const snippet = r.text.replace(/\s+/g, ' ').trim();
    const snip = [...snippet].length > 40 ? [...snippet].slice(0, 40).join('') + '…' : snippet;
    this.dock.append(h('div', { class: 'dock-inner' },
      h('div', { class: 'dock-row' }, play, wave.root, timeEl, again, dl, fmt, more),
      h('div', { class: 'dock-meta' }, avatar(r.voice, 16),
        h('span', { class: 'txt', title: r.text, text: `${r.voice} · ${speedShort(r.speed)} · "${snip}"${(r.take || 1) > 1 ? ` · 테이크 ${r.take}` : ''}${r.seed != null && r.seed !== 42 ? ' · 다른 억양' : ''} · ${sec1(r.elapsed)}초 걸림` }))));
    timeEl.textContent = `0:00 / ${clock(r.duration)}`;
  },
  download(r = this.result) {
    if (!r) return;
    if (r.historyId) { Export.history({ id: r.historyId, time: r.at, voice: r.voice, text: r.text }); return; }
    // 기록에 없는 결과(중간에 끊긴 결과 등)는 받은 그대로 WAV 로
    const name = Export.name({ time: r.at, voice: r.voice, text: r.text }, 'wav');
    saveBlob(r.blob, name);
    toast({ type: 'success', title: '내려받기를 시작했어요', body: Export.fmt !== 'wav' ? `${name} · 기록에 없는 결과라 WAV로 받아요` : name });
  },
};


/* =====================================================================
   11-b. 발음 고치기 (스튜디오에서 바로 사전에)
   ===================================================================== */
const FixPron = {
  async open(prefill) {
    if (!onRoute('studio') || modalOpen) return;
    const first = [...String(prefill != null ? prefill : Studio.selText()).replace(/\s+/g, ' ').trim()].slice(0, 40).join('');
    let lastUrl = null;
    const res = await modal({
      title: '발음 고치기', cls: 'fix-modal', body: done => {
        const src = h('input', { class: 'input', id: 'fix-src', type: 'text', maxlength: '40', value: first, placeholder: '예: ChatGPT', autocomplete: 'off', spellcheck: 'false' });
        const dst = h('input', { class: 'input', id: 'fix-dst', type: 'text', maxlength: '80', placeholder: '예: 챗지피티', autocomplete: 'off', spellcheck: 'false' });
        const msg = h('div', { class: 'fix-msg', 'aria-live': 'polite' });
        const say = (t, kind = 'error') => { clear(msg); if (t) msg.appendChild(h('p', { class: `field-msg ${kind}` }, ic(kind === 'error' ? 'i-alert' : 'i-info'), h('span', { text: t }))); };
        const tryBtn = h('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, ic('i-play'), h('span', { text: '이 발음으로 들어보기' }));
        const playKey = 'fix:try';
        tryBtn.addEventListener('click', async () => {
          const t = dst.value.trim();
          if (!t) { say('읽는 법을 먼저 입력해 주세요.'); dst.focus(); return; }
          if (Synth.job) { say('다른 음성을 만드는 중이에요. 끝난 뒤에 다시 눌러 주세요.'); return; }
          say('');
          tryBtn.setAttribute('aria-busy', 'true'); setDisabled(tryBtn, true);
          $('span', tryBtn).textContent = '만드는 중…';
          try {
            const r = await Synth.run({ text: t, voice: Studio.currentVoice(), speed: 1, kind: 'try' });
            if (lastUrl) { Player.release(playKey); URL.revokeObjectURL(lastUrl); }
            lastUrl = r.url;
            Player.play(playKey, r.url, 0).catch(() => {});
          } catch (e) { if (!e.stopped) say(friendly(e).msg); }
          finally { tryBtn.removeAttribute('aria-busy'); setDisabled(tryBtn, false); $('span', tryBtn).textContent = '이 발음으로 들어보기'; }
        });
        const save = async () => {
          const a = src.value.replace(/[\t\r\n]+/g, ' ').trim(), b = dst.value.replace(/[\t\r\n]+/g, ' ').trim();
          if (!a) { say('고칠 단어(원문)를 입력해 주세요.'); src.focus(); return; }
          if (!b) { say('읽는 법을 입력해 주세요.'); dst.focus(); return; }
          saveBtn.setAttribute('aria-busy', 'true');
          try { done(await api('/api/dict/upsert', { method: 'POST', json: { src: a, dst: b } })); }
          catch (e) { say(friendly(e).msg); saveBtn.removeAttribute('aria-busy'); }
        };
        const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: save }, '사전에 저장');
        [src, dst].forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); save(); } }));
        setTimeout(() => (first ? dst : src).focus(), 30);
        return h('div', { class: 'fix-body' },
          h('div', { class: 'fix-row' },
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'fix-src', text: '원문' }), src),
            h('span', { class: 'fix-arrow', 'aria-hidden': 'true' }, ic('i-arrow-right')),
            h('div', { class: 'field' }, h('label', { class: 'field-label', for: 'fix-dst', text: '읽는 법' }), dst)),
          h('div', { class: 'fix-try' }, tryBtn, h('span', { class: 'field-help', text: '지금 고른 목소리로 읽는 법만 짧게 들려 드려요 (기록에는 남지 않아요)' })),
          msg,
          h('p', { class: 'field-help fix-note', text: '저장하면 바로 적용돼요. 숫자·날짜·영어 약어는 자동으로 읽으니 등록하지 않아도 돼요.' }),
          h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => done(null) }, '취소'), saveBtn));
      },
    });
    if (lastUrl) { Player.release('fix:try'); setTimeout(() => URL.revokeObjectURL(lastUrl), 500); }
    if (!res) return;
    const { src, dst } = res;
    toast({ type: 'success', title: `'${src}' → '${dst}' 사전에 저장했어요`, body: '바로 적용돼요.', action: Studio.result ? { label: '다시 읽기', fn: () => Studio.retakeSame() } : null });
    Studio.loadPreview();
    if (typeof Dict !== 'undefined' && Dict.loaded) {
      if (!Dict.dirtyCount()) Dict.load();
      else {
        const k = src.toLowerCase();
        const row = Dict.rows.find(r => r.src.trim().toLowerCase() === k);
        if (row) { row.dst = dst; const o = Dict.orig.get(row.id); if (o) o.dst = dst; }
        else { const id = ++rowSeq; Dict.rows.push({ id, src, dst }); Dict.orig.set(id, { src, dst }); }
        Dict.renderTable(); Dict.updateDirty();
      }
      if (Dict.runTest) Dict.runTest();
    }
  },
};

/* =====================================================================
   11-c. 여러 목소리로 비교 (첫 문장 또는 선택한 부분)
   ===================================================================== */
const Compare = {
  running: false, cancelled: false, items: [], text: '',
  pickText() {
    const sel = Studio.selText();
    if (sel) return { text: sel.trim(), from: '선택한 부분' };
    const all = Studio.ta.value.trim();
    if (!all) return null;
    const parts = all.split(/(?<=[.!?…。？！])\s+|\n+/).map(x => x.trim()).filter(x => /[0-9A-Za-z가-힣]/.test(x));
    let t = parts[0] || all;
    if (charLen(t) > 80) t = [...t].slice(0, 80).join('');
    return { text: t, from: '첫 문장' };
  },
  async open() {
    if (Synth.job) { toast({ type: 'info', title: '다른 음성을 만드는 중이에요', body: '끝난 뒤에 다시 눌러 주세요.' }); return; }
    const pick = this.pickText();
    if (!pick) { toast({ type: 'info', title: '먼저 읽을 텍스트를 입력하세요' }); Studio.ta.focus(); return; }
    const MAX = 3;
    const chosen = new Set([Studio.currentVoice()].filter(Boolean));
    const voices = await modal({
      title: '여러 목소리로 비교', wide: true, cls: 'cmp-modal', body: done => {
        const est = pick.text.replace(/\s+/g, '').length / (6.8 * Studio.speed);
        const go = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => done([...chosen]) });
        const help = h('span', { class: 'field-help' });
        const sync = () => {
          $$('input', grid).forEach(cb => { cb.disabled = !cb.checked && chosen.size >= MAX; cb.closest('label').classList.toggle('disabled', cb.disabled); });
          clear(go); add(go, [ic('i-play-wave'), chosen.size ? `${chosen.size}개 목소리로 들어보기` : '목소리를 골라 주세요']);
          setDisabled(go, chosen.size < 1, '목소리를 골라 주세요');
          help.textContent = chosen.size ? `약 ${approxDuration(Math.max(2, est * Settings.factor() + 1) * chosen.size).replace(/^약 /, '')} 걸려요 · 하나씩 차례로 만들어요` : `최대 ${MAX}개까지 고를 수 있어요`;
        };
        const grid = h('div', { class: 'cmp-grid', role: 'group', 'aria-label': `비교할 목소리 (최대 ${MAX}개)` });
        const groups = [['내 목소리', Voices.mine], ['기본 제공', Voices.presets]];
        for (const [label, list] of groups) {
          if (!list.length) continue;
          grid.appendChild(h('div', { class: 'cmp-group', text: label }));
          for (const v of list) {
            const cb = h('input', { type: 'checkbox', value: v.name });
            cb.checked = chosen.has(v.name);
            cb.addEventListener('change', () => { if (cb.checked) { if (chosen.size >= MAX) { cb.checked = false; return; } chosen.add(v.name); } else chosen.delete(v.name); sync(); });
            grid.appendChild(h('label', { class: 'cmp-opt' }, cb, avatar(v.name, 28), h('span', { class: 'n', text: v.name, title: v.name })));
          }
        }
        setTimeout(() => { const f = $('input', grid); if (f) f.focus(); sync(); }, 30);
        sync();
        return h('div', null,
          h('p', { class: 'cmp-text' }, h('span', { class: 'badge', text: pick.from }), ` "${pick.text}"`),
          h('p', { class: 'field-help', text: `최대 ${MAX}개 목소리로 같은 문장을 읽어서 나란히 들어 볼 수 있어요. 기록에는 남지 않아요.` }),
          grid,
          h('div', { class: 'modal-actions cmp-actions' }, help, h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => done(null) }, '취소'), go));
      },
    });
    if (voices && voices.length) this.run(pick.text, voices);
  },
  async run(text, voices) {
    this.clear();
    this.running = true; this.cancelled = false; this.text = text;
    this.items = voices.map(v => ({ voice: v, status: 'wait', url: null, duration: 0, err: '' }));
    this.render();
    Studio.compareBox.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    for (const it of this.items) {
      if (this.cancelled) { it.status = 'cancel'; continue; }
      it.status = 'run'; it.start = performance.now(); this.render();
      try {
        const r = await Synth.run({ text, voice: it.voice, speed: Studio.speed, kind: 'compare' });
        it.url = r.url; it.duration = r.duration; it.status = 'done';
      } catch (e) {
        if (e.stopped) { it.status = 'cancel'; this.cancelled = true; }
        else { it.status = 'fail'; it.err = friendly(e).msg; }
      }
      this.render();
    }
    this.running = false;
    this.render();
    const ok = this.items.filter(i => i.status === 'done').length;
    if (ok && !this.cancelled) { toast({ type: 'success', title: '비교할 음성을 다 만들었어요', body: `${ok}개 목소리 · ▶로 차례로 들어 보세요` }); srAnnounce('비교할 음성을 다 만들었어요'); }
  },
  cancel() { this.cancelled = true; if (Synth.job && Synth.job.kind === 'compare') Synth.stop(); this.items.forEach(i => { if (i.status === 'wait') i.status = 'cancel'; }); this.render(); },
  clear() {
    this.items.forEach(i => { if (i.url) { Player.release('cmp:' + i.url); URL.revokeObjectURL(i.url); } });
    this.items = []; this.render();
  },
  render() {
    const box = Studio.compareBox;
    if (!box) return;
    box.hidden = !this.items.length;
    clear(box);
    if (!this.items.length) return;
    const head = h('div', { class: 'cmp-head' },
      h('h2', null, ic('i-user-voice'), '목소리 비교'),
      h('span', { class: 'cmp-snip', title: this.text, text: `"${[...this.text].slice(0, 36).join('')}${charLen(this.text) > 36 ? '…' : ''}"` }),
      this.running ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => this.cancel() }, ic('i-stop'), '취소')
        : h('button', { class: 'icon-btn s28', type: 'button', 'aria-label': '비교 닫기', 'data-tip': '닫기', onclick: () => this.clear() }, ic('i-x')));
    const list = h('ul', { class: 'cmp-list', 'aria-live': 'polite' });
    for (const it of this.items) {
      const st = { wait: '대기 중', run: '만드는 중…', done: `${sec1(it.duration)}초`, fail: '실패', cancel: '취소됨' }[it.status];
      list.appendChild(h('li', { class: `cmp-row ${it.status}` },
        it.status === 'done' ? playButton('cmp:' + it.url, it.url, { size: 32, label: `${it.voice} ` }) : h('span', { class: 'cmp-ph', 'aria-hidden': 'true' }, it.status === 'run' ? h('span', { class: 'spinner s16' }) : ic(it.status === 'fail' ? 'i-alert' : 'i-clock')),
        avatar(it.voice, 28),
        h('div', { class: 'cmp-name' }, h('b', { text: it.voice, title: it.voice }), h('span', { class: 'field-help', title: it.err || null, text: it.status === 'fail' ? `실패 · ${it.err}` : st })),
        it.status === 'done' ? h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => { Studio.selectVoice(it.voice); this.render(); toast({ type: 'success', title: `'${it.voice}'${josa(it.voice, '으로로')} 정했어요` }); } }, Studio.currentVoice() === it.voice ? '지금 목소리' : '이 목소리로 정하기') : null));
    }
    box.append(h('section', { class: 'card cmp-card', 'aria-label': '목소리 비교' }, head, list));
  },
};

function welcomeCard({ title = '먼저 내 목소리를 등록해 주세요', small = false, presets = [] }) {
  const mark = $('.brand .logo-mark').cloneNode(true);
  mark.classList.add('logo-breathe');
  mark.setAttribute('width', small ? '48' : '72'); mark.setAttribute('height', small ? '48' : '72');
  const withPresets = presets && presets.length > 0;
  return h('div', { class: 'card welcome' + (small ? ' small' : '') }, mark,
    h('h2', { text: title }),
    h('p', { class: 'lead', text: '화면의 문장을 10초 정도 읽으면, 그다음부터는 어떤 글이든 내 목소리로 읽어 드려요.' }),
    h('a', { class: 'btn btn-primary btn-lg', href: '#/voices/new', style: { textDecoration: 'none' } }, ic('i-mic'), '목소리 등록 시작하기'),
    h('a', { class: 'alt', href: '#/voices/new?mode=upload', text: '이미 녹음 파일이 있어요 →' }),
    withPresets ? h('div', { class: 'welcome-presets' },
      h('div', { class: 'or-line', 'aria-hidden': 'true' }, h('span', { text: '또는' })),
      h('div', { class: 'preset-stack', 'aria-hidden': 'true' }, presets.slice(0, 6).map(v => presetAvatar(v, 36))),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => Studio.startWithPreset() }, ic('i-sparkle'), '기본 제공 목소리로 바로 시작하기'),
      h('p', { class: 'field-help', text: `어린이부터 어르신까지 ${presets.length}가지 · 실제 사람이 아닌 AI로 만든 목소리예요` })) : null,
    h('div', { class: 'steps-preview', 'aria-label': '등록 단계: 문장 읽기, 확인하기, 이름 짓기' },
      h('span', null, h('b', { text: '1' }), '문장 읽기'), h('i', { class: 'line' }),
      h('span', null, h('b', { text: '2' }), '확인하기'), h('i', { class: 'line' }),
      h('span', null, h('b', { text: '3' }), '이름 짓기')),
    h('span', { class: 'privacy-line' }, ic('i-lock'), '녹음은 이 맥에만 저장돼요'));
}

function updateDockToastOffset() {
  const vis = onRoute('studio') && Studio.dock && !Studio.dock.hidden;
  document.body.classList.toggle('dock-visible', !!vis);
}

/* =====================================================================
   12. VOICE LIBRARY
   ===================================================================== */
const TRY_TEXT = '안녕하세요. 이 목소리가 제 목소리처럼 들리나요?';
const tryCache = new Map(); // name → {url, updated}

async function tryVoice(name, btn, onReady) {
  const v = Voices.get(name);
  const cached = tryCache.get(name);
  if (cached && v && cached.updated === v.updated) { onReady(cached.url); return; }
  if (Synth.job) { toast({ type: 'info', title: '다른 음성을 만드는 중이에요', body: '끝난 뒤에 다시 눌러 주세요.' }); return; }
  const restore = btn ? btn.innerHTML : null;
  if (btn) { btn.setAttribute('aria-busy', 'true'); btn.innerHTML = ''; add(btn, [h('span', { class: 'spinner', 'aria-hidden': 'true' }), '만드는 중…']); }
  try {
    const r = await Synth.run({ text: TRY_TEXT, voice: name, speed: 1, kind: 'try' });
    tryCache.set(name, { url: r.url, updated: v ? v.updated : 0 });
    onReady(r.url);
  } catch (e) {
    if (e.stopped) toast({ type: 'info', title: '멈췄어요' });
    else toastError(e, { title: '읽기에 실패했어요' });
  } finally {
    if (btn) { btn.removeAttribute('aria-busy'); btn.innerHTML = restore; }
  }
}

const VoicesPage = Pages.voices = {
  title: '내 목소리', el: null,
  build() {
    this.el = h('section', { class: 'page' });
    this.body = h('div', { class: 'page-body' });
    this.el.append(pageHeader({
      title: '내 목소리', desc: '등록한 목소리를 듣고, 기본 목소리를 정하고, 관리해요',
      actions: h('a', { class: 'btn btn-primary', href: '#/voices/new', style: { textDecoration: 'none' } }, ic('i-plus'), '새 목소리 등록'),
    }), this.body);
    bus.on('voices', () => { if (this.el && !this.el.hidden) this.render(); else this.stale = true; });
    bus.on('job', () => this.updateTryButtons());
    this.render();
  },
  onShow(_, changed) { if (changed) Voices.load(); if (this.stale) { this.stale = false; this.render(); } },
  render() {
    const af = document.activeElement;
    const afCard = af && af.closest && af.closest('.v-card[data-name]');
    let restore = null;
    if (afCard && this.body.contains(afCard)) {
      const sel = af.matches('.top .icon-btn') ? '.top .icon-btn' : af.matches('.try-btn') ? '.try-btn' : af.matches('.actions .btn') ? '.actions .btn' : af.matches('.wave') ? '.wave' : null;
      if (sel) restore = { name: afCard.dataset.name, sel };
    }
    if (this.focusAfter) { restore = this.focusAfter; this.focusAfter = null; }
    this.renderInner();
    if (restore) {
      const el = $(`.v-card[data-name="${CSS.escape(restore.name)}"] ${restore.sel}`, this.body);
      if (el) el.focus({ preventScroll: true });
    }
  },
  renderInner() {
    const b = clear(this.body);
    if (!Voices.loaded) {
      if (Voices.error) { b.appendChild(errorState(() => Voices.load())); return; }
      const g = h('div', { class: 'voice-grid' });
      for (let i = 0; i < 3; i++) g.appendChild(h('div', { class: 'card v-card skeleton', 'aria-hidden': 'true' },
        h('span', { class: 'skel', style: { width: '48px', height: '48px', borderRadius: '50%' } }),
        h('span', { class: 'skel', style: { width: '50%', height: '16px', marginTop: '8px' } }),
        h('span', { class: 'skel', style: { width: '35%', height: '11px' } }),
        h('span', { class: 'skel', style: { width: '100%', height: '28px' } })));
      b.appendChild(g);
      return;
    }
    const mine = Voices.mine, pre = Voices.presets;
    // 내 목소리
    const ms = h('section', { class: 'v-section', 'aria-labelledby': 'vs-mine' },
      h('div', { class: 'v-section-head' }, h('h2', { id: 'vs-mine', text: '내 목소리' }), mine.length ? h('span', { class: 'count', text: `${mine.length}개` }) : null));
    const g = h('div', { class: 'voice-grid' });
    for (const v of mine) g.appendChild(this.card(v));
    g.appendChild(h('a', { class: 'card v-card new-card' + (mine.length ? '' : ' wide'), href: '#/voices/new', style: { textDecoration: 'none' } },
      h('span', { class: 'plus' }, ic(mine.length ? 'i-plus' : 'i-mic', 'ico-20')),
      h('b', { text: mine.length ? '새 목소리 등록' : '아직 등록한 내 목소리가 없어요' }),
      h('span', { text: mine.length ? '10초면 충분해요' : '화면의 문장을 10초 정도 읽으면 내 목소리로 읽어 드려요 · 등록 시작하기 →' })));
    ms.appendChild(g);
    b.appendChild(ms);
    // 기본 제공 목소리
    const ps = h('section', { class: 'v-section', 'aria-labelledby': 'vs-preset' },
      h('div', { class: 'v-section-head' }, h('h2', { id: 'vs-preset', text: '기본 제공 목소리' }), pre.length ? h('span', { class: 'count', text: `${pre.length}개` }) : null),
      h('p', { class: 'v-section-desc' }, ic('i-sparkle'), '실제 사람이 아닌 AI로 만든 목소리예요. 등록 없이 바로 스튜디오에서 쓸 수 있어요.'));
    if (!pre.length) {
      ps.appendChild(h('div', { class: 'card preset-empty' }, h('span', { class: 'spinner s16', 'aria-hidden': 'true' }),
        h('div', null, h('b', { text: '기본 제공 목소리를 준비하고 있어요' }), h('p', { text: '준비가 끝나면 여기에 나타나요. 잠시 후 다시 확인해 주세요.' })),
        h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => Voices.load() }, ic('i-refresh'), '다시 확인')));
    } else {
      const F = [['all', '전체'], ['male', '남성'], ['female', '여성'], ['child', '어린이'], ['student', '학생'], ['adult', '성인'], ['elderly', '어르신']];
      const cur = this.presetFilter || 'all';
      const chips = h('div', { class: 'filter-chips', role: 'radiogroup', 'aria-label': '기본 제공 목소리 필터' });
      const pass = (v, f) => { if (f === 'all') return true; const t = presetTraits(v); return t.gender === f || t.age === f; };
      for (const [id, label] of F) {
        const n = pre.filter(v => pass(v, id)).length;
        if (id !== 'all' && !n) continue;
        chips.appendChild(h('button', { class: 'fchip', type: 'button', role: 'radio', 'aria-checked': String(id === cur), tabindex: id === cur ? '0' : '-1', 'data-f': id,
          onclick: () => { this.presetFilter = id; this.focusAfterFilter = id; this.render(); } }, label, h('span', { class: 'n', text: String(n) })));
      }
      chips.addEventListener('keydown', e => {
        const bs = $$('.fchip', chips); const i = bs.indexOf(document.activeElement);
        if (i < 0) return;
        let j = null;
        if (['ArrowRight', 'ArrowDown'].includes(e.key)) j = (i + 1) % bs.length;
        if (['ArrowLeft', 'ArrowUp'].includes(e.key)) j = (i - 1 + bs.length) % bs.length;
        if (j != null) { e.preventDefault(); bs[j].click(); }
      });
      ps.appendChild(chips);
      const shown = pre.filter(v => pass(v, cur));
      const pg = h('div', { class: 'voice-grid' });
      for (const v of shown) pg.appendChild(this.card(v));
      if (!shown.length) pg.appendChild(h('p', { class: 'field-help', text: '조건에 맞는 목소리가 없어요' }));
      ps.appendChild(pg);
    }
    b.appendChild(ps);
    if (this.focusAfterFilter) { const f = $(`.fchip[data-f="${this.focusAfterFilter}"]`, b); this.focusAfterFilter = null; if (f) f.focus({ preventScroll: true }); }
    this.updateTryButtons();
  },
  card(v) {
    const refKey = 'ref:' + v.name;
    let curKey = refKey, curSrc = sampleUrl(v.name);
    const t = h('span', { class: 't', 'aria-hidden': 'true', text: clock(v.seconds) });
    const wave = new Waveform({ key: refKey, src: curSrc, height: 28, label: `${v.name} 재생 위치`, onTime: (tt, d) => { t.textContent = Player.key === wave.key && tt > 0 ? clock(tt) : clock(d || v.seconds); } });
    const more = h('button', { class: 'icon-btn s36', type: 'button', 'aria-label': `${v.name} 더보기`, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'data-tip': '더보기' }, ic('i-more'));
    const d = new Date(v.updated * 1000);
    const star = ic('i-star-fill');
    const tr = v.preset ? presetTraits(v) : null;
    const card = h('article', { class: 'card v-card' + (v.default ? ' is-default' : '') + (v.preset ? ' is-preset' : ''), 'aria-label': v.preset ? `${v.name}, 기본 제공 AI 목소리` : v.name, 'data-name': v.name },
      h('div', { class: 'top' }, v.preset ? presetAvatar(v, 48) : avatar(v.name, 48), more),
      h('div', { class: 'name-row' }, h('h3', { class: 'name', text: v.name, title: v.name, 'aria-label': v.name }), v.default ? h('span', { class: 'badge badge-default' }, star, '기본') : null),
      v.preset
        ? h('div', { class: 'chips-row' },
            h('span', { class: 'badge badge-preset', 'data-tip': '실제 사람이 아닌 AI로 만든 목소리예요' }, ic('i-sparkle'), '기본 제공'),
            tr.gender ? h('span', { class: 'badge', text: GENDER_LABEL[tr.gender] }) : null,
            tr.age ? h('span', { class: 'badge', text: AGE_LABEL[tr.age] }) : null)
        : h('div', { class: 'meta', text: `참조 ${sec1(v.seconds)}초 · ${d.getMonth() + 1}월 ${d.getDate()}일` }),
      h('div', { class: 'wave-line' }, wave.root, t),
      h('p', { class: 'transcript', title: v.transcript, text: `"${v.transcript}"` }));
    const refBtn = h('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, ic('i-play'), h('span', { text: '원본 듣기' }));
    refBtn.addEventListener('click', () => { curKey = refKey; curSrc = sampleUrl(v.name); wave.setSource(curKey, curSrc); Player.toggle(curKey, curSrc); });
    const tryBtn = h('button', { class: 'btn btn-ghost btn-sm try-btn', type: 'button' }, ic('i-sparkle'), h('span', { text: '들어보기' }));
    tryBtn.addEventListener('click', () => {
      const key = 'try:' + v.name;
      if (curKey === key && Player.key === key) { Player.toggle(key, curSrc); return; }
      tryVoice(v.name, tryBtn, url => { curKey = key; curSrc = url; wave.setSource(key, url); Player.play(key, url, 0).catch(() => {}); });
    });
    Player.bind(card, () => {
      const refOn = Player.playing(refKey), tryOn = Player.playing('try:' + v.name);
      setIc($('svg', refBtn), refOn ? 'i-pause' : 'i-play');
      $('span', refBtn).textContent = refOn ? '일시정지' : '원본 듣기';
      if (!tryBtn.hasAttribute('aria-busy')) { setIc($('svg', tryBtn), tryOn ? 'i-pause' : 'i-sparkle'); $('span', tryBtn).textContent = tryOn ? '일시정지' : '들어보기'; }
    });
    card.appendChild(h('div', { class: 'actions' }, refBtn, tryBtn));
    more.addEventListener('click', () => openMenu(more, [
      v.default ? null : { label: '기본 목소리로 설정', icon: 'i-star', fn: () => this.makeDefault(v.name) },
      { label: '스튜디오에서 쓰기', icon: 'i-wave', fn: () => { Studio.selectVoice(v.name); Router.navigate('#/studio'); }, noRestore: true },
      v.preset ? null : { label: '다시 녹음하기', icon: 'i-refresh', fn: () => Router.navigate('#/voices/new?replace=' + encodeURIComponent(v.name)), noRestore: true },
      v.preset ? null : '-',
      v.preset ? null : { label: '삭제', icon: 'i-trash', danger: true, fn: () => this.remove(v.name, card) },
    ], { label: `${v.name} 메뉴` }));
    return card;
  },
  updateTryButtons() {
    if (!this.body) return;
    $$('.try-btn', this.body).forEach(b => { if (!b.hasAttribute('aria-busy')) setDisabled(b, !!Synth.job || Status.offline, Synth.job ? '다른 음성을 만드는 중이에요' : '앱에 연결할 수 없어요'); });
  },
  async makeDefault(name) {
    const prev = Voices.list.map(v => ({ ...v }));
    Voices.list.forEach(v => { v.default = v.name === name; });
    this.focusAfter = { name, sel: '.top .icon-btn' };
    this.render();
    const s = $(`.v-card[data-name="${CSS.escape(name)}"] .badge svg`, this.body);
    if (s && !reducedMotion()) s.classList.add('star-pop');
    bus.emit('voices');
    try {
      await api(vpath(name) + '/default', { method: 'POST' });
      toast({ type: 'success', title: `'${name}'${josa(name, '을를')} 기본 목소리로 정했어요` });
    } catch (e) {
      Voices.list = prev; bus.emit('voices');
      toastError(e);
    }
  },
  async remove(name, card) {
    const v = Voices.get(name);
    if (v && v.preset) { toast({ type: 'info', title: '기본 제공 목소리는 삭제할 수 없어요' }); return; }
    const rest = Voices.list.filter(x => x.name !== name).map(x => x.name);
    const next = rest.includes('기본') ? '기본' : rest[0];
    const body = h('div', null, h('p', { text: '참조 녹음이 이 맥에서 삭제되고 되돌릴 수 없어요. 이 목소리로 만든 기록은 그대로 남아요.' }));
    if (v && v.default) body.appendChild(h('p', { class: 'warn' }, ic('i-alert'), h('span', { text: next ? `기본 목소리예요. 삭제하면 '${next}'${josa(next, '이가')} 기본이 돼요.` : '삭제하면 등록된 목소리가 없어요.' })));
    const ok = await modal({
      title: `'${name}' 목소리를 삭제할까요?`, body,
      actions: [{ label: '취소', kind: 'secondary', value: false, initial: true }, { label: '삭제', kind: 'danger', value: true }],
    });
    if (!ok) return;
    try {
      await api(vpath(name), { method: 'DELETE' });
      Player.release('ref:' + name); Player.release('try:' + name);
      Peaks.drop(sampleUrl(name)); tryCache.delete(name);
      if (card) { card.classList.add('removing'); await sleep(reducedMotion() ? 0 : 200); }
      toast({ type: 'success', title: `'${name}' 목소리를 삭제했어요` });
      await Voices.load();
    } catch (e) { toastError(e); }
  },
};

function errorState(retry) {
  return h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, ic('i-alert')),
    h('h2', { text: '불러오지 못했어요' }), h('p', { text: NET_MSG }),
    h('button', { class: 'btn btn-secondary', type: 'button', onclick: retry }, ic('i-refresh'), '다시 시도'));
}

/* =====================================================================
   13. VOICE WIZARD (#/voices/new)
   ===================================================================== */
const NAME_RE = /^[0-9A-Za-z가-힣 _-]{1,40}$/;
const NAME_MSG = '완성된 한글·영문·숫자·공백·_·-만 쓸 수 있어요.';
const cleanName = v => String(v || '').normalize('NFC').trim();
const AUDIO_EXT = /\.(wav|wave|m4a|mp3|aac|aif|aiff|caf|flac|ogg|oga|opus|webm|mp4|mov|3gp|amr|wma)$/i;

const Wizard = Pages['voices/new'] = {
  title: '새 목소리 등록', el: null, W: null, prompts: [],
  build() {
    this.cancelBtn = h('a', { class: 'btn btn-ghost', href: '#/voices', style: { textDecoration: 'none' } }, '취소');
    const back = h('a', { class: 'btn btn-ghost btn-sm back-btn', href: '#/voices', style: { textDecoration: 'none' } }, ic('i-arrow-left'), '내 목소리');
    this.el = h('section', { class: 'page' });
    this.stepper = h('ol', { class: 'stepper', 'aria-label': '등록 단계' });
    this.card = h('div', { class: 'card wiz-card' });
    this.el.append(pageHeader({ title: '새 목소리 등록', before: back, actions: this.cancelBtn }),
      h('div', { class: 'page-body' }, h('div', { class: 'wizard' }, this.stepper, this.card)));
    bus.on('status', () => { if (this.W && !this.el.hidden) this.updateButtons(); });
    bus.on('tick', () => this.onTick());
  },
  async onShow(params, changed) {
    if (!changed && this.W && this.W.params === location.hash) return;
    this.reset(params);
    if (!this.prompts.length) {
      try { this.prompts = await api('/api/prompts'); } catch { this.prompts = []; }
      if (!this.W.prompt) { this.W.prompt = this.randomPrompt(); if (this.W.step === 2) this.render(); }
    }
  },
  onHide() { this.stopMic(); Player.stop(); },
  reset(params = {}) {
    if (this.W) this.cleanup();
    this.lastStepKey = null;
    const replace = params.replace || null;
    this.W = {
      params: location.hash, step: 1, dir: 1, mode: params.mode === 'upload' ? 'upload' : 'mic', replace,
      prompt: this.prompts.length ? this.randomPrompt() : '', promptEditing: false,
      blob: null, url: null, fileName: '', fileSize: 0, duration: null, source: null, fileError: null,
      transcript: '', transcriptTouched: false, asr: null, asrFlash: false, asrDone: false, asrError: null,
      name: replace || (Voices.mine.length ? `내 목소리 ${Voices.mine.length + 1}` : (Voices.get('기본') ? '내 목소리' : '기본')),
      makeDefault: false, registering: false, regError: null, result: null,
      recState: 'idle', micError: null, levels: new Array(24).fill(-90), recElapsed: 0, quietMs: 0, clipMs: 0, autoStopped: false, hint: null,
      reviewEditing: false,
    };
    this.render();
  },
  cleanup() {
    this.stopMic();
    const W = this.W;
    if (W && W.url) { Player.release('wiz:rec'); Peaks.drop(W.url); URL.revokeObjectURL(W.url); }
  },
  randomPrompt(exclude) {
    const list = this.prompts.filter(p => p !== exclude);
    return list.length ? list[Math.floor(Math.random() * list.length)] : (exclude || '오늘은 날씨가 참 좋네요. 점심을 먹고 공원에서 천천히 산책을 했습니다.');
  },
  hasWork() {
    const W = this.W;
    return W && W.step < 4 && (W.blob || (W.mode === 'upload' && W.transcript.trim()) || W.recState === 'recording');
  },
  async canLeave(nextKey) {
    const W = this.W;
    if (!W) return true;
    if (W.registering) return false;
    if (W.recState === 'recording') {
      const ok = await confirmModal({ title: '녹음을 그만할까요?', body: '녹음한 내용은 저장되지 않아요.', ok: '그만하기', danger: true });
      if (!ok) return false;
      this.cleanup(); this.W = null; return true;
    }
    if (this.hasWork()) {
      const ok = await confirmModal({ title: '등록을 그만할까요?', body: W.mode === 'upload' ? '올린 파일과 입력한 문장은 저장되지 않아요.' : '녹음한 내용은 저장되지 않아요.', ok: '그만하기', danger: true });
      if (!ok) return false;
    }
    this.cleanup(); this.W = null;
    return true;
  },
  goStep(n) {
    const W = this.W;
    if (W.step === 2 && n !== 2) this.stopMic();
    W.dir = n >= W.step ? 1 : -1;
    W.step = n;
    W.regError = null;
    this.render(true);
  },
  renderStepper() {
    const W = this.W;
    const labels = ['준비', '녹음', '확인', '완료'];
    clear(this.stepper);
    labels.forEach((l, i) => {
      const n = i + 1;
      const done = n < W.step || W.step === 4;
      const cur = n === W.step && W.step !== 4;
      const li = h('li', { class: done ? 'done' : '', 'aria-current': cur ? 'step' : null },
        h('span', { class: 'n', 'aria-hidden': 'true' }, done ? ic('i-check') : String(n)),
        h('span', { class: 'lbl' }, h('span', { class: 'sr-only', text: `${n}단계 ` }), l, done ? h('span', { class: 'sr-only', text: ' (완료)' }) : null));
      this.stepper.appendChild(li);
      if (i < 3) this.stepper.appendChild(h('li', { class: 'line' + (n < W.step ? ' done' : ''), 'aria-hidden': 'true' }));
    });
  },
  render(focus) {
    const W = this.W;
    if (!W) return;
    this.renderStepper();
    clear(this.card);
    this.card.removeAttribute('aria-busy');
    const stepKey = `${W.step}:${W.step === 2 ? W.mode : ''}`;
    const animate = this.lastStepKey !== stepKey;
    this.lastStepKey = stepKey;
    const step = h('div', { class: 'wiz-step' + (W.dir < 0 ? ' back' : '') + (animate ? '' : ' still') });
    if (this.cancelBtn) this.cancelBtn.textContent = W.step === 4 ? '닫기' : '취소';
    if (W.step === 1) this.step1(step);
    else if (W.step === 2) (W.mode === 'mic' ? this.step2mic(step) : this.step2upload(step));
    else if (W.step === 3) this.step3(step);
    else this.step4(step);
    this.card.appendChild(step);
    this.updateButtons();
    if (focus) { const h2 = $('h2', step); if (h2) { h2.tabIndex = -1; h2.focus({ preventScroll: true }); } $('#main').scrollTop = 0; }
  },
  updateButtons() {
    const W = this.W;
    if (!W) return;
    const next = $('[data-act="next"]', this.card);
    if (next) {
      const r = this.nextReason();
      setDisabled(next, !!r, r);
    }
    const reg = $('[data-act="register"]', this.card);
    if (reg && !W.registering) { const r = this.registerReason(); setDisabled(reg, !!r, r); }
  },

  /* ---- step 1 ---- */
  step1(el) {
    const W = this.W;
    const modeCard = (mode, icon, title, sub, rec) => {
      const c = h('button', { class: 'mode-card', type: 'button', role: 'radio', 'aria-checked': String(W.mode === mode), tabindex: W.mode === mode ? '0' : '-1' },
        h('span', { class: 'radio-dot', 'aria-hidden': 'true' }),
        h('span', null, h('b', null, ic(icon, 'ico-16'), title, rec ? h('span', { class: 'badge badge-default', text: '추천' }) : null), h('span', { text: sub })));
      c.addEventListener('click', () => { W.mode = mode; this.render(); $(`.mode-card[aria-checked="true"]`, this.card).focus(); });
      return c;
    };
    const group = h('div', { class: 'mode-cards', role: 'radiogroup', 'aria-labelledby': 'mode-title' },
      modeCard('mic', 'i-mic', '마이크로 녹음하기', '지금 바로 문장을 읽어요', true),
      modeCard('upload', 'i-upload', '파일 올리기', '이미 녹음해 둔 음성이 있어요'));
    group.addEventListener('keydown', e => {
      if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
        e.preventDefault(); W.mode = W.mode === 'mic' ? 'upload' : 'mic'; this.render(); $(`.mode-card[aria-checked="true"]`, this.card).focus();
      }
    });
    add(el, [
      h('h2', { text: W.replace ? `'${W.replace}' 다시 녹음하기` : '좋은 녹음을 위한 세 가지' }),
      W.replace ? h('p', { class: 'field-help', style: { marginTop: '6px', fontSize: 'var(--fs-14)' }, text: '좋은 녹음을 위한 세 가지를 확인해 주세요. 등록하면 기존 녹음이 새 녹음으로 바뀌어요.' }) : null,
      h('ul', { class: 'tips' },
        h('li', null, h('span', { class: 't-ico' }, ic('i-volume-off')), h('div', null, h('b', { text: '조용한 곳에서' }), h('span', { text: '에어컨·음악 소리가 없을수록 좋아요' }))),
        h('li', null, h('span', { class: 't-ico' }, ic('i-message')), h('div', null, h('b', { text: '평소 말투로 또박또박' }), h('span', { text: '연기하지 말고, 평소 대화하듯 읽어 주세요' }))),
        h('li', null, h('span', { class: 't-ico' }, ic('i-timer')), h('div', null, h('b', { text: '5~9초 분량' }), h('span', { text: '화면의 문장 하나면 충분해요' })))),
      h('p', { class: 'mode-title', id: 'mode-title', text: '어떻게 등록할까요?' }),
      group,
      h('div', { class: 'wiz-foot' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.goStep(2) }, '다음', ic('i-arrow-right'))),
    ]);
  },

  /* ---- step 2 (mic) ---- */
  step2mic(el) {
    const W = this.W;
    if (!W.prompt) W.prompt = this.randomPrompt();
    const shuffle = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-act': 'shuffle', onclick: () => this.shufflePrompt() }, ic('i-shuffle'), '다른 문장');
    if (W.recState === 'recording') setDisabled(shuffle, true, '녹음 중에는 바꿀 수 없어요');
    el.appendChild(h('div', { class: 'wiz-head' }, h('h2', { text: '이 문장을 읽어 주세요' }), shuffle));
    if (W.promptEditing) {
      const ta = h('textarea', { class: 'textarea', 'aria-label': '읽을 문장 직접 수정', value: W.prompt });
      const done = () => { const v = ta.value.replace(/\s+/g, ' ').trim(); if (v) W.prompt = v; W.promptEditing = false; if (W.blob) W.transcript = W.prompt; this.render(); };
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(); } if (e.key === 'Escape') { e.stopPropagation(); W.promptEditing = false; this.render(); } });
      el.appendChild(h('div', { class: 'prompt-edit' }, ta, h('div', { class: 'row' }, h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: done }, ic('i-check'), '완료'))));
      setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
    } else {
      this.promptBox = h('div', { class: 'prompt-box', text: W.prompt });
      el.appendChild(this.promptBox);
      el.appendChild(h('p', { class: 'match-note' }, '읽은 내용과 이 문장이 정확히 같아야 해요. 문장을 고쳐 읽었다면 ',
        h('button', { class: 'btn btn-link', type: 'button', onclick: () => { W.promptEditing = true; this.render(); } }, '직접 수정')));
    }
    if (W.micError) { el.appendChild(this.micErrorPanel(W.micError)); }
    else el.appendChild(this.recZone());
    el.appendChild(h('div', { class: 'wiz-foot' },
      h('button', { class: 'btn btn-ghost left', type: 'button', onclick: () => this.goStep(1) }, ic('i-arrow-left'), '이전'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-act': 'next', onclick: () => { W.transcript = W.prompt; this.goStep(3); } }, '다음', ic('i-arrow-right'))));
  },
  micErrorPanel(name) {
    const W = this.W;
    const map = {
      NotAllowedError: ['마이크를 쓸 수 없어요', "브라우저에서 마이크 권한이 꺼져 있어요. 주소창 왼쪽의 자물쇠(또는 설정) 아이콘 → 마이크 → 허용으로 바꾼 뒤 다시 시도해 주세요. macOS '시스템 설정 → 개인정보 보호 및 보안 → 마이크'에서도 이 브라우저가 켜져 있어야 해요.", true, true],
      NotFoundError: ['마이크를 찾지 못했어요', '연결된 마이크가 없어요. 이어폰이나 외장 마이크를 연결한 뒤 다시 시도해 주세요.', true, true],
      NotReadableError: ['마이크가 사용 중이에요', '다른 앱(화상회의 등)이 마이크를 쓰고 있을 수 있어요. 그 앱을 닫고 다시 시도해 주세요.', true, false],
      unsupported: ['이 브라우저에선 녹음할 수 없어요', '최신 Chrome이나 Safari를 써 주세요. 또는 녹음 파일을 올려 주세요.', false, true],
    };
    const [t, b, retry, upload] = map[name] || map.NotReadableError;
    return h('div', { class: 'err-panel', role: 'alert' },
      h('div', { class: 'e-ico' }, ic('i-mic-off')), h('h3', { text: t }), h('p', { text: b }),
      h('div', { class: 'row' },
        retry ? h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { W.micError = null; this.render(); this.toggleRec(); } }, ic('i-refresh'), '다시 시도') : null,
        upload ? h('button', { class: upload && !retry ? 'btn btn-primary' : 'btn btn-ghost', type: 'button', onclick: () => { W.micError = null; W.mode = 'upload'; this.render(true); } }, ic('i-upload'), '파일 올리기로 바꾸기') : null));
  },
  shufflePrompt() {
    const W = this.W;
    if (W.recState === 'recording') return;
    const box = this.promptBox;
    const nextP = this.randomPrompt(W.prompt);
    if (box && !reducedMotion()) {
      box.classList.add('fade');
      setTimeout(() => { W.prompt = nextP; box.textContent = nextP; box.classList.remove('fade'); }, 180);
    } else { W.prompt = nextP; if (box) box.textContent = nextP; }
    if (W.blob) { this.discardRecording(); this.render(); }
  },
  recZone() {
    const W = this.W;
    const z = h('div', { class: 'rec-zone' });
    this.timerEl = h('div', { class: 'rec-timer' + (W.recState === 'recording' ? ' live' : ''), 'aria-hidden': 'true', text: clock(W.recState === 'recorded' ? W.duration : W.recElapsed) });
    this.meterEl = h('div', { class: 'meter', 'aria-hidden': 'true' });
    for (let i = 0; i < 24; i++) this.meterEl.appendChild(h('i'));
    // target bar
    const pct = s => (Math.min(12, s) / 12) * 100;
    const segs = [[0, 3, 'bad'], [3, 5, 'mid'], [5, 9, 'good'], [9, 10, 'mid'], [10, 12, 'bad']];
    this.markerEl = h('span', { class: 'target-marker' });
    const bar = h('div', { class: 'target-bar', 'aria-hidden': 'true' },
      segs.map(([a, b, c]) => h('span', { class: 'seg ' + c, style: { width: pct(b - a) + '%' } }, c === 'good' ? h('span', { class: 'good-label', text: '좋아요' }) : null)),
      this.markerEl);
    const ticks = h('div', { class: 'target-ticks', 'aria-hidden': 'true' }, [0, 3, 5, 9, 10, 12].map(s => h('span', { style: { left: pct(s) + '%' }, text: s === 12 ? '12초' : String(s) })));
    const target = h('div', { class: 'target' }, bar, ticks);

    const btn = h('button', { class: 'rec-btn' + (W.recState === 'recording' ? ' recording' : ''), type: 'button', 'data-act': 'rec', 'aria-label': W.recState === 'recording' ? '녹음 멈추기' : '녹음 시작' });
    this.haloEl = h('span', { class: 'halo', 'aria-hidden': 'true' });
    if (W.recState === 'requesting') btn.append(h('span', { class: 'spinner' }));
    else btn.append(this.haloEl, h('span', { class: 'dot', 'aria-hidden': 'true' }));
    btn.addEventListener('click', () => this.toggleRec());
    if (W.recState === 'requesting') setDisabled(btn, true);
    const label = h('div', { class: 'rec-label', 'aria-hidden': 'true', text: W.recState === 'requesting' ? '마이크 권한을 기다리고 있어요…' : W.recState === 'recording' ? '녹음 멈추기' : (W.recState === 'recorded' ? '다시 녹음하려면 누르세요' : '녹음 시작') });
    const hint = h('div', { class: 'rec-hint' }, h('span', { class: 'kbd', text: 'Space' }), '또는 버튼으로 시작·정지');
    this.hintEl = h('div', { class: 'inline-hint', role: 'status', hidden: !W.hint }, ic('i-alert'), h('span', { text: W.hint || '' }));
    this.judgeEl = h('div', { 'aria-live': 'polite', style: { width: '100%' } });
    add(z, [this.timerEl, this.meterEl, target]);
    if (W.recState === 'recorded' && W.blob) {
      const listen = playButton('wiz:rec', () => W.url, { size: 36, cls: 'btn btn-secondary', label: '' });
      listen.classList.remove('s36'); listen.style.width = 'auto';
      // make it a labelled button
      const lbl = h('span', { text: '들어보기' }); listen.appendChild(lbl);
      Player.bind(listen, () => { lbl.textContent = Player.playing('wiz:rec') ? '일시정지' : '들어보기'; });
      const redo = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { this.discardRecording(); this.render(); this.toggleRec(); } }, ic('i-refresh'), '다시 녹음');
      add(z, [h('div', { class: 'rec-actions' }, listen, redo), this.judgeEl]);
      this.renderJudge();
    } else {
      add(z, [btn, label, hint, this.hintEl, this.judgeEl]);
      if (W.autoStopped) this.judgeEl.appendChild(h('div', { class: 'judge info' }, ic('i-info'), '15초가 지나 자동으로 멈췄어요.'));
    }
    this.updateTarget();
    this.drawMeter();
    return z;
  },
  judge(d, isFile) {
    if (d == null) return { kind: 'info', msg: '길이를 확인하지 못했어요. 등록할 때 확인해요.', ok: true };
    if (d < 3) return { kind: 'error', msg: `너무 짧아요 (${sec1(d)}초). 문장을 끝까지 읽어 주세요.`, ok: false };
    if (d < 5) return { kind: 'warn', msg: '조금 짧아요. 5~9초면 더 비슷한 목소리가 나와요.', ok: true };
    if (d < 10) return { kind: 'ok', msg: '좋아요! 길이가 딱 알맞아요.', ok: true };
    if (isFile && d > 12) return { kind: 'error', msg: `파일이 ${sec1(d)}초예요. 3~10초 구간만 잘라서 올려 주세요.`, ok: false };
    return { kind: 'warn', msg: '조금 길어요. 앞뒤 조용한 부분은 자동으로 잘라내지만, 10초가 넘으면 등록이 안 될 수 있어요.', ok: true };
  },
  renderJudge() {
    const W = this.W;
    if (!this.judgeEl) return;
    clear(this.judgeEl);
    if (!W.blob) return;
    const j = this.judge(W.duration, W.source === 'file');
    const icon = { error: 'i-alert', warn: 'i-alert', ok: 'i-check-circle', info: 'i-info' }[j.kind];
    if (W.autoStopped) this.judgeEl.appendChild(h('div', { class: 'judge info', style: { marginBottom: '8px' } }, ic('i-info'), '15초가 지나 자동으로 멈췄어요.'));
    this.judgeEl.appendChild(h('div', { class: 'judge ' + j.kind }, ic(icon), h('span', { text: j.msg })));
  },
  updateTarget() {
    const W = this.W;
    if (!this.markerEl) return;
    const d = W.recState === 'recording' ? W.recElapsed : (W.blob && W.duration != null ? W.duration : 0);
    this.markerEl.style.left = (Math.min(12, d) / 12 * 100) + '%';
    this.markerEl.className = 'target-marker';
    if (W.recState !== 'recording' && W.blob) {
      const j = this.judge(W.duration, W.source === 'file');
      this.markerEl.classList.add(j.kind === 'error' ? 'err' : j.kind === 'ok' ? 'ok' : 'x');
    }
  },
  drawMeter() {
    const W = this.W;
    if (!this.meterEl || !W) return;
    const bars = this.meterEl.children;
    for (let i = 0; i < 24; i++) {
      const db = W.levels[i];
      const hgt = Math.max(2, Math.min(32, ((db + 60) / 60) * 32));
      bars[i].style.height = hgt + 'px';
      bars[i].style.background = db > -3 ? 'var(--meter-hot)' : db >= -45 ? 'var(--meter-ok)' : 'var(--meter-low)';
    }
  },
  async ensureMic() {
    const W = this.W;
    if (this.stream) return true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { W.micError = 'unsupported'; this.render(); return false; }
    W.recState = 'requesting'; this.render();
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    } catch (e) {
      if (this.W !== W) return false;
      W.recState = 'idle';
      W.micError = ['NotAllowedError', 'NotFoundError', 'NotReadableError'].includes(e.name) ? e.name : (e.name === 'SecurityError' ? 'NotAllowedError' : (e.name === 'OverconstrainedError' ? 'NotFoundError' : 'NotReadableError'));
      this.render();
      return false;
    }
    if (this.W !== W || !onRoute('voices/new')) { this.stopMic(); return false; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.actx = new C();
      const src = this.actx.createMediaStreamSource(this.stream);
      this.analyser = this.actx.createAnalyser();
      this.analyser.fftSize = 1024;
      src.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
      this.meterLoop();
    } catch {}
    W.recState = 'idle';
    return true;
  },
  meterLoop() {
    cancelAnimationFrame(this.meterRaf);
    let last = performance.now(), halo = 1;
    const step = now => {
      const W = this.W;
      if (!this.analyser || !W) return;
      const dt = now - last; last = now;
      this.analyser.getFloatTimeDomainData(this.buf);
      let sum = 0, peak = 0;
      for (let i = 0; i < this.buf.length; i++) { const v = this.buf[i]; sum += v * v; const a = v < 0 ? -v : v; if (a > peak) peak = a; }
      const rms = Math.sqrt(sum / this.buf.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -90;
      const pdb = peak > 0 ? 20 * Math.log10(peak) : -90;
      this.frameAcc = (this.frameAcc || 0) + dt;
      if (this.frameAcc > 70) { this.frameAcc = 0; W.levels.push(pdb > -3 ? pdb : db); W.levels.shift(); this.drawMeter(); }
      if (W.recState === 'recording') {
        W.recElapsed = (now - this.recStart) / 1000;
        if (this.timerEl) this.timerEl.textContent = clock(W.recElapsed);
        this.updateTarget();
        W.quietMs = db < -50 ? W.quietMs + dt : 0;
        if (pdb > -3) W.clipMs += dt;
        const hint = W.clipMs > 500 ? '소리가 너무 커요. 마이크에서 조금 떨어져 주세요.' : (W.quietMs > 2000 ? '소리가 거의 들리지 않아요. 마이크에 조금 더 가까이 말해 주세요.' : null);
        if (hint !== W.hint) { W.hint = hint; if (this.hintEl) { this.hintEl.hidden = !hint; $('span', this.hintEl).textContent = hint || ''; } }
        const target = 1 + Math.max(0, Math.min(1, (db + 50) / 44)) * (10 / 36);
        halo += (target - halo) * .3;
        if (this.haloEl) this.haloEl.style.transform = `scale(${halo})`;
        if (W.recElapsed >= 15) { W.autoStopped = true; this.stopRec(); }
      }
      this.meterRaf = requestAnimationFrame(step);
    };
    this.meterRaf = requestAnimationFrame(step);
  },
  pickMime() {
    const cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/ogg;codecs=opus'];
    for (const m of cands) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch {} }
    return '';
  },
  async toggleRec() {
    const W = this.W;
    if (!W || W.mode !== 'mic' || W.step !== 2) return;
    if (W.recState === 'recording') { this.stopRec(); return; }
    if (W.recState === 'requesting') return;
    Player.stop();
    if (!(await this.ensureMic())) return;
    if (this.W !== W) return;
    if (W.blob) this.discardRecording();
    const mime = this.pickMime();
    let rec;
    try { rec = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined); }
    catch { W.micError = 'unsupported'; this.render(); return; }
    this.chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
    rec.onstop = () => {
      if (this.W !== W) return;
      const type = rec.mimeType || mime || (this.chunks[0] && this.chunks[0].type) || 'audio/webm';
      const blob = new Blob(this.chunks, { type });
      const ext = /mp4|m4a|aac/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm';
      W.blob = blob; W.url = URL.createObjectURL(blob); W.fileName = 'recording.' + ext; W.fileSize = blob.size; W.source = 'mic';
      W.transcript = W.prompt;
      W.recState = 'recorded';
      this.render();
      const j = this.judge(W.duration, false);
      srAnnounce(j.msg);
    };
    this.recorder = rec;
    W.autoStopped = false; W.quietMs = 0; W.clipMs = 0; W.hint = null; W.recElapsed = 0;
    rec.start(100);
    this.recStart = performance.now();
    W.recState = 'recording';
    this.render();
    const btn = $('[data-act="rec"]', this.card); if (btn) btn.focus({ preventScroll: true });
  },
  stopRec() {
    const W = this.W;
    if (!this.recorder || W.recState !== 'recording') return;
    W.duration = (performance.now() - this.recStart) / 1000;
    W.recState = 'stopping';
    try { this.recorder.stop(); } catch {}
    this.recorder = null;
    if (this.haloEl) this.haloEl.style.transform = 'scale(1)';
  },
  discardRecording() {
    const W = this.W;
    if (W.url) { Player.release('wiz:rec'); Peaks.drop(W.url); URL.revokeObjectURL(W.url); }
    W.blob = null; W.url = null; W.duration = null; W.fileName = ''; W.fileSize = 0; W.recState = 'idle'; W.autoStopped = false; W.fileError = null;
  },
  stopMic() {
    cancelAnimationFrame(this.meterRaf);
    if (this.recorder) { try { this.recorder.onstop = null; this.recorder.stop(); } catch {} this.recorder = null; if (this.W && this.W.recState === 'recording') this.W.recState = 'idle'; }
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
    if (this.actx) { try { this.actx.close(); } catch {} this.actx = null; }
    this.analyser = null;
  },

  /* ---- step 2 (upload) ---- */
  step2upload(el) {
    const W = this.W;
    el.appendChild(h('h2', { text: '음성 파일을 올려 주세요' }));
    const input = h('input', { type: 'file', accept: 'audio/*,.m4a,.wav,.mp3,.aiff,.aif,.caf,.flac,.ogg,.webm', hidden: true, id: 'wiz-file' });
    input.addEventListener('change', () => { if (input.files[0]) this.takeFile(input.files[0]); input.value = ''; });
    el.appendChild(input);
    if (!W.blob) {
      const dz = h('div', { class: 'dropzone' + (W.fileError ? ' error' : ''), role: 'button', tabindex: '0', 'aria-label': '음성 파일 선택 — 여기로 끌어다 놓거나 Enter를 누르세요', 'aria-describedby': W.fileError ? 'dz-err' : null },
        h('span', { class: 'dz-ico' }, ic('i-upload', 'ico-20')),
        h('b', { text: '음성 파일을 여기로 끌어다 놓으세요' }),
        h('span', { class: 'or' }, '또는 ', h('span', { class: 'btn-link', style: { fontWeight: 600 } }, '파일 선택')),
        h('span', { class: 'formats', text: 'WAV, M4A, MP3 등 · 3~10초 · 30MB 이하' }));
      dz.addEventListener('click', () => input.click());
      dz.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag'); });
      dz.addEventListener('dragenter', e => { e.preventDefault(); dz.classList.add('drag'); });
      dz.addEventListener('dragleave', e => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag'); });
      dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) this.takeFile(f); });
      el.appendChild(dz);
      if (W.fileError) el.appendChild(h('p', { class: 'field-msg error', id: 'dz-err', role: 'alert', style: { marginTop: '8px' } }, ic('i-alert'), h('span', { text: W.fileError })));
    } else {
      const t = h('span', { class: 't', 'aria-hidden': 'true' });
      const wave = new Waveform({ key: 'wiz:rec', src: W.url, height: 28, label: '올린 파일 재생 위치', onTime: (tt, d) => { t.textContent = clock(tt || d); } });
      const fmtSize = W.fileSize > 1048576 ? (W.fileSize / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(W.fileSize / 1024)) + 'KB';
      el.appendChild(h('div', { class: 'file-card' },
        h('div', { class: 'row' }, h('span', { class: 'f-ico' }, ic('i-file-audio')),
          h('div', { class: 'f-text' }, h('div', { class: 'f-name', text: W.fileName }), h('div', { class: 'f-meta', text: `${fmtSize}${W.duration != null ? ` · ${sec1(W.duration)}초` : ''}` })),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => input.click() }, '교체'),
          h('button', { class: 'icon-btn s32', type: 'button', 'aria-label': '파일 삭제', 'data-tip': '삭제', onclick: () => { this.discardRecording(); this.render(); } }, ic('i-x'))),
        h('div', { class: 'wave-row' }, playButton('wiz:rec', () => W.url, { size: 32, label: '올린 파일 ' }), wave.root, t)));
      this.judgeEl = h('div', { 'aria-live': 'polite', style: { marginTop: '12px' } });
      el.appendChild(this.judgeEl);
      this.renderJudge();
    }
    el.appendChild(this.transcriptField());
    el.appendChild(h('div', { class: 'wiz-foot' },
      h('button', { class: 'btn btn-ghost left', type: 'button', onclick: () => this.goStep(1) }, ic('i-arrow-left'), '이전'),
      h('button', { class: 'btn btn-primary', type: 'button', 'data-act': 'next', onclick: () => this.goStep(3) }, '다음', ic('i-arrow-right'))));
  },
  async takeFile(f) {
    const W = this.W;
    W.fileError = null;
    const isAudio = (f.type && /^audio\//.test(f.type)) || AUDIO_EXT.test(f.name) || (f.type === 'video/mp4' || f.type === 'video/quicktime');
    if (!isAudio) { W.fileError = '오디오 파일만 올릴 수 있어요.'; this.discardRecording(); W.fileError = '오디오 파일만 올릴 수 있어요.'; this.render(); return; }
    if (f.size > 30 * 1024 * 1024) { this.discardRecording(); W.fileError = '파일이 너무 커요(30MB 이하). 짧게 잘라서 올려 주세요.'; this.render(); return; }
    this.discardRecording();
    W.blob = f; W.url = URL.createObjectURL(f); W.fileName = f.name; W.fileSize = f.size; W.source = 'file'; W.duration = null;
    W.asrDone = false;
    this.render();
    let d = null;
    try { d = (await Peaks.get(W.url)).duration; } catch {
      d = await new Promise(res => {
        const a = new Audio(); a.preload = 'metadata';
        const done = v => { a.removeAttribute('src'); res(v); };
        a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : null);
        a.onerror = () => done(null);
        a.src = W.url;
        setTimeout(() => done(null), 4000);
      });
    }
    if (this.W !== W || W.blob !== f) return;
    W.duration = d;
    this.render();
    srAnnounce(this.judge(d, true).msg);
  },
  transcriptField() {
    const W = this.W;
    const ta = h('textarea', { class: 'textarea', id: 'wiz-transcript', rows: '3', placeholder: '녹음에서 말한 문장을 그대로 적어 주세요', 'aria-describedby': 'wiz-tr-help wiz-tr-msg', value: W.transcript });
    if (W.asrFlash) { ta.classList.add('flash'); W.asrFlash = false; }
    if (W.asrError) ta.setAttribute('aria-invalid', 'true');
    ta.addEventListener('input', () => { W.transcript = ta.value; W.transcriptTouched = true; if (W.asrError) { W.asrError = null; ta.removeAttribute('aria-invalid'); const m = $('#wiz-tr-msg'); if (m) clear(m); } this.updateButtons(); });
    const running = !!W.asr;
    const asrBtn = h('button', { class: 'btn btn-secondary btn-sm', type: 'button', 'data-act': 'asr', onclick: () => this.runAsr() },
      running ? h('span', { class: 'spinner s12', 'aria-hidden': 'true' }) : ic('i-sparkle'),
      h('span', { class: 'asr-label', text: running ? `받아쓰는 중… ${clock((performance.now() - W.asr.start) / 1000)}` : '자동 받아쓰기' }));
    if (running) asrBtn.setAttribute('aria-busy', 'true');
    if (!W.blob && !running) setDisabled(asrBtn, true, '먼저 파일을 올려 주세요');
    else if (Status.offline && !running) setDisabled(asrBtn, true, '앱에 연결할 수 없어요');
    else if (running) setDisabled(asrBtn, true);
    const msg = h('div', { id: 'wiz-tr-msg', 'aria-live': 'polite' });
    if (W.asrError) msg.appendChild(h('p', { class: 'field-msg error' }, ic('i-alert'), h('span', { text: W.asrError })));
    else if (running && W.asr.first) msg.appendChild(h('p', { class: 'field-help', text: '모델을 내려받는 중이에요. 네트워크에 따라 몇 분 걸릴 수 있어요.' }));
    else if (W.asrDone) msg.appendChild(h('p', { class: 'field-msg ok' }, ic('i-check'), h('span', { text: '틀린 글자가 있으면 고쳐 주세요.' })));
    return h('div', { class: 'field transcript-field' },
      h('div', { class: 'head' }, h('div', null, h('label', { class: 'field-label', for: 'wiz-transcript', text: '녹음에서 말한 문장' }), h('p', { class: 'field-help', id: 'wiz-tr-help', text: '녹음 내용과 글자 하나까지 같을수록 결과가 좋아요.' })), asrBtn),
      h('div', { class: 'ta-wrap' }, ta, running ? h('div', { class: 'ta-shimmer skel', 'aria-hidden': 'true' }) : null), msg);
  },
  async runAsr() {
    const W = this.W;
    if (!W.blob || W.asr) return;
    const first = !Status.asrReady && LS.str('asrReady', '0') !== '1';
    if (first) {
      const ok = await modal({
        title: '받아쓰기 모델을 내려받을까요?', body: '처음 한 번만 받아쓰기 모델(약 460MB)을 인터넷에서 내려받아요. 녹음 파일은 이 맥 밖으로 보내지 않아요.',
        actions: [{ label: '취소', kind: 'secondary', value: false, initial: true }, { label: '내려받고 받아쓰기', kind: 'primary', value: true }],
      });
      if (!ok || this.W !== W) return;
    }
    W.asr = { start: performance.now(), first };
    W.asrError = null; W.asrDone = false;
    const prog = first ? toast({ type: 'progress', title: '받아쓰기 모델을 내려받는 중…', body: '약 460MB · 처음 한 번만' }) : null;
    this.render();
    const fd = new FormData();
    fd.append('file', W.blob, W.fileName || 'audio');
    try {
      const j = await api('/api/transcribe', { method: 'POST', body: fd });
      LS.setStr('asrReady', '1');
      if (this.W !== W) return;
      W.transcript = (j.text || '').trim();
      W.asrFlash = true; W.asrDone = true;
      if (W.mode === 'mic') W.prompt = W.transcript || W.prompt;
    } catch (e) {
      if (this.W !== W) return;
      W.asrError = e.status === 0 ? NET_MSG : '받아쓰기에 실패했어요. 문장을 직접 입력해 주세요.';
    } finally {
      if (prog) prog.close();
      if (this.W === W) { W.asr = null; this.render(); const ta = $('#wiz-transcript'); if (ta && W.asrDone) ta.focus(); }
    }
  },
  nextReason() {
    const W = this.W;
    if (W.step !== 2) return null;
    if (W.mode === 'mic') {
      if (W.recState === 'recording') return '녹음을 먼저 멈춰 주세요';
      if (!W.blob) return '먼저 문장을 녹음해 주세요';
      if (!this.judge(W.duration, false).ok) return '3초 이상 녹음해 주세요';
      return null;
    }
    if (!W.blob) return '먼저 음성 파일을 올려 주세요';
    if (!this.judge(W.duration, true).ok) return '3~10초 길이의 파일을 올려 주세요';
    if (!W.transcript.trim()) return '녹음에서 말한 문장을 입력해 주세요';
    if (W.asr) return '받아쓰기가 끝날 때까지 기다려 주세요';
    return null;
  },

  /* ---- step 3 ---- */
  step3(el) {
    const W = this.W;
    const t = h('span', { class: 't', 'aria-hidden': 'true' });
    const wave = new Waveform({ key: 'wiz:rec', src: W.url, height: 40, label: '녹음 재생 위치', onTime: (tt, d) => { t.textContent = clock(tt > 0 ? tt : d); } });
    const redoLabel = W.source === 'file' ? '다른 파일' : '다시 녹음';
    const redo = () => { if (W.source === 'mic') { this.discardRecording(); } this.goStep(2); };
    add(el, [
      h('h2', { text: '녹음을 확인해 주세요' }),
      h('div', { class: 'review-player' }, playButton('wiz:rec', () => W.url, { size: 44, cls: 'icon-btn play-btn', label: '녹음 ' }), wave.root, t,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: redo }, ic('i-refresh'), redoLabel)),
    ]);
    // transcript line
    if (W.reviewEditing) {
      const ta = h('textarea', { class: 'textarea', 'aria-label': '읽은 문장 수정', value: W.transcript, rows: '2' });
      const done = () => { const v = ta.value.replace(/[\r\n]+/g, ' ').trim(); if (v) { W.transcript = v; if (W.mode === 'mic') W.prompt = v; } W.reviewEditing = false; this.render(); };
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); done(); } if (e.key === 'Escape') { e.stopPropagation(); W.reviewEditing = false; this.render(); } });
      el.appendChild(h('div', { class: 'review-edit' }, h('label', { class: 'field-label', text: '읽은 문장' }), ta,
        h('div', { class: 'row' }, h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: done }, ic('i-check'), '완료'))));
      setTimeout(() => ta.focus(), 0);
    } else {
      el.appendChild(h('div', { class: 'review-line' }, h('span', { class: 'k', text: '읽은 문장' }), h('span', { class: 'v', text: `"${W.transcript}"` }),
        h('button', { class: 'btn btn-link', type: 'button', onclick: () => { W.reviewEditing = true; this.render(); } }, '수정')));
    }
    if (W.regError && ['length', 'audio', 'transcript'].includes(W.regError.field)) {
      el.appendChild(h('div', { class: 'judge error', role: 'alert', style: { marginTop: '14px' } }, ic('i-alert'), h('span', { text: W.regError.msg }),
        W.regError.field !== 'transcript' ? h('button', { class: 'btn btn-link', type: 'button', onclick: redo }, redoLabel) : null));
    } else if (W.blob && W.duration != null) {
      const j = this.judge(W.duration, W.source === 'file');
      if (j.kind !== 'ok') el.appendChild(h('div', { class: 'judge ' + j.kind, style: { marginTop: '14px' } }, ic(j.kind === 'info' ? 'i-info' : 'i-alert'), h('span', { text: j.msg })));
    }
    // name
    const nameErr = h('div', { id: 'wiz-name-msg', 'aria-live': 'polite' });
    const input = h('input', { class: 'input lg', id: 'wiz-name', type: 'text', maxlength: '40', autocomplete: 'off', value: W.name, 'aria-describedby': 'wiz-name-help wiz-name-msg', readonly: W.replace ? true : null });
    const counter = h('span', { class: 'name-count tnum', 'aria-hidden': 'true' });
    const cb = h('input', { type: 'checkbox', id: 'wiz-default' });
    const cbLabel = h('label', { class: 'checkbox', for: 'wiz-default' }, cb, '이 목소리를 기본으로 사용');
    const cbHelp = h('p', { class: 'field-help', id: 'wiz-default-help', hidden: true });
    cb.setAttribute('aria-describedby', 'wiz-default-help');
    cb.addEventListener('change', () => { W.makeDefault = cb.checked; });
    this.nameCounter = counter;
    this.defaultCb = { cb, cbLabel, cbHelp };
    input.addEventListener('input', () => { W.name = input.value; if (W.regError && W.regError.field === 'name') W.regError = null; this.validateName(input, nameErr); this.updateDefaultCheck(); this.updateButtons(); });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); this.register(); } });
    add(el, [
      h('div', { class: 'field name-field' },
        h('label', { class: 'field-label', for: 'wiz-name', text: '목소리 이름' }), input,
        h('div', { class: 'name-help-row' },
          h('p', { class: 'field-help', id: 'wiz-name-help', text: W.replace ? '다시 녹음할 때는 이름을 바꿀 수 없어요' : '완성된 한글·영문·숫자·공백·_·-로 40자까지' }), counter),
        nameErr),
      h('div', { class: 'default-check' }, cbLabel, cbHelp),
    ]);
    this.updateDefaultCheck();
    const regBtn = h('button', { class: 'btn btn-primary', type: 'button', 'data-act': 'register', onclick: () => this.register() });
    this.regBtn = regBtn;
    add(el, h('div', { class: 'wiz-foot' },
      h('button', { class: 'btn btn-ghost left', type: 'button', onclick: () => this.goStep(2) }, ic('i-arrow-left'), '이전'), regBtn));
    this.validateName(input, nameErr);
    this.setRegLabel();
  },
  updateDefaultCheck() {
    const W = this.W, d = this.defaultCb;
    if (!W || !d) return;
    const name = cleanName(W.name);
    const existing = Voices.get(name);
    const others = Voices.mine.filter(v => v.name !== name);
    let lock = null;
    if (existing && existing.preset) lock = null;
    else if (others.length === 0) lock = Voices.mine.length ? '하나뿐인 내 목소리라서 기본이 돼요' : '첫 내 목소리는 기본이 돼요';
    else if (existing && existing.default) lock = '지금 기본 목소리를 새 녹음으로 바꿔요. 기본 목소리로 계속 쓰여요';
    d.cb.disabled = !!lock;
    d.cb.checked = lock ? true : !!W.makeDefault;
    d.cbLabel.classList.toggle('disabled', !!lock);
    d.cbHelp.hidden = !lock;
    d.cbHelp.textContent = lock || '';
  },
  validateName(input, msgEl) {
    const W = this.W;
    const v = cleanName(W.name);
    const len = [...String(W.name || '')].length;
    if (this.nameCounter) { this.nameCounter.textContent = `${len}/40`; this.nameCounter.classList.toggle('at-limit', len >= 40); }
    clear(msgEl);
    input.removeAttribute('aria-invalid');
    if (W.regError && W.regError.field === 'name') {
      input.setAttribute('aria-invalid', 'true');
      msgEl.appendChild(h('p', { class: 'field-msg error' }, ic('i-alert'), h('span', { text: W.regError.msg })));
    } else if (v && !NAME_RE.test(v)) {
      input.setAttribute('aria-invalid', 'true');
      msgEl.appendChild(h('p', { class: 'field-msg error' }, ic('i-alert'), h('span', { text: /[ㄱ-ㅎㅏ-ㅣ]/.test(v) ? `${NAME_MSG} 자음·모음만 따로 쓴 글자는 쓸 수 없어요.` : NAME_MSG })));
    } else if (v && Voices.get(v) && Voices.get(v).preset) {
      input.setAttribute('aria-invalid', 'true');
      msgEl.appendChild(h('p', { class: 'field-msg error' }, ic('i-alert'), h('span', { text: '기본 제공 목소리와 같은 이름은 쓸 수 없어요. 다른 이름을 지어 주세요.' })));
    } else if (v && Voices.get(v) && !W.replace) {
      msgEl.appendChild(h('p', { class: 'field-msg warn' }, ic('i-alert'), h('span', { text: '같은 이름의 목소리가 있어요. 등록하면 새 녹음으로 바뀌어요.' })));
    }
    if (len >= 40 && !W.replace) msgEl.appendChild(h('p', { class: 'field-msg warn' }, ic('i-info'), h('span', { text: '이름은 40자까지 쓸 수 있어요. 더 입력한 글자는 들어가지 않아요.' })));
    this.setRegLabel();
  },
  setRegLabel() {
    const W = this.W, b = this.regBtn;
    if (!b) return;
    clear(b);
    if (W.registering) { add(b, [h('span', { class: 'spinner', 'aria-hidden': 'true' }), '등록하는 중…']); b.setAttribute('aria-busy', 'true'); return; }
    b.removeAttribute('aria-busy');
    const ex = Voices.get(cleanName(W.name));
    add(b, (W.replace || (ex && !ex.preset)) ? '바꿔서 등록하기' : '등록하기');
    const r = this.registerReason();
    setDisabled(b, !!r, r);
  },
  registerReason() {
    const W = this.W;
    if (Status.offline) return '앱에 연결할 수 없어요';
    const v = cleanName(W.name);
    if (!v || !NAME_RE.test(v)) return '목소리 이름을 확인해 주세요';
    if (Voices.get(v) && Voices.get(v).preset) return '기본 제공 목소리와 다른 이름을 지어 주세요';
    if (!W.transcript.trim()) return '녹음에서 말한 문장을 입력해 주세요';
    if (!W.blob) return '먼저 녹음하거나 파일을 올려 주세요';
    return null;
  },
  async register() {
    const W = this.W;
    if (W.registering || this.registerReason()) return;
    W.registering = true; W.regError = null;
    this.setRegLabel();
    this.card.setAttribute('aria-busy', 'true');
    const name = cleanName(W.name);
    const fd = new FormData();
    fd.append('file', W.blob, W.fileName || 'recording.webm');
    fd.append('name', name);
    fd.append('transcript', W.transcript.trim());
    const cb = $('#wiz-default');
    fd.append('make_default', String(!!(cb && cb.checked)));
    try {
      const res = await api('/api/voices', { method: 'POST', body: fd });
      if (this.W !== W) return;
      W.registering = false;
      W.result = res;
      tryCache.delete(res.name);
      Peaks.drop(sampleUrl(res.name));
      Player.release('ref:' + res.name);
      toast({ type: 'success', title: `'${res.name}' 목소리를 등록했어요` });
      Voices.load();
      this.goStep(4);
    } catch (e) {
      if (this.W !== W) return;
      W.registering = false;
      this.card.removeAttribute('aria-busy');
      const f = friendly(e);
      if (f.modal) { modal({ title: '오디오 변환 도구가 없어요', body: f.msg, actions: [{ label: '확인', kind: 'primary', value: 1, initial: true }] }); this.render(); return; }
      if (f.field) { W.regError = f; this.render(); const fe = f.field === 'name' ? $('#wiz-name') : $('[role="alert"]', this.card); if (fe) fe.focus && fe.focus(); return; }
      this.render();
      toast({ type: 'error', title: '등록하지 못했어요', body: f.msg });
    }
  },

  /* ---- step 4 ---- */
  step4(el) {
    const W = this.W;
    const r = W.result;
    const name = r.name;
    const refKey = 'ref:' + name, tryKey = 'try:' + name;
    const t1 = h('span', { class: 't', 'aria-hidden': 'true' });
    const w1 = new Waveform({ key: refKey, src: sampleUrl(name), height: 28, label: '참조 음성 재생 위치', onTime: (t, d) => { t1.textContent = clock(t > 0 ? t : d); } });
    const tryV = h('div', { class: 'v' });
    const renderTry = url => {
      clear(tryV);
      const t2 = h('span', { class: 't', 'aria-hidden': 'true' });
      const w2 = new Waveform({ key: tryKey, src: url, height: 28, label: '내 목소리 들어보기 재생 위치', onTime: (t, d) => { t2.textContent = clock(t > 0 ? t : d); } });
      tryV.appendChild(h('div', { class: 'mini-player' }, playButton(tryKey, () => url, { size: 32, label: '들어보기 ' }), w2.root, t2));
      Player.play(tryKey, url, 0).catch(() => {});
    };
    const tryBtn = h('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, ic('i-play'), '들어보기');
    tryBtn.addEventListener('click', () => tryVoice(name, tryBtn, renderTry));
    if (Synth.job) setDisabled(tryBtn, true, '다른 음성을 만드는 중이에요');
    tryV.append(tryBtn, h('span', { class: 'quote', text: `"${TRY_TEXT}"` }));
    add(el, h('div', { class: 'done-wrap' },
      h('div', { class: 'check-anim', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>' }),
      h('h2', { text: `'${name}' 목소리를 등록했어요` }),
      h('p', { class: 'sub', text: `무음 제거와 음량 보정을 마친 참조 음성이에요 (${sec1(r.seconds)}초)` }),
      h('div', { class: 'try-grid' },
        h('span', { class: 'k', text: '참조 음성' }), h('div', { class: 'v' }, h('div', { class: 'mini-player' }, playButton(refKey, () => sampleUrl(name), { size: 32, label: '참조 음성 ' }), w1.root, t1)),
        h('span', { class: 'k', text: '내 목소리로' }), tryV),
      h('div', { class: 'done-actions' },
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => { const mode = W.mode; const hash = '#/voices/new' + (mode === 'upload' ? '?mode=upload' : ''); history.replaceState(history.state, '', hash); Router.lastHash = location.hash; this.reset({ mode }); } }, ic('i-plus'), '다른 목소리 추가'),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => { Studio.selectVoice(name); Router.navigate('#/studio'); } }, '스튜디오에서 쓰기', ic('i-arrow-right'))),
      h('p', { class: 'retry-line' }, '비슷하지 않다면? 더 조용한 곳에서 다시 녹음해 보세요. ',
        h('button', { class: 'btn btn-link', type: 'button', onclick: () => {
          const hash = '#/voices/new?replace=' + encodeURIComponent(name);
          this.W = null;
          Router.navigate(hash);
        } }, '다시 녹음'))));
  },
  onTick() {
    const W = this.W;
    if (!W || !W.asr) return;
    const l = $('.asr-label', this.card);
    if (l) l.textContent = `받아쓰는 중… ${clock((performance.now() - W.asr.start) / 1000)}`;
  },
};

/* =====================================================================
   14. HISTORY
   ===================================================================== */
/* 내려받기 형식과 파일 이름 */
const FORMATS = [
  { id: 'wav', label: 'WAV', desc: '원본, 무손실' },
  { id: 'm4a', label: 'M4A', desc: '작은 파일' },
  { id: 'mp3', label: 'MP3', desc: '어디서나 재생' },
];
const Export = {
  get fmt() { const f = LS.str('exportFormat', 'wav'); return FORMATS.some(x => x.id === f) ? f : 'wav'; },
  set fmt(v) { LS.setStr('exportFormat', v); bus.emit('format'); },
  label(f = this.fmt) { return (FORMATS.find(x => x.id === f) || FORMATS[0]).label; },
  clean(t, n) { return [...String(t || '').replace(/[\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, n).join('').trim(); },
  /* 온음_{YYYYMMDD-HHMM}_{목소리}_{텍스트 앞 20자}.{ext} — 시간을 모르면 기록 id 나 지금 시각 */
  name({ time, id, voice, text }, ext = this.fmt) {
    let st = '';
    const d = time instanceof Date ? time : parseTime(time);
    if (!isNaN(d)) st = stamp(d).slice(0, 13);
    else { const m = /^(\d{8}-\d{4})/.exec(id || ''); st = m ? m[1] : stamp().slice(0, 13); }
    return ['온음', st, this.clean(voice, 20) || '목소리', this.clean(text, 20)].filter(Boolean).join('_') + '.' + ext;
  },
  menu(trigger, after) {
    openMenu(trigger, FORMATS.map(f => ({ label: `${f.label} (${f.desc})${f.id === this.fmt ? ' ✓' : ''}`, icon: f.id === this.fmt ? 'i-check' : 'i-file-audio', fn: () => { this.fmt = f.id; toast({ type: 'info', title: `${f.label}${josa(f.label, '으로로')} 내려받을게요`, body: '다음 내려받기부터 적용돼요.' }); if (after) after(); } })), { label: '내려받기 형식' });
  },
  /* 기록 파일 하나 내려받기 (형식 변환은 서버) */
  async history(it, fmt = this.fmt) {
    const name = this.name({ time: it.time, id: it.id, voice: it.voice, text: it.text }, fmt);
    const prog = fmt !== 'wav' ? toast({ type: 'progress', title: `${this.label(fmt)}${josa(this.label(fmt), '으로로')} 바꾸는 중…`, body: name }) : null;
    try {
      const res = await api(histUrl(it.id, true) + '&format=' + fmt, { raw: true });
      saveBlob(await res.blob(), name);
      toast({ type: 'success', title: '내려받기를 시작했어요', body: name });
    } catch (e) { toastError(e, { title: '내려받지 못했어요' }); }
    finally { if (prog) prog.close(); }
  },
};
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function durText(sec) {
  sec = Math.round(sec || 0);
  if (sec < 60) return `${sec}초`;
  const h_ = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s_ = sec % 60;
  return h_ ? `${h_}시간 ${m}분` : `${m}분${s_ ? ` ${s_}초` : ''}`;
}
/* Content-Disposition → 파일 이름 (RFC 5987 filename* 우선) */
function filenameFrom(cd) {
  if (!cd) return null;
  let m = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(cd);
  if (m) { try { return decodeURIComponent(m[2].trim().replace(/^"|"$/g, '')); } catch {} }
  m = /filename\s*=\s*"([^"]+)"/i.exec(cd) || /filename\s*=\s*([^;]+)/i.exec(cd);
  return m ? m[1].trim() : null;
}

const History = Pages.history = {
  title: '기록', el: null, items: [], loaded: false, error: null, q: '', voice: '', newId: null, focusId: null,
  pending: new Map(), expanded: new Set(),
  selecting: false, sel: new Set(), anchor: null, hidden: new Set(), bulk: new Map(), zipping: false,
  markNew(id) { if (id) { this.newId = id; this.stale = true; if (this.el && !this.el.hidden) this.load(); } },
  build() {
    this.search = h('input', { class: 'input', type: 'search', placeholder: '텍스트나 목소리로 검색', 'aria-label': '기록 검색', 'aria-keyshortcuts': '/' });
    const clearBtn = h('button', { class: 'icon-btn s28 clear-btn', type: 'button', 'aria-label': '검색어 지우기', hidden: true }, ic('i-x'));
    const run = debounce(() => { this.q = this.search.value.trim(); this.render(); }, 120);
    this.search.addEventListener('input', () => { clearBtn.hidden = !this.search.value; run(); });
    this.search.addEventListener('keydown', e => { if (e.key === 'Escape' && this.search.value) { e.preventDefault(); e.stopPropagation(); this.clearSearch(); } });
    clearBtn.addEventListener('click', () => { this.clearSearch(); this.search.focus(); });
    this.clearBtn = clearBtn;
    this.filter = h('select', { class: 'select', 'aria-label': '목소리 필터' });
    this.filter.addEventListener('change', () => { this.voice = this.filter.value; this.render(); });
    this.count = h('span', { class: 'count', 'aria-live': 'polite' });
    this.list = h('div', { class: 'history-list' });
    this.list.addEventListener('click', e => this.onListClick(e));
    this.selBtn = h('button', { class: 'btn btn-secondary btn-sm sel-toggle', type: 'button', 'aria-pressed': 'false', 'aria-keyshortcuts': 'S', 'data-tip': '여러 개를 골라 한꺼번에 내려받거나 지워요 (S)', onclick: () => this.setSelecting(!this.selecting) },
      ic('i-check-circle'), h('span', { class: 'lbl', text: '선택' }));
    this.allBox = h('input', { type: 'checkbox', id: 'hist-all' });
    this.allBox.addEventListener('change', () => this.selectAll(this.allBox.checked));
    this.allLabel = h('span', { class: 'all-label' });
    this.allWrap = h('label', { class: 'checkbox sel-all', for: 'hist-all', hidden: true }, this.allBox, this.allLabel);
    this.selLive = h('span', { class: 'sr-only', 'aria-live': 'polite' });
    this.barMsg = h('span', { class: 'msg tnum' });
    this.barNote = h('span', { class: 'note' });
    this.zipBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.bulkDownload() });
    this.delBtn = h('button', { class: 'btn btn-secondary bulk-del', type: 'button', onclick: () => this.bulkDelete() }, ic('i-trash'), '삭제');
    this.noneBtn = h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => this.clearSel(true) }, '선택 해제');
    this.bar = h('div', { class: 'save-bar bulk-bar', role: 'region', 'aria-label': '선택한 기록', hidden: true },
      h('div', { class: 'inner' }, h('span', { class: 'dot', 'aria-hidden': 'true' }), h('div', { class: 'bar-text' }, this.barMsg, this.barNote),
        this.noneBtn, this.delBtn, this.zipBtn, this.fmtBtn = h('button', { class: 'btn btn-ghost btn-sm fmt-btn', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': '내려받기 형식', 'data-tip': '내려받기 형식' }, h('span', { class: 'fmt-lbl' }), ic('i-chevron-down')),
        h('button', { class: 'icon-btn s36', type: 'button', 'aria-label': '선택 끝내기 (Esc)', 'data-tip': '선택 끝내기 (Esc)', onclick: () => this.setSelecting(false) }, ic('i-x'))));
    this.el = h('section', { class: 'page history-page' },
      pageHeader({ title: '기록', desc: '최근 300개까지 보관해요 · 파일은 이 맥의 out/history 에 있어요', actions: [
        h('button', { class: 'icon-btn s32', type: 'button', 'aria-label': '키보드 단축키 (?)', 'data-tip': '키보드 단축키 (?)', onclick: () => showShortcuts('history') }, ic('i-keyboard')),
        this.selBtn, h('div', { class: 'search', style: { width: '280px', maxWidth: '50vw' } }, ic('i-search'), this.search, clearBtn)] }),
      h('div', { class: 'page-body' }, h('div', { class: 'history-wrap' }, h('div', { class: 'filter-bar' }, this.filter, this.count, this.allWrap, this.selLive), this.list)),
      this.bar);
    addEventListener('pagehide', () => this.flushDeletes());
    this.fmtBtn.addEventListener('click', () => Export.menu(this.fmtBtn));
    bus.on('format', () => { if (this.loaded) this.render(); });
    this.list.addEventListener('keydown', e => this.listKey(e));
    this.render();
  },
  clearSearch() { this.search.value = ''; this.q = ''; this.clearBtn.hidden = true; this.render(); },
  onShow(_, changed) { if (changed || this.stale) this.load(); },
  onHide() { if (this.selecting) this.setSelecting(false, true); },
  async load() {
    this.stale = false;
    try {
      this.items = await api('/api/history?limit=300');
      this.loaded = true; this.error = null;
    } catch (e) { this.error = e; }
    this.render();
    if (this.focusId) {
      const row = $(`.hist-row[data-id="${CSS.escape(this.focusId)}"]`, this.list);
      this.focusId = null;
      if (row) { row.scrollIntoView({ block: 'center' }); row.classList.remove('new'); void row.offsetWidth; row.classList.add('new'); $('.hist-play', row).focus({ preventScroll: true }); }
    }
  },
  visible() {
    const q = this.q.toLowerCase();
    return this.items.filter(it => !this.pending.has(it.id) && !this.hidden.has(it.id)
      && (!this.voice || it.voice === this.voice)
      && (!q || String(it.text).toLowerCase().includes(q) || String(it.voice).toLowerCase().includes(q)));
  },
  renderFilter() {
    const names = new Set(Voices.list.map(v => v.name));
    this.items.forEach(i => i.voice && names.add(i.voice));
    const cur = this.voice;
    clear(this.filter);
    this.filter.appendChild(h('option', { value: '', text: '전체 목소리' }));
    [...names].sort((a, b) => a.localeCompare(b, 'ko')).forEach(n => this.filter.appendChild(h('option', { value: n, text: n })));
    this.filter.value = names.has(cur) ? cur : '';
    this.voice = this.filter.value;
  },
  render() {
    const L = clear(this.list);
    if (!this.loaded) {
      if (this.error) { L.appendChild(errorState(() => this.load())); this.count.textContent = ''; return; }
      const g = h('div', { class: 'card hist-group', 'aria-busy': 'true', 'aria-label': '불러오는 중' });
      for (let i = 0; i < 5; i++) g.appendChild(h('div', { class: 'hist-skel' }, h('span', { class: 'skel', style: { width: '36px', height: '36px', borderRadius: '50%' } }),
        h('div', null, h('div', { class: 'skel', style: { height: '13px', width: (60 + (i * 13) % 35) + '%' } }), h('div', { class: 'skel', style: { height: '10px', width: '30%', marginTop: '10px' } }))));
      L.appendChild(h('div', { class: 'hist-group-title', html: '&nbsp;' }));
      L.appendChild(g);
      return;
    }
    this.renderFilter();
    const vis = this.visible();
    const total = this.items.filter(i => !this.pending.has(i.id) && !this.hidden.has(i.id)).length;
    this.selBtn.hidden = !total && !this.selecting;
    this.count.textContent = this.q || this.voice ? `${nf.format(vis.length)}개 찾음` : `${nf.format(total)}개`;
    const desc = $('.page-header .desc', this.el);
    if (desc) {
      const near = this.items.length >= 250;
      desc.classList.toggle('cap-warn', near);
      desc.textContent = near ? `기록이 ${this.items.length}/300개예요. 오래된 기록부터 자동으로 지워지니, 남기고 싶은 건 내려받아 두세요.` : '최근 300개까지 보관해요 · 파일은 이 맥의 out/history 에 있어요';
    }
    if (!total || !vis.length) this.updateSel();
    if (!total) {
      L.appendChild(h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, ic('i-clock')),
        h('h2', { text: '아직 만든 음성이 없어요' }), h('p', { text: '스튜디오에서 읽은 음성은 여기에 자동으로 저장돼요.' }),
        h('a', { class: 'btn btn-primary', href: '#/studio', style: { textDecoration: 'none' } }, '스튜디오로 가기')));
      return;
    }
    if (!vis.length) {
      const q = this.q || this.voice;
      L.appendChild(h('div', { class: 'empty' }, h('div', { class: 'empty-ico' }, ic('i-search')),
        h('h2', { text: this.q ? `'${this.q}'${josa(this.q, '과와')} 일치하는 기록이 없어요` : `'${q}' 목소리로 만든 기록이 없어요` }),
        h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { this.clearSearch(); this.filter.value = ''; this.voice = ''; this.render(); } }, '검색어 지우기')));
      return;
    }
    let curLabel = null, group = null;
    for (const it of vis) {
      const d = parseTime(it.time);
      const label = isNaN(d) ? '날짜 없음' : dayLabel(d);
      if (label !== curLabel) {
        curLabel = label;
        L.appendChild(h('h2', { class: 'hist-group-title', text: label }));
        group = h('div', { class: 'card hist-group', role: 'list' });
        L.appendChild(group);
      }
      group.appendChild(this.row(it, d));
    }
    this.newId = null;
    this.updateSel();
  },
  highlight(text) {
    const frag = document.createDocumentFragment();
    const q = this.q;
    if (!q) { frag.appendChild(document.createTextNode(text)); return frag; }
    const lower = text.toLowerCase(), ql = q.toLowerCase();
    let i = 0, j;
    while ((j = lower.indexOf(ql, i)) >= 0) {
      if (j > i) frag.appendChild(document.createTextNode(text.slice(i, j)));
      frag.appendChild(h('mark', { text: text.slice(j, j + q.length) }));
      i = j + q.length;
    }
    if (i < text.length) frag.appendChild(document.createTextNode(text.slice(i)));
    return frag;
  },
  row(it, d) {
    const key = 'hist:' + it.id;
    const src = histUrl(it.id);
    const row = h('div', { class: 'hist-row' + (it.id === this.newId ? ' new' : ''), role: 'listitem', 'data-id': it.id });
    const play = playButton(key, src, { size: 36, cls: 'icon-btn hist-play', label: '' });
    play.setAttribute('aria-keyshortcuts', 'J K X E D');
    const txtId = 'ht-' + it.id.replace(/[^a-z0-9]/gi, '');
    const exp = this.expanded.has(it.id);
    const text = h('button', { class: 'hist-text', type: 'button', id: txtId, 'aria-expanded': String(exp) }, this.highlight(String(it.text || '')));
    text.addEventListener('click', e => { if (this.selecting) return; const o = text.getAttribute('aria-expanded') !== 'true'; text.setAttribute('aria-expanded', String(o)); if (o) this.expanded.add(it.id); else this.expanded.delete(it.id); });
    play.setAttribute('aria-describedby', txtId);
    const waveBox = h('div');
    const tEl = h('span', { class: 't', 'aria-hidden': 'true' });
    let wave = null;
    const ensureWave = () => {
      if (wave) return;
      wave = new Waveform({ key, src, height: 32, label: '재생 위치', onTime: (t, dd) => { tEl.textContent = `${clock(t)} / ${clock(dd || it.seconds)}`; } });
      waveBox.appendChild(h('div', { class: 'inner' }, wave.root, tEl));
    };
    Player.bind(row, () => {
      const active = Player.key === key && (!Player.el.paused || Player.el.currentTime > 0);
      if (active) ensureWave();
      row.classList.toggle('playing', active);
    });
    const time = isNaN(d) ? '' : timeFmt.format(d);
    const meta = h('div', { class: 'hist-meta' }, avatar(it.voice, 16), h('span', null, this.highlight(String(it.voice || ''))), h('span', { class: 'sep', text: '·' }),
      h('span', { text: `${sec1(it.seconds)}초` }), h('span', { class: 'sep', text: '·' }), h('span', { text: speedShort(it.speed || 1) }),
      time ? [h('span', { class: 'sep', text: '·' }), h('time', { datetime: isNaN(d) ? null : d.toISOString(), text: time })] : null,
      it.engine ? h('span', { class: 'eng-badge', 'data-eng': it.engine, title: `${Settings.label(it.engine)}로 만들었어요` }, it.engine === 'qwen' ? '고품질' : '빠른') : null,
      it.seed != null && Number(it.seed) !== 42 ? h('span', { class: 'eng-badge alt', title: `다른 억양 (seed ${it.seed})` }, '다른 억양') : null);
    const actions = h('div', { class: 'hist-actions' },
      h('button', { class: 'icon-btn s32', type: 'button', 'aria-label': '텍스트를 스튜디오로', 'data-tip': '텍스트를 스튜디오로', onclick: () => Studio.loadFromHistory(it) }, ic('i-rewrite')),
      h('button', { class: 'icon-btn s32 dl-btn', type: 'button', 'aria-label': `${Export.label()}로 내려받기`, 'data-tip': `${Export.label()}로 내려받기`, onclick: () => Export.history(it) }, ic('i-download')),
      h('button', { class: 'icon-btn s32 danger', type: 'button', 'aria-label': '삭제', 'data-tip': '삭제', onclick: () => this.remove(it, row) }, ic('i-trash')));
    const snip = [...String(it.text || '').replace(/\s+/g, ' ').trim()].slice(0, 30).join('');
    const box = h('input', { type: 'checkbox', class: 'hist-box', 'aria-label': `${isNaN(d) ? '' : dayLabel(d) + ' ' + time + ' · '}${snip} 선택`, 'data-id': it.id });
    box.checked = this.sel.has(it.id);
    box.addEventListener('click', e => { e.stopPropagation(); this.toggle(it.id, box.checked, e.shiftKey); });
    const check = h('label', { class: 'hist-check', 'data-tip': this.selecting ? null : '선택 (S)' }, box);
    row.classList.toggle('selected', this.sel.has(it.id));
    add(row, [check, play, h('div', { class: 'hist-main' }, text, h('div', { class: 'hist-wave' }, waveBox), meta), actions]);
    return row;
  },
  /* ----- 키보드: j/k ↑↓ 이동, x 선택, e 스튜디오로, d/⌫ 삭제 ----- */
  listKey(e) {
    if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTyping(e.target)) return;
    const row = e.target.closest('.hist-row');
    if (!row) return;
    const rows = $$('.hist-row', this.list);
    const i = rows.indexOf(row);
    const k = e.key;
    const it = this.items.find(x => x.id === row.dataset.id);
    const go = j => { const r = rows[Math.max(0, Math.min(rows.length - 1, j))]; if (r) { const p = $('.hist-play', r); p.focus(); r.scrollIntoView({ block: 'nearest' }); } };
    if (k === 'j' || k === 'ㅓ' || k === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (k === 'k' || k === 'ㅏ' || k === 'ArrowUp') { e.preventDefault(); go(i - 1); }
    else if (k === 'Home' && e.target.classList.contains('hist-play')) { e.preventDefault(); go(0); }
    else if (k === 'End' && e.target.classList.contains('hist-play')) { e.preventDefault(); go(rows.length - 1); }
    else if (k === 'x' || k === 'X' || k === 'ㅌ') { e.preventDefault(); this.toggle(row.dataset.id, !this.sel.has(row.dataset.id), e.shiftKey); $('.hist-play', row).focus(); }
    else if ((k === 'e' || k === 'ㄷ') && it) { e.preventDefault(); Studio.loadFromHistory(it); }
    else if ((k === 'd' || k === 'ㅇ' || k === 'Backspace' || k === 'Delete') && it) {
      e.preventDefault();
      if (this.sel.size && this.sel.has(it.id)) this.bulkDelete(); else this.remove(it, row);
    }
  },
  /* ----- 선택 ----- */
  onListClick(e) {
    if (!this.selecting) return;
    const row = e.target.closest('.hist-row');
    if (!row || e.target.closest('.hist-play, .hist-actions, .hist-check, .wave, a')) return;
    e.preventDefault();
    const id = row.dataset.id;
    this.toggle(id, !this.sel.has(id), e.shiftKey);
    const b = $('.hist-box', row); if (b && !e.shiftKey) b.focus({ preventScroll: true });
  },
  setSelecting(on, quiet) {
    if (on === this.selecting) return;
    this.selecting = on;
    if (!on) { this.sel.clear(); this.anchor = null; }
    this.el.classList.toggle('selecting', on);
    this.selBtn.setAttribute('aria-pressed', String(on));
    $('.lbl', this.selBtn).textContent = on ? '선택 끝내기' : '선택';
    $$('.hist-check', this.list).forEach(c => { if (on) delete c.dataset.tip; else c.dataset.tip = '선택 (S)'; });
    this.updateSel();
    if (!quiet) {
      srAnnounce(on ? '선택 모드예요. 기록을 눌러 고르세요.' : '선택 모드를 끝냈어요');
      if (on) { const f = $('.hist-box', this.list); if (f) f.focus({ preventScroll: true }); }
      else this.selBtn.focus({ preventScroll: true });
    }
  },
  toggle(id, on, range) {
    if (!this.selecting) this.setSelecting(true, true);
    const ids = this.visible().map(i => i.id);
    if (range && this.anchor && ids.includes(this.anchor) && ids.includes(id)) {
      const a = ids.indexOf(this.anchor), b = ids.indexOf(id);
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) { if (on) this.sel.add(ids[i]); else this.sel.delete(ids[i]); }
    } else if (on) this.sel.add(id); else this.sel.delete(id);
    this.anchor = id;
    this.updateSel(true);
  },
  selectAll(on) {
    const ids = this.visible().map(i => i.id);
    if (!this.selecting) this.setSelecting(true, true);
    ids.forEach(id => (on ? this.sel.add(id) : this.sel.delete(id)));
    this.updateSel(true);
  },
  clearSel(focus) {
    this.sel.clear(); this.anchor = null; this.updateSel(true);
    if (focus) { const f = $('.hist-box', this.list); if (f) f.focus({ preventScroll: true }); }
  },
  selectedItems() { return this.items.filter(i => this.sel.has(i.id) && !this.pending.has(i.id) && !this.hidden.has(i.id)); },
  updateSel(announce) {
    if (!this.el) return;
    // 사라진 기록은 선택에서 뺀다
    for (const id of [...this.sel]) if (!this.items.some(i => i.id === id) || this.pending.has(id) || this.hidden.has(id)) this.sel.delete(id);
    $$('.hist-row', this.list).forEach(r => {
      const on = this.sel.has(r.dataset.id);
      r.classList.toggle('selected', on);
      const b = $('.hist-box', r); if (b) b.checked = on;
    });
    const vis = this.visible();
    const visSel = vis.filter(i => this.sel.has(i.id)).length;
    const filtered = !!(this.q || this.voice);
    this.allWrap.hidden = !this.selecting || !vis.length;
    this.allBox.checked = vis.length > 0 && visSel === vis.length;
    this.allBox.indeterminate = visSel > 0 && visSel < vis.length;
    this.allLabel.textContent = filtered ? `검색 결과 ${nf.format(vis.length)}개 모두 선택` : `전체 ${nf.format(vis.length)}개 모두 선택`;
    const items = this.selectedItems();
    const n = items.length;
    const secs = items.reduce((a, i) => a + (Number(i.seconds) || 0), 0);
    this.bar.hidden = !this.selecting;
    document.body.classList.toggle('bar-visible', this.selecting && onRoute('history'));
    this.barMsg.textContent = n ? `${nf.format(n)}개 선택됨 · 총 ${durText(secs)}` : '기록을 눌러 선택하세요';
    const outside = n - visSel;
    this.barNote.textContent = outside > 0 ? `검색 결과 밖의 ${outside}개도 포함돼요` : (n ? '' : 'Shift를 누른 채 누르면 범위로 골라요');
    $('.fmt-lbl', this.fmtBtn).textContent = Export.label();
    if (!this.zipping) {
      clear(this.zipBtn);
      add(this.zipBtn, [ic('i-download'), n === 1 ? `${Export.label()}로 내려받기` : `ZIP으로 내려받기 (${Export.label()})`]);
    }
    const reason = !n ? '먼저 기록을 선택해 주세요' : (Status.offline ? '앱에 연결할 수 없어요' : null);
    setDisabled(this.zipBtn, !!reason || this.zipping, this.zipping ? '압축하는 중이에요' : reason);
    setDisabled(this.delBtn, !!reason || this.zipping, this.zipping ? '압축하는 중이에요' : reason);
    setDisabled(this.noneBtn, !n, '선택한 기록이 없어요');
    if (announce) { clearTimeout(this.annT); this.annT = setTimeout(() => { this.selLive.textContent = n ? `${n}개 선택됨` : '선택한 기록 없음'; }, 250); }
  },
  async bulkDownload() {
    const items = this.selectedItems();
    if (!items.length || this.zipping) return;
    if (items.length === 1) { await Export.history(items[0]); return; }
    this.zipping = true;
    clear(this.zipBtn); add(this.zipBtn, [h('span', { class: 'spinner', 'aria-hidden': 'true' }), Export.fmt === 'wav' ? 'ZIP 만드는 중…' : '변환하고 묶는 중…']);
    this.zipBtn.setAttribute('aria-busy', 'true');
    this.updateSel();
    srAnnounce(`${items.length}개를 압축하고 있어요`);
    try {
      const res = await api('/api/history/zip', { method: 'POST', json: { ids: items.map(i => i.id), format: Export.fmt }, raw: true });
      const blob = await res.blob();
      const name = filenameFrom(res.headers.get('Content-Disposition')) || `온음_기록_${stamp()}_${items.length}개.zip`;
      saveBlob(blob, name);
      toast({ type: 'success', title: `${nf.format(items.length)}개를 내려받았어요`, body: `${name} · ${(blob.size / 1048576).toFixed(1)}MB` });
    } catch (e) {
      toastError(e, { title: '내려받지 못했어요' });
    } finally {
      this.zipping = false;
      this.zipBtn.removeAttribute('aria-busy');
      this.updateSel();
    }
  },
  async bulkDelete() {
    const items = this.selectedItems();
    if (!items.length) return;
    const n = items.length;
    if (n >= 20) {
      const ok = await confirmModal({ title: `기록 ${nf.format(n)}개를 삭제할까요?`, body: '삭제한 뒤 몇 초 동안은 되돌릴 수 있어요.', ok: '삭제', danger: true });
      if (!ok) return;
    }
    const ids = items.map(i => i.id);
    ids.forEach(id => { this.hidden.add(id); Player.release('hist:' + id); });
    const token = Symbol('bulk');
    this.bulk.set(token, ids);
    this.sel.clear(); this.anchor = null;
    this.setSelecting(false, true);
    this.render();
    this.selBtn.focus({ preventScroll: true });
    srAnnounce(`${n}개 삭제했어요`);
    toast({
      type: 'info', title: `${nf.format(n)}개 삭제했어요`, duration: 6000,
      action: { label: '되돌리기', fn: () => { this.bulk.delete(token); ids.forEach(id => this.hidden.delete(id)); this.render(); srAnnounce('삭제를 되돌렸어요'); } },
      onClose: reason => { if (reason !== 'action') this.commitBulk(token); },
    });
  },
  async commitBulk(token) {
    const ids = this.bulk.get(token);
    if (!ids) return;
    this.bulk.delete(token);
    try {
      await api('/api/history/delete', { method: 'POST', json: { ids } });
      this.items = this.items.filter(i => !ids.includes(i.id));
      ids.forEach(id => this.hidden.delete(id));
    } catch (e) {
      ids.forEach(id => this.hidden.delete(id));
      toast({ type: 'error', title: '기록을 삭제하지 못했어요', body: '다시 시도해 주세요.' });
    }
    if (this.el && !this.el.hidden) this.render();
  },
  remove(it, row) {
    const next = row.nextElementSibling || row.previousElementSibling;
    Player.release('hist:' + it.id);
    row.classList.add('removing');
    this.pending.set(it.id, null);
    setTimeout(() => {
      this.render();
      const f = next && next.dataset && next.dataset.id ? $(`.hist-row[data-id="${CSS.escape(next.dataset.id)}"] .hist-play`, this.list) : null;
      if (f) f.focus({ preventScroll: true }); else this.search.focus({ preventScroll: true });
    }, reducedMotion() ? 0 : 200);
    const tst = toast({
      type: 'info', title: '기록을 삭제했어요', duration: 6000,
      action: { label: '되돌리기', fn: () => { this.pending.delete(it.id); this.render(); } },
      onClose: reason => { if (reason !== 'action') this.commitDelete(it.id); },
    });
    this.pending.set(it.id, tst);
  },
  async commitDelete(id) {
    if (!this.pending.has(id)) return;
    this.pending.delete(id);
    try {
      await api(histUrl(id), { method: 'DELETE' });
      this.items = this.items.filter(i => i.id !== id);
    } catch (e) {
      if (e.status === 404) { this.items = this.items.filter(i => i.id !== id); }
      else toast({ type: 'error', title: '기록을 삭제하지 못했어요', body: '다시 시도해 주세요.' });
    }
    if (this.el && !this.el.hidden) this.render();
  },
  flushDeletes() {
    for (const [id] of this.pending) {
      try { fetch(histUrl(id), { method: 'DELETE', keepalive: true }); } catch {}
    }
    this.pending.clear();
    for (const [, ids] of this.bulk) {
      try { fetch('/api/history/delete', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }); } catch {}
    }
    this.bulk.clear();
  },
};

/* =====================================================================
   15. DICTIONARY
   ===================================================================== */
let rowSeq = 0;
const cleanCell = s => String(s || '').replace(/[\t\r\n]+/g, ' ');
const Dict = Pages.dictionary = {
  title: '발음 사전', el: null, rows: [], orig: new Map(), loaded: false, error: null, q: '', saving: false,
  build() {
    this.search = h('input', { class: 'input', type: 'search', placeholder: '검색', 'aria-label': '사전 검색' });
    this.search.addEventListener('input', debounce(() => { this.q = this.search.value.trim().toLowerCase(); this.renderTable(); }, 120));
    this.search.addEventListener('keydown', e => { if (e.key === 'Escape' && this.search.value) { e.preventDefault(); e.stopPropagation(); this.search.value = ''; this.q = ''; this.renderTable(); } });
    const addBtn = h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => this.addRow() }, ic('i-plus'), '단어 추가');
    this.table = h('div', { class: 'card dict-table' });
    this.infoBox = this.buildInfo();
    this.testCard = this.buildTest();
    this.saveBar = h('div', { class: 'save-bar', hidden: true, role: 'region', 'aria-label': '저장' });
    this.el = h('section', { class: 'page' },
      pageHeader({ title: '발음 사전', desc: '자주 틀리게 읽는 단어의 읽는 법을 알려 주세요', actions: [h('div', { class: 'search', style: { width: '200px' } }, ic('i-search'), this.search), addBtn] }),
      h('div', { class: 'page-body' }, h('div', { class: 'dict-wrap' }, this.infoBox, this.table, this.testCard)),
      this.saveBar);
    this.el.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S' || e.key === 'ㄴ')) { e.preventDefault(); this.save(); }
    });
    addEventListener('beforeunload', e => { if (this.dirtyCount() > 0) { e.preventDefault(); e.returnValue = ''; } });
    this.renderTable();
  },
  onShow(_, changed) { if (changed && !this.dirtyCount()) this.load(); },
  async load() {
    try {
      const rows = await api('/api/dict');
      this.setFromServer(rows);
      this.error = null;
    } catch (e) { this.error = e; }
    this.renderTable();
  },
  setFromServer(rows) {
    this.rows = rows.map(r => ({ id: ++rowSeq, src: r.src, dst: r.dst }));
    this.orig = new Map(this.rows.map(r => [r.id, { src: r.src, dst: r.dst }]));
    this.loaded = true;
    this.updateDirty();
  },
  buildInfo() {
    if (LS.str('dictInfoDismissed', '0') === '1') return h('div', { hidden: true });
    const box = h('div', { class: 'info-box', role: 'note' }, ic('i-info'),
      h('div', null, h('h3', { text: '이런 건 따로 등록하지 않아도 돼요' }),
        h('p', { text: '숫자·날짜·시간·전화번호·단위(kg, %, km)·영어 대문자 약어(AI, GPU)·URL은 자동으로 한글 읽기로 바꿔요. 예) 2026년 10월 1일 → 이천이십육년 시월 일일' }),
        h('p', { text: '영어 단어는 대소문자 구분 없이 단어 단위로 바뀌어요.' })),
      h('button', { class: 'icon-btn s28', type: 'button', 'aria-label': '안내 닫기', 'data-tip': '닫기', onclick: () => { LS.setStr('dictInfoDismissed', '1'); box.hidden = true; } }, ic('i-x')));
    return box;
  },
  buildTest() {
    const input = h('input', { class: 'input', type: 'text', placeholder: '테스트할 문장을 입력하세요', 'aria-label': '테스트할 문장', value: 'ChatGPT로 만든 글을 YouTube에 올렸어요.' });
    this.testOut = h('div', { class: 'test-out', 'aria-live': 'polite' });
    this.testNote = h('p', { class: 'test-note' }, ic('i-info'), h('span', { text: '저장한 단어만 반영돼요.' }));
    let ctrl = null;
    const run = async () => {
      const t = input.value;
      if (ctrl) ctrl.abort();
      if (!t.trim()) { clear(this.testOut); return; }
      ctrl = new AbortController();
      const my = ctrl;
      this.testOut.classList.add('loading');
      try {
        const norm = await normalizeText(t, my.signal);
        const { frag } = diffFragment(t, norm);
        clear(this.testOut);
        this.testOut.append(h('span', { class: 'arr', 'aria-hidden': 'true', text: '→' }), h('span', null, frag));
      } catch (e) {
        if (e.name === 'AbortError') return;
        clear(this.testOut); this.testOut.append(h('span', { class: 'arr', text: '→' }), h('span', { style: { color: 'var(--text-3)' }, text: '미리보기를 불러오지 못했어요.' }));
      } finally { if (ctrl === my) this.testOut.classList.remove('loading'); }
    };
    this.runTest = run;
    input.addEventListener('input', debounce(run, 350));
    run();
    return h('section', { class: 'card test-card', 'aria-labelledby': 'dict-test-h' }, h('h3', { id: 'dict-test-h' }, ic('i-ear'), '바로 확인해 보기'), input, this.testOut, this.testNote);
  },
  dupKeys() {
    const count = new Map();
    for (const r of this.rows) { const k = r.src.trim().toLowerCase(); if (k) count.set(k, (count.get(k) || 0) + 1); }
    return count;
  },
  renderTable(focus) {
    const T = clear(this.table);
    if (!this.loaded) {
      if (this.error) { T.appendChild(errorState(() => this.load())); return; }
      for (let i = 0; i < 4; i++) T.appendChild(h('div', { class: 'dict-row', 'aria-hidden': 'true' }, h('span', { class: 'skel', style: { height: '14px', margin: '11px 10px' } }), h('span'), h('span', { class: 'skel', style: { height: '14px', margin: '11px 10px' } }), h('span')));
      return;
    }
    if (!this.rows.length) {
      T.appendChild(h('div', { class: 'empty', style: { padding: '40px 24px' } }, h('div', { class: 'empty-ico' }, ic('i-book')),
        h('h2', { text: '아직 등록한 단어가 없어요' }), h('p', { text: '예: ChatGPT → 챗지피티' }),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.addRow() }, ic('i-plus'), '첫 단어 추가')));
      return;
    }
    T.appendChild(h('div', { class: 'dict-row head', 'aria-hidden': 'true' }, h('span', { text: '원문' }), h('span'), h('span', { text: '읽는 법' }), h('span')));
    const list = h('div', { role: 'list', 'aria-label': '발음 사전 단어' });
    const q = this.q;
    let shown = 0;
    for (const r of this.rows) {
      if (q && !(r.src.toLowerCase().includes(q) || r.dst.toLowerCase().includes(q))) continue;
      shown++;
      list.appendChild(this.rowEl(r, r.id === focus));
    }
    T.appendChild(list);
    if (!shown) T.appendChild(h('p', { class: 'field-help', style: { padding: '16px 18px' }, text: `'${this.search.value}'${josa(this.search.value, '과와')} 일치하는 단어가 없어요` }));
    T.appendChild(h('div', { class: 'dict-add-row' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => this.addRow() }, ic('i-plus'), '단어 추가')));
    this.validate();
  },
  rowEl(r, isNew) {
    const src = h('input', { type: 'text', value: r.src, placeholder: '예: ChatGPT', 'aria-label': '원문', 'data-col': 'src', spellcheck: 'false' });
    const dst = h('input', { type: 'text', value: r.dst, placeholder: '예: 챗지피티', 'aria-label': '읽는 법', 'data-col': 'dst', spellcheck: 'false' });
    const srcMsg = h('div', { class: 'cell-msg', hidden: true });
    const dstMsg = h('div', { class: 'cell-msg', hidden: true });
    const del = h('button', { class: 'icon-btn s32 danger', type: 'button', 'aria-label': `'${r.src || '빈 줄'}' 삭제`, 'data-tip': '삭제' }, ic('i-trash'));
    const row = h('div', { class: 'dict-row' + (isNew ? ' new' : ''), role: 'listitem', 'data-id': r.id },
      h('div', { class: 'dict-cell' }, src, srcMsg), h('span', { class: 'arrow', 'aria-hidden': 'true' }, ic('i-arrow-right')),
      h('div', { class: 'dict-cell' }, dst, dstMsg), del);
    const onInput = (inp, col) => {
      const v = cleanCell(inp.value);
      if (v !== inp.value) { const p = inp.selectionStart; inp.value = v; try { inp.setSelectionRange(p, p); } catch {} }
      r[col] = v;
      if (col === 'src') del.setAttribute('aria-label', `'${v || '빈 줄'}' 삭제`);
      this.validate(); this.updateDirty();
    };
    src.addEventListener('input', () => onInput(src, 'src'));
    dst.addEventListener('input', () => onInput(dst, 'dst'));
    const keys = (inp, col) => e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const rows = $$('.dict-row[data-id]', this.table);
        const i = rows.indexOf(row);
        if (i === rows.length - 1) this.addRow(col);
        else $(`input[data-col="${col}"]`, rows[i + 1]).focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Backspace') {
        e.preventDefault(); this.deleteRow(r.id, col);
      }
    };
    src.addEventListener('keydown', keys(src, 'src'));
    dst.addEventListener('keydown', keys(dst, 'dst'));
    del.addEventListener('click', () => this.deleteRow(r.id, 'src'));
    row._msgs = { srcMsg, dstMsg, src, dst };
    return row;
  },
  validate() {
    const dups = this.dupKeys();
    const seen = new Map();
    for (const el of $$('.dict-row[data-id]', this.table)) {
      const r = this.rows.find(x => x.id === +el.dataset.id);
      if (!r || !el._msgs) continue;
      const { srcMsg, dstMsg, src, dst } = el._msgs;
      const k = r.src.trim().toLowerCase();
      const isDup = k && dups.get(k) > 1;
      src.classList.toggle('warn', !!isDup);
      const n = (seen.get(k) || 0) + 1; if (k) seen.set(k, n);
      let sm = null, dm = null;
      if (isDup && n > 1) sm = ['warn', '같은 원문이 이미 있어요. 아래쪽 줄이 적용돼요.'];
      if (r.src.trim() && !r.dst.trim()) dm = ['muted', '읽는 법이 비어 있으면 저장되지 않아요.'];
      if (!r.src.trim() && r.dst.trim()) sm = sm || ['muted', '원문이 비어 있으면 저장되지 않아요.'];
      for (const [elm, v, inp] of [[srcMsg, sm, src], [dstMsg, dm, dst]]) {
        elm.hidden = !v;
        if (v) { elm.className = 'cell-msg ' + v[0]; elm.textContent = v[1]; elm.id = elm.id || ('dm-' + Math.random().toString(36).slice(2, 8)); inp.setAttribute('aria-describedby', elm.id); }
        else inp.removeAttribute('aria-describedby');
      }
    }
  },
  addRow(col = 'src') {
    if (!this.loaded) return;
    if (this.q) { this.search.value = ''; this.q = ''; }
    const r = { id: ++rowSeq, src: '', dst: '' };
    this.rows.push(r);
    this.renderTable(r.id);
    this.updateDirty();
    const el = $(`.dict-row[data-id="${r.id}"] input[data-col="src"]`, this.table);
    if (el) { el.focus(); el.scrollIntoView({ block: 'nearest' }); }
  },
  deleteRow(id, col) {
    const rows = $$('.dict-row[data-id]', this.table);
    const i = rows.findIndex(x => +x.dataset.id === id);
    const target = rows[i + 1] || rows[i - 1];
    this.rows = this.rows.filter(r => r.id !== id);
    this.renderTable();
    this.updateDirty();
    const f = target ? $(`.dict-row[data-id="${target.dataset.id}"] input[data-col="${col}"]`, this.table) : $('.dict-add-row .btn, .empty .btn', this.table);
    if (f) f.focus();
  },
  dirtyCount() {
    let n = 0;
    const ids = new Set();
    for (const r of this.rows) {
      ids.add(r.id);
      const o = this.orig.get(r.id);
      if (!o) { if (r.src.trim() || r.dst.trim()) n++; }
      else if (o.src !== r.src || o.dst !== r.dst) n++;
    }
    for (const id of this.orig.keys()) if (!ids.has(id)) n++;
    return n;
  },
  updateDirty() {
    const n = this.dirtyCount();
    $('#dict-dot').hidden = n === 0;
    const nav = $('.nav-item[data-nav="dictionary"]');
    nav.dataset.tip = n ? '발음 사전 · 저장하지 않은 변경 있음' : '발음 사전';
    if (this.testNote) { this.testNote.classList.toggle('warn', n > 0); setIc($('svg', this.testNote), n > 0 ? 'i-alert' : 'i-info'); }
    if (!this.saveBar) return;
    if (!n) { this.saveBar.hidden = true; return; }
    const wasHidden = this.saveBar.hidden;
    this.saveBar.hidden = false;
    if (wasHidden || !this.saveBar.firstChild) this.renderSaveBar();
    const msg = $('.msg', this.saveBar); if (msg) msg.textContent = `저장하지 않은 변경 ${n}개`;
  },
  renderSaveBar() {
    const n = this.dirtyCount();
    const saveBtn = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => this.save() },
      this.saving ? [h('span', { class: 'spinner', 'aria-hidden': 'true' }), '저장하는 중…'] : ['저장하기', h('span', { class: 'kbd', text: `${MOD}S`, 'aria-hidden': 'true' })]);
    if (this.saving) saveBtn.setAttribute('aria-busy', 'true');
    saveBtn.setAttribute('aria-keyshortcuts', IS_MAC ? 'Meta+S' : 'Control+S');
    clear(this.saveBar).appendChild(h('div', { class: 'inner' },
      h('span', { class: 'dot', 'aria-hidden': 'true' }), h('span', { class: 'msg', text: `저장하지 않은 변경 ${n}개` }),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => this.revert() }, '되돌리기'), saveBtn));
  },
  revert() {
    this.rows = [...this.orig.entries()].map(([id, o]) => ({ id, src: o.src, dst: o.dst }));
    this.renderTable(); this.updateDirty();
  },
  async save() {
    if (this.saving || !this.loaded) return false;
    if (!this.dirtyCount()) { toast({ type: 'info', title: '바뀐 내용이 없어요' }); return true; }
    this.saving = true; this.renderSaveBar();
    const skipped = this.rows.filter(r => (r.src.trim() || r.dst.trim()) && !(r.src.trim() && r.dst.trim())).length;
    try {
      const saved = await api('/api/dict', { method: 'PUT', json: this.rows.map(r => ({ src: r.src.trim(), dst: r.dst.trim() })) });
      this.saving = false;
      this.setFromServer(saved);
      this.renderTable();
      toast({ type: 'success', title: '저장했어요. 바로 적용돼요.', body: skipped ? `읽는 법이 빈 ${skipped}줄은 빼고 저장했어요.` : null });
      if (this.runTest) this.runTest();
      if (Studio.ta) Studio.loadPreview();
      return true;
    } catch (e) {
      this.saving = false; this.renderSaveBar();
      toast({ type: 'error', title: '저장하지 못했어요', body: '다시 시도해 주세요.' });
      return false;
    }
  },
  async canLeave() {
    if (!this.dirtyCount()) return true;
    const v = await modal({
      title: '저장하지 않은 변경이 있어요', body: '이동하면 변경 내용이 사라져요.',
      actions: [
        { label: '취소', kind: 'secondary', value: 'cancel', initial: true },
        { label: '저장하지 않고 이동', kind: 'ghost', value: 'discard' },
        { label: '저장하고 이동', kind: 'primary', value: 'save' },
      ],
    });
    if (v === 'discard') { this.revert(); return true; }
    if (v === 'save') return await this.save();
    return false;
  },
};

/* =====================================================================
   16. Shortcuts modal, global keys, privacy popover
   ===================================================================== */
function showShortcuts(focus) {
  const k = (...keys) => h('span', { class: 'keys' }, keys.map(x => h('span', { class: 'kbd', text: x })));
  const sections = [
    ['스튜디오', [
      ['내 목소리로 읽기 (선택했으면 선택한 부분만)', k(MOD, '↵')], ['다른 억양으로 다시 읽기', k(MOD, '⇧', '↵')],
      ['발음 고치기 (단어를 선택하고)', k(MOD, '⇧', 'E')], ['결과 내려받기', k(MOD, '⇧', 'D')],
      ['읽기 멈추기 (다른 화면에서는 두 번)', k('Esc')], ['재생 · 일시정지', k('Space')], ['5초 앞뒤로 (파형 선택 시)', k('←', '→')],
    ]],
    ['기록', [
      ['검색', k('/')], ['위아래로 이동', k('J', 'K')], ['재생 · 일시정지', k('Enter')],
      ['선택 · 범위 선택', k('X')], ['선택 모드 · 모두 선택', h('span', { class: 'keys' }, h('span', { class: 'kbd', text: 'S' }), h('span', { class: 'kbd', text: MOD }), h('span', { class: 'kbd', text: 'A' }))],
      ['텍스트를 스튜디오로', k('E')], ['삭제 (되돌리기 가능)', k('D')], ['선택 끝내기', k('Esc')],
    ]],
    ['공통', [['발음 사전 저장', k(MOD, 'S')], ['이 도움말', k('?')]]],
  ];
  if (focus === 'history') sections.unshift(sections.splice(1, 1)[0]);
  const body = h('div', { class: 'shortcut-sections' }, sections.map(([title, items]) => h('section', null,
    h('h3', { class: 'shortcut-h', text: title }),
    h('ul', { class: 'shortcut-list' }, items.map(([l, keys]) => h('li', null, h('span', { text: l }), keys))))));
  modal({ title: '키보드 단축키', wide: true, body, actions: [{ label: '닫기', kind: 'secondary', value: 1, initial: true }] });
}

function isTyping(el) {
  if (!el) return false;
  const t = el.tagName;
  return (t === 'INPUT' && !['checkbox', 'radio', 'range', 'button'].includes(el.type)) || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
}
function isInteractive(el) {
  if (!el || el === document.body) return false;
  return isTyping(el) || /^(BUTTON|A|SELECT|INPUT)$/.test(el.tagName) || ['radio', 'slider', 'button', 'menuitem', 'checkbox'].includes(el.getAttribute('role'));
}

document.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  const mod = e.metaKey || e.ctrlKey;
  const a = document.activeElement;
  if (e.key === 'Escape') {
    if (modalOpen) return;
    if (openPop) { closePopover(); return; }
    if (onRoute('voices/new') && Wizard.W && Wizard.W.recState === 'recording') { e.preventDefault(); Wizard.stopRec(); return; }
    if (onRoute('history') && History.selecting && !isTyping(a)) { e.preventDefault(); History.setSelecting(false); return; }
    if (Synth.job) {
      // 스튜디오(또는 등록 화면)에서만 바로 멈춘다. 다른 화면에서는 실수로 긴 작업을 끄지 않게 두 번 눌러야 멈춘다
      const here = onRoute('studio') || onRoute('voices/new') || (a && a.closest && a.closest('.dock'));
      if (here || (Date.now() - (window.__escAt || 0) < 1500)) { e.preventDefault(); window.__escAt = 0; Synth.stop(); return; }
      window.__escAt = Date.now();
      toast({ type: 'info', title: '한 번 더 누르면 읽기를 멈춰요', body: '스튜디오에서 만드는 중인 음성이 있어요.', duration: 1800 });
    }
    return;
  }
  if (modalOpen) return;
  if (mod && e.shiftKey && e.key === 'Enter' && onRoute('studio')) { e.preventDefault(); Studio.retake(); return; }
  if (mod && e.key === 'Enter' && onRoute('studio')) { e.preventDefault(); Studio.generate(); return; }
  if (mod && e.shiftKey && (e.key === 'e' || e.key === 'E' || e.key === 'ㄷ') && onRoute('studio')) { e.preventDefault(); FixPron.open(); return; }
  if (mod && e.shiftKey && (e.key === 'd' || e.key === 'D' || e.key === 'ㅇ') && onRoute('studio') && Studio.result) { e.preventDefault(); Studio.download(); return; }
  if (mod && (e.key === 's' || e.key === 'S' || e.key === 'ㄴ') && onRoute('dictionary')) { e.preventDefault(); Dict.save(); return; }
  if (mod && (e.key === 'a' || e.key === 'A' || e.key === 'ㅁ') && onRoute('history') && History.selecting && !isTyping(a)) { e.preventDefault(); History.selectAll(true); return; }
  if (mod || e.altKey) return;
  if ((e.key === 's' || e.key === 'S' || e.key === 'ㄴ') && onRoute('history') && !isTyping(a) && History.el && !History.selBtn.hidden) { e.preventDefault(); History.setSelecting(!History.selecting); return; }
  if (e.key === '?' && !isTyping(a)) { e.preventDefault(); showShortcuts(onRoute('history') ? 'history' : null); return; }
  if (e.key === '/' && !isTyping(a) && onRoute('history')) { e.preventDefault(); History.search.focus(); return; }
  if (e.key === ' ' && !isInteractive(a)) {
    if (Studio.live && Studio.toggleLive()) { e.preventDefault(); return; }
    if (onRoute('voices/new') && Wizard.W && Wizard.W.step === 2 && Wizard.W.mode === 'mic' && !Wizard.W.micError && Wizard.W.recState !== 'recorded') { e.preventDefault(); Wizard.toggleRec(); return; }
    if (Player.key) { e.preventDefault(); Player.toggleCurrent(); return; }
    if (onRoute('studio') && Studio.result) { e.preventDefault(); Player.play(Studio.resultKey(), Studio.result.url).catch(() => {}); }
  }
});

function initPrivacy() {
  const btn = $('#privacy-btn');
  btn.addEventListener('click', () => openInfoPopover(btn, [
    h('h3', null, ic('i-lock'), '모든 처리는 이 맥에서 이뤄져요'),
    h('p', { text: '목소리 녹음, 입력한 텍스트, 만든 음성은 모두 이 맥에만 저장돼요. 앱은 이 맥의 브라우저와 프로그램 요청만 받아요.' }),
    h('p', { class: 'note', text: "예외: '자동 받아쓰기'를 처음 쓸 때 받아쓰기 모델(약 460MB)을 한 번 내려받아요. 녹음 파일은 보내지 않아요." }),
  ], { label: '개인정보 안내', side: 'right' }));
}

/* =====================================================================
   17. Boot
   ===================================================================== */
function boot() {
  refreshColors();
  Tip.init();
  Player.init();
  Theme.init();
  segRO.observe($('#theme-seg'));
  initPrivacy();
  $('#reconnect-btn').addEventListener('click', () => { Status.fails = 1; Status.poll(); });
  const main = $('#main');
  main.addEventListener('scroll', () => main.classList.toggle('scrolled', main.scrollTop > 4), { passive: true });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) Status.poll(); else Status.schedule(); });
  addEventListener('hashchange', () => Router.go());
  addEventListener('resize', debounce(() => { closePopover(false); positionSeg($('#theme-seg')); }, 100));
  setInterval(() => {
    if (Synth.job || Status.state === 'loading') { Status.render(false); bus.emit('tick'); }
    else if (Wizard.W && Wizard.W.asr) bus.emit('tick');
  }, 250);
  bus.on('status', (s, prev) => {
    if (Studio.el) Studio.updateCTA();
    VoicesPage.updateTryButtons && VoicesPage.updateTryButtons();
  });
  bus.on('voices', () => { if (History.el && !History.el.hidden) History.render(); });
  addEventListener('beforeunload', e => { if (Synth.job || History.zipping || (Compare && Compare.running)) { e.preventDefault(); e.returnValue = ''; } });
  Status.render(true);
  Status.poll();
  Settings.load();
  Voices.load();
  Router.go();
}
boot();
})();
