'use strict';

const state = {
  token: localStorage.getItem('token'),
  me: null,
  options: null, // choices, labels and limits from /api/options
  view: null,
  signup: {}, // answers collected before the account exists
  setup: null, // { mode: 'signup' | 'onboard' | 'edit', steps, index }
  deck: [],
  likes: [],
  likesFilter: 'all',
  matches: [],
  chatQuery: '',
  chat: null, // { matchId, profile, lastId, timer, count }
  person: null, // { profile, from, like, matchId }
  profileTab: 'strength',
  editTab: 'edit',
  filtersFrom: 'people',
  uploading: 0,
};

const HOME = 'people';
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const screenEl = () => $('#screen');

// ---- Icons (24px line icons; parts marked "cut" turn white when the icon is filled) ----

const ICONS = {
  spark: '<path d="M12 2c.6 4.8 2.2 7.4 10 10-7.8 2.6-9.4 5.2-10 10-.6-4.8-2.2-7.4-10-10 7.8-2.6 9.4-5.2 10-10Z" fill="currentColor" stroke="none"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  star: '<path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9Z"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  next: '<path d="m9 18 6-6-6-6"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path class="cut" d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
  people: '<path d="M7.5 3.5h9L21 12l-4.5 8.5h-9L3 12Z"/><path class="cut" d="M8.5 10h7M8.5 14h7"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  note: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M15.2 10.4c0-1.2-.9-2-2-2-.6 0-1 .3-1.2.6-.2-.3-.6-.6-1.2-.6-1.1 0-2 .8-2 2 0 1.6 3.2 3.6 3.2 3.6s3.2-2 3.2-3.6Z"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  users: '<circle cx="9" cy="7" r="4"/><path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.85"/>',
  filter: '<circle cx="7" cy="7" r="3"/><path d="M12 7h9M3 17h9"/><circle cx="17" cy="17" r="3"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  ruler: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  wine: '<path d="M8 22h8M12 15v7M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/>',
  smoke: '<path d="M2 12h14v4H2zM18 12h4v4h-4zM18 8c0-2.5-2-2.5-2-5M22 8c0-2.5-2-2.5-2-5"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-6h6v6"/>',
  cake: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  quote: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  locate: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  flag: '<path d="M4 22V4a1 1 0 0 1 1-1h13l-3 5 3 5H5"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  palette: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 2a10 10 0 0 0 0 20c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.3A5.7 5.7 0 0 0 22 9.7C22 5.4 17.5 2 12 2Z"/>',
  coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4"/>',
};

function icon(name, className = '') {
  const span = document.createElement('span');
  span.className = `icon ${className}`.trim();
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  return span;
}

// Fill static markup that asks for an icon via data-icon.
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    node.prepend(icon(node.dataset.icon));
    node.removeAttribute('data-icon');
  });
}

// ---- DOM helpers ----

// el('div', { class: 'x', onclick: fn }, child, 'text', ...)
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else if (k === 'style') node.style.cssText = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
}

let toastTimer;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// Closing hides the sheet after its slide-out; opening a new one cancels that.
let sheetTimer;
let sheetLocked = false;
function openSheet(content, { locked = false } = {}) {
  const sheet = $('#sheet');
  clearTimeout(sheetTimer);
  sheetLocked = locked;
  $('#sheet-body').replaceChildren(content);
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => sheet.classList.add('open'));
}

function closeSheet() {
  const sheet = $('#sheet');
  sheet.classList.remove('open');
  sheetTimer = setTimeout(() => sheet.classList.add('hidden'), 220);
}

$('#sheet').addEventListener('click', (e) => {
  if (e.target.id === 'sheet' && !sheetLocked) closeSheet();
});

function confirmSheet({ title, text, action, danger = false }) {
  return new Promise((resolve) => {
    const done = (answer) => {
      closeSheet();
      resolve(answer);
    };
    openSheet(el('div', { class: 'stack center' },
      el('h3', { class: 'display sheet-title' }, title),
      text ? el('p', { class: 'muted' }, text) : null,
      el('button', { class: `btn btn-block ${danger ? 'btn-danger' : 'btn-primary'}`, onclick: () => done(true) }, action),
      el('button', { class: 'btn btn-ghost btn-block', onclick: () => done(false) }, 'Cancel')));
  });
}

async function api(method, url, body, { raw } = {}) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let payload;
  if (raw) {
    headers['Content-Type'] = raw.type || 'application/octet-stream';
    payload = raw;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: payload });
  if (res.status === 401 && state.token) {
    logoutLocal();
    throw new Error('Your session expired. Please log in again.');
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Something went wrong');
  return data;
}

// ---- Formatting ----

const label = (group, value) => (value && state.options[group][value]) || '';

function heightLabel(cm) {
  const totalIn = Math.round(cm / 2.54);
  return `${cm} cm · ${Math.floor(totalIn / 12)}'${totalIn % 12}"`;
}

const initialOf = (p) => p.name.charAt(0).toUpperCase();
const photoUrl = (p) => p.photos?.[0]?.url || '';

// The API stores times as UTC "YYYY-MM-DD HH:MM:SS"; ISO strings pass through.
const parseTime = (s) => new Date(s.includes('T') ? s : `${s.replace(' ', 'T')}Z`);

function timeAgo(s) {
  const mins = Math.floor((Date.now() - parseTime(s)) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h`;
  if (mins < 60 * 24 * 7) return `${Math.floor(mins / 1440)}d`;
  return parseTime(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function durationWords(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${Math.floor(hours / 24)} days`;
}

const clockTime = (s) => parseTime(s).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// A photo that falls back to a warm gradient + initial if there's no image or it can't load.
function photoBox(url, className, fallbackText = '') {
  const box = el('div', { class: `photo ${className}` }, el('span', { class: 'photo-initial' }, fallbackText));
  if (url) {
    const img = el('img', { src: url, alt: '', loading: 'lazy', draggable: 'false' });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}

const avatar = (p, className = '') => photoBox(photoUrl(p), `avatar ${className}`, initialOf(p));

function emptyState(iconName, title, text, action) {
  return el('div', { class: 'empty' },
    el('div', { class: 'empty-icon' }, icon(iconName)),
    el('h2', { class: 'display' }, title),
    el('p', { class: 'muted' }, text),
    action ? el('button', { class: 'btn btn-primary', onclick: action.onclick }, action.label) : null);
}

// ---- Full profile (Bumble-style: photo with name, then cards, then the decision buttons) ----

function basicsChips(p) {
  const chips = [
    p.height_cm && ['ruler', heightLabel(p.height_cm)],
    p.job_title && ['briefcase', p.job_title],
    p.education && ['cap', label('EDUCATION', p.education)],
    p.looking_for && ['search', label('LOOKING_FOR', p.looking_for)],
    p.drinking && ['wine', `Drinks: ${label('HABITS', p.drinking)}`],
    p.smoking && ['smoke', `Smokes: ${label('HABITS', p.smoking)}`],
    p.kids && ['smile', label('KIDS', p.kids)],
  ].filter(Boolean);
  return chips.map(([i, t]) => el('span', { class: 'chip' }, icon(i), t));
}

function infoCard(title, ...content) {
  return el('section', { class: 'info-card' }, el('h3', {}, title), ...content);
}

/*
 * actions (all optional):
 *   onNote(item)            – "Note" buttons on photos/prompts (like with a comment)
 *   onPass, onLike, onSuper – the ✕ / ★ / ♥ row at the end
 *   onBlock, onReport       – safety links under it
 */
function renderProfile(p, actions = {}) {
  const photos = [...p.photos];
  const prompts = [...p.prompts];
  const noteBtn = (item, cls = '') =>
    actions.onNote
      ? el('button', {
        class: `note-btn ${cls}`,
        onclick: (e) => {
          e.stopPropagation();
          actions.onNote(item);
        },
      }, icon('note'), 'Note')
      : null;
  const photoBlock = (ph, hero = false) =>
    el('figure', { class: `p-photo ${hero ? 'hero' : ''}` },
      photoBox(ph?.url, 'fill', initialOf(p)),
      hero
        ? el('figcaption', {},
          el('h2', {}, `${p.name}, ${p.age}`),
          p.job_title ? el('p', {}, p.job_title) : null)
        : null,
      ph ? noteBtn({ type: 'photo', photo_id: ph.id, url: ph.url }) : null);
  const promptBlock = (pr) =>
    el('section', { class: 'info-card prompt' },
      el('h3', {}, pr.prompt),
      el('p', { class: 'p-a' }, pr.answer),
      noteBtn({ type: 'prompt', prompt: pr.prompt, answer: pr.answer }, 'inline'));

  const parts = [photoBlock(photos.shift(), true)];
  if (p.bio) parts.push(infoCard('About me', el('p', { class: 'p-bio' }, p.bio)));
  const chips = basicsChips(p);
  if (chips.length) parts.push(infoCard('My basics', el('div', { class: 'chips' }, chips)));
  while (photos.length || prompts.length) {
    if (prompts.length) parts.push(promptBlock(prompts.shift()));
    if (photos.length) parts.push(photoBlock(photos.shift()));
  }
  const whereChips = [
    p.city && el('span', { class: 'chip' }, `Lives in ${p.city}`),
    p.hometown && el('span', { class: 'chip' }, `From ${p.hometown}`),
    p.distance_km ? el('span', { class: 'chip' }, `${p.distance_km} km away`) : null,
  ].filter(Boolean);
  if (p.city) {
    parts.push(infoCard('My location',
      el('p', { class: 'loc' }, icon('pin'), p.city.split(',').pop().trim()),
      el('div', { class: 'chips' }, whereChips)));
  }

  if (actions.onPass || actions.onLike) {
    const left = state.me?.super_swipes_left ?? 0;
    parts.push(el('div', { class: 'decide' },
      actions.onPass ? el('button', { class: 'round dark', 'aria-label': 'Pass', onclick: actions.onPass }, icon('x')) : el('span'),
      actions.onSuper
        ? el('button', { class: 'round accent big', 'aria-label': `SuperSwipe (${left} left today)`, onclick: actions.onSuper },
          icon('star'), el('span', { class: 'round-count' }, String(left)))
        : el('span'),
      actions.onLike ? el('button', { class: 'round dark', 'aria-label': 'Like', onclick: actions.onLike }, icon('heart')) : el('span')));
  }
  if (actions.onBlock || actions.onReport) {
    parts.push(el('div', { class: 'safety-links' },
      actions.onBlock ? el('button', { class: 'link-plain', onclick: actions.onBlock }, 'Block') : null,
      actions.onReport ? el('button', { class: 'link-plain danger', onclick: actions.onReport }, 'Report') : null));
  }
  return el('article', { class: 'profile' }, parts);
}

// What someone liked on *my* profile.
function likedContext(like) {
  if (like.super) return 'SuperSwiped you';
  if (!like.item) return 'Liked you';
  return like.item.type === 'photo' ? 'Liked your photo' : 'Liked your prompt';
}

function likedItemPreview(item, owner) {
  if (!item) return null;
  if (item.type === 'photo') return el('div', { class: 'item-preview photo-preview' }, photoBox(item.url, 'fill', initialOf(owner)));
  return el('div', { class: 'item-preview prompt-preview' }, el('p', { class: 'p-q' }, item.prompt), el('p', { class: 'p-a small' }, item.answer));
}

// ---- Navigation ----

const TAB_VIEWS = ['profile', 'discover', 'people', 'likes', 'matches'];

function show(view) {
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${view}`));
  state.view = view;
  $('#tabbar').classList.toggle('hidden', !TAB_VIEWS.includes(view));
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view !== 'chat') stopChatPolling();
  screenEl().scrollTop = 0;
  if (view === 'people') loadDeck();
  if (view === 'discover') loadDiscover();
  if (view === 'likes') loadLikes();
  if (view === 'matches') loadMatches();
  if (view === 'profile') renderMyProfile();
  if (view === 'edit') renderEditProfile();
  if (view === 'filters') renderFilters();
  if (TAB_VIEWS.includes(view)) refreshChrome();
}

$$('.tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
$$('[data-go]').forEach((b) =>
  b.addEventListener('click', () => (b.dataset.go === 'signup' ? startSignup() : show(b.dataset.go))),
);
$$('[data-open=filters]').forEach((b) => b.addEventListener('click', () => openFilters()));

async function goHome() {
  if (!state.me.terms_accepted) await termsGate();
  if (state.me.profile_complete) show(HOME);
  else startSetup('onboard');
}

// Badges, the Profile tab avatar, and a fresh copy of my profile.
async function refreshChrome() {
  $('#tab-avatar').replaceChildren(avatar(state.me));
  try {
    const [{ likes }, { matches }, { user }] = await Promise.all([
      api('GET', '/api/likes'),
      api('GET', '/api/matches'),
      api('GET', '/api/me'),
    ]);
    state.me = user;
    const badge = $('#likes-badge');
    badge.textContent = likes.length > 9 ? '9+' : likes.length;
    badge.classList.toggle('hidden', likes.length === 0);
    const yourMove = matches.some((m) => !m.expired && (!m.last_message || m.last_sender_id !== state.me.id));
    $('#chats-dot').classList.toggle('hidden', !yourMove);
  } catch {
    /* best-effort */
  }
}

// ---- Welcome & log in ----

$('#go-signup').addEventListener('click', startSignup);
$('#go-login').addEventListener('click', () => show('login'));

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  try {
    const { token, user } = await api('POST', '/api/login', Object.fromEntries(new FormData(e.target)));
    signedIn(token, user);
    e.target.reset();
    goHome();
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

function signedIn(token, user) {
  state.token = token;
  state.me = user;
  localStorage.setItem('token', token);
}

function logoutLocal() {
  state.token = null;
  state.me = null;
  localStorage.removeItem('token');
  show('welcome');
}

async function logout() {
  if (!(await confirmSheet({ title: 'Log out?', action: 'Log out', danger: true }))) return;
  try { await api('POST', '/api/logout'); } catch { /* already logged out */ }
  logoutLocal();
}

// ---- Terms & Conditions ----

// "I agree" tick box. Links open the full pages in a new tab so nothing typed is lost.
function termsCheckbox(id) {
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  return el('label', { class: 'consent' },
    el('input', {
      type: 'checkbox',
      id,
      // Ticking the box clears a "please tick the box" message.
      onchange: () => $$('#setup-error, #sheet .error').forEach((e) => (e.textContent = '')),
    }),
    el('span', { class: 'consent-box' }, icon('check')),
    el('span', {}, "I'm 18 or older and I agree to the ", link('terms.html', 'Terms & Conditions'), ' and ', link('privacy.html', 'Privacy Policy'), '.'));
}

// Accounts that haven't accepted the current Terms (older accounts, or after the Terms change)
// must accept before continuing. The sheet can't be dismissed, only accepted or logged out of.
function termsGate() {
  return new Promise((resolve) => {
    const error = el('p', { class: 'error' });
    const accept = el('button', { class: 'btn btn-primary btn-block' }, 'Accept and continue');
    accept.addEventListener('click', async () => {
      if (!$('#gate-terms').checked) {
        error.textContent = 'Please tick the box to continue';
        return;
      }
      accept.disabled = true;
      try {
        ({ user: state.me } = await api('POST', '/api/me/accept-terms', { version: state.options.TERMS_VERSION }));
        closeSheet();
        resolve();
      } catch (err) {
        error.textContent = err.message;
        accept.disabled = false;
      }
    });
    openSheet(el('div', { class: 'stack' },
      el('div', { class: 'setup-icon' }, icon('shield')),
      el('h3', { class: 'display sheet-title' }, 'Please review our Terms'),
      el('p', { class: 'muted' }, 'To keep using Spark, please read and accept our Terms & Conditions and Privacy Policy. They explain our community rules, how we keep you safe, and how we handle your data.'),
      termsCheckbox('gate-terms'),
      error,
      accept,
      el('button', { class: 'btn btn-ghost btn-block', onclick: () => { closeSheet(); logoutLocal(); } }, 'Log out')), { locked: true });
  });
}

// ---- Sign-up + profile wizard ----

const SIGNUP_STEPS = ['name', 'birthday', 'gender', 'interest', 'account'];
const PROFILE_STEPS = ['photos', 'prompts', 'location', 'details'];

function startSignup() {
  state.signup = {};
  state.setup = { mode: 'signup', steps: [...SIGNUP_STEPS, ...PROFILE_STEPS], index: 0 };
  show('setup');
  renderStep();
}

function startSetup(mode, step) {
  const steps = mode === 'edit' ? [step] : PROFILE_STEPS;
  const first = PROFILE_STEPS.find((s) => state.me.missing.includes(s)) || 'details';
  state.setup = { mode, steps, index: mode === 'edit' ? 0 : steps.indexOf(first) };
  show('setup');
  renderStep();
}

function renderStep() {
  const { mode, steps, index } = state.setup;
  const def = STEP_DEFS[steps[index]];
  const editing = mode === 'edit';
  $('#setup-progress').classList.toggle('invisible', editing);
  $('#setup-count').textContent = editing ? '' : `${index + 1}/${steps.length}`;
  $('#setup-progress div').style.width = `${((index + 1) / steps.length) * 100}%`;
  $('#setup-icon').replaceChildren(icon(def.icon));
  $('#setup-title').textContent = def.title;
  $('#setup-subtitle').textContent = typeof def.subtitle === 'function' ? def.subtitle() : def.subtitle;
  $('#setup-error').textContent = '';
  // Once the account exists there's no going back into the sign-up questions.
  const canGoBack = editing || (mode === 'signup' && steps[index - 1] !== 'account') || (mode === 'onboard' && index > 0);
  $('#setup-back').classList.toggle('invisible', !canGoBack);
  $('#setup-next').textContent = editing ? 'Save' : index === steps.length - 1 ? 'Finish' : 'Next';
  $('#setup-body').replaceChildren(def.render());
  screenEl().scrollTop = 0;
  $('#setup-body').querySelector('input:not([type=radio]):not([type=file])')?.focus();
}

$('#setup-back').addEventListener('click', () => {
  const { mode, index } = state.setup;
  if (mode === 'edit') return show('edit');
  if (index === 0) return show('welcome');
  state.setup.index -= 1;
  renderStep();
});

// Enter moves to the next question (except in multi-line answers).
$('#setup-body').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
    e.preventDefault();
    $('#setup-next').click();
  }
});

$('#setup-next').addEventListener('click', async () => {
  const { mode, steps, index } = state.setup;
  const button = $('#setup-next');
  $('#setup-error').textContent = '';
  button.disabled = true;
  try {
    await STEP_DEFS[steps[index]].save();
    if (mode === 'edit') {
      toast('Saved');
      return show('edit');
    }
    if (index < steps.length - 1) {
      state.setup.index += 1;
      return renderStep();
    }
    if (state.me.profile_complete) {
      toast(`Welcome to Spark, ${state.me.name}!`);
      return show(HOME);
    }
    // Something required was skipped; jump back to it.
    state.setup.index = steps.indexOf(PROFILE_STEPS.find((s) => state.me.missing.includes(s)));
    renderStep();
  } catch (err) {
    $('#setup-error').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

function optionList(name, choices, selected) {
  return el('div', { class: 'options' },
    Object.entries(choices).map(([value, text]) =>
      el('label', { class: 'option' },
        el('input', { type: 'radio', name, value, checked: value === selected }),
        el('span', {}, text),
        el('span', { class: 'radio-dot' }, icon('check')))));
}

const checkedValue = (name) => $(`#setup-body input[name=${name}]:checked`)?.value;

function ageFromBirthdate(value) {
  const [y, m, d] = value.split('-').map(Number);
  const now = new Date();
  let age = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age -= 1;
  return age;
}

const STEP_DEFS = {
  // -- Sign-up questions (answers kept locally until the account step) --
  name: {
    icon: 'user',
    title: "What's your first name?",
    subtitle: "This is how it'll appear on your profile.",
    render: () => el('input', { class: 'input-xl', id: 'f-name', maxlength: 50, autocomplete: 'given-name', placeholder: 'First name', value: state.signup.name || '' }),
    async save() {
      const name = $('#f-name').value.trim();
      if (!name) throw new Error('Please enter your first name');
      state.signup.name = name;
    },
  },
  birthday: {
    icon: 'cake',
    title: "When's your birthday?",
    subtitle: 'Your profile shows your age, never your birthday.',
    render() {
      const max = new Date();
      max.setFullYear(max.getFullYear() - 18);
      const input = el('input', { class: 'input-xl', id: 'f-birthdate', type: 'date', min: '1920-01-01', max: max.toISOString().slice(0, 10), value: state.signup.birthdate || '' });
      const preview = el('p', { class: 'age-preview' });
      const update = () => {
        preview.textContent = input.value ? `You're ${ageFromBirthdate(input.value)}` : '';
      };
      input.addEventListener('input', update);
      update();
      return el('div', {}, input, preview);
    },
    async save() {
      const value = $('#f-birthdate').value;
      if (!value) throw new Error('Please enter your date of birth');
      if (ageFromBirthdate(value) < 18) throw new Error('You must be 18 or older to use Spark');
      state.signup.birthdate = value;
    },
  },
  gender: {
    icon: 'users',
    title: 'Which gender best describes you?',
    subtitle: 'We match daters using three broad gender groups.',
    render: () => optionList('gender', state.options.GENDERS, state.signup.gender),
    async save() {
      const value = checkedValue('gender');
      if (!value) throw new Error('Please choose one');
      state.signup.gender = value;
    },
  },
  interest: {
    icon: 'heart',
    title: 'Who would you like to meet?',
    subtitle: "You'll only see people who'd also like to meet you. You can change this any time.",
    render: () => optionList('interested_in', state.options.INTERESTS, state.signup.interested_in),
    async save() {
      const value = checkedValue('interested_in');
      if (!value) throw new Error('Please choose one');
      state.signup.interested_in = value;
    },
  },
  account: {
    icon: 'mail',
    title: 'Create your login',
    subtitle: 'Last step before your profile.',
    render: () =>
      el('div', { class: 'stack' },
        el('label', { class: 'field' }, 'Email', el('input', { id: 'f-email', type: 'email', autocomplete: 'email', value: state.signup.email || '' })),
        el('label', { class: 'field' }, 'Password', el('input', { id: 'f-password', type: 'password', autocomplete: 'new-password', placeholder: 'At least 8 characters' })),
        termsCheckbox('f-terms')),
    async save() {
      const email = $('#f-email').value.trim();
      const password = $('#f-password').value;
      state.signup.email = email;
      if (!$('#f-terms').checked) throw new Error('Please tick the box to accept the Terms & Conditions and Privacy Policy');
      const { token, user } = await api('POST', '/api/signup', { ...state.signup, email, password, accept_terms: true });
      signedIn(token, user);
    },
  },

  // -- Profile steps (saved to the server as you go) --
  photos: {
    icon: 'camera',
    title: 'Add your best photos',
    subtitle: () => `Add at least ${state.options.LIMITS.minPhotos}. Your first photo is the one people see first.`,
    render: renderPhotoGrid,
    async save() {
      if (state.uploading) throw new Error('Hang on, still uploading…');
      if (state.me.photos.length < state.options.LIMITS.minPhotos) {
        throw new Error(`Please add at least ${state.options.LIMITS.minPhotos} photos`);
      }
    },
  },
  prompts: {
    icon: 'quote',
    title: 'Show off your personality',
    subtitle: () => `Answer up to ${state.options.LIMITS.maxPrompts} prompts. They're the easiest way to start a conversation.`,
    render: renderPromptEditor,
    async save() {
      const rows = [...$$('.prompt-slot')].map((row) => ({
        prompt: row.querySelector('select').value,
        answer: row.querySelector('textarea').value.trim(),
      }));
      for (const r of rows) {
        if (r.prompt && !r.answer) throw new Error(`Please answer "${r.prompt}" or remove it`);
      }
      const prompts = rows.filter((r) => r.prompt);
      if (prompts.length < state.options.LIMITS.minPrompts) throw new Error('Please answer at least one prompt');
      ({ user: state.me } = await api('PUT', '/api/me/prompts', { prompts }));
    },
  },
  location: {
    icon: 'pin',
    title: 'Where do you live?',
    subtitle: 'Only your area and distance are shown to others, never your exact location.',
    render: renderLocationStep,
    async save() {
      const city = $('#city-input').value.trim();
      if (!city) throw new Error('Please use your current location or type your area');
      const body = { city, hometown: $('#hometown-input').value.trim() };
      if (locationDraft) Object.assign(body, locationDraft);
      ({ user: state.me } = await api('PUT', '/api/me', body));
    },
  },
  details: {
    icon: 'sliders',
    title: 'A little more about you',
    subtitle: 'All optional, but people can filter on these, and complete profiles get more likes.',
    render: renderDetailsForm,
    async save() {
      const data = Object.fromEntries(new FormData($('#details-form')));
      ({ user: state.me } = await api('PUT', '/api/me', data));
    },
  },
};

// Photos

function renderPhotoGrid() {
  const { maxPhotos } = state.options.LIMITS;
  const slots = state.me.photos.map((photo, i) =>
    el('div', { class: 'slot filled' },
      photoBox(photo.url, 'fill', '?'),
      i === 0 ? el('span', { class: 'main-tag' }, 'Main') : null,
      el('button', { class: 'slot-remove', type: 'button', 'aria-label': 'Remove photo', onclick: () => removePhoto(photo.id) }, icon('x'))));
  for (let i = 0; i < state.uploading && slots.length < maxPhotos; i++) {
    slots.push(el('div', { class: 'slot loading' }, el('span', { class: 'spinner' })));
  }
  while (slots.length < maxPhotos) {
    slots.push(el('button', { class: 'slot empty', type: 'button', 'aria-label': 'Add photo', onclick: () => $('#photo-input').click() }, el('span', { class: 'slot-plus' }, icon('plus'))));
  }
  return el('div', { class: 'photo-grid', id: 'photo-grid' }, slots);
}

function refreshPhotoGrid() {
  $('#photo-grid')?.replaceWith(renderPhotoGrid());
}

async function removePhoto(id) {
  try {
    ({ user: state.me } = await api('DELETE', `/api/me/photos/${id}`));
    refreshPhotoGrid();
  } catch (err) {
    $('#setup-error').textContent = err.message;
  }
}

// Shrink big phone photos to at most 1200px on the long side before uploading.
async function resizeImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = el('canvas', { width: Math.round(bitmap.width * scale), height: Math.round(bitmap.height * scale) });
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

$('#photo-input').addEventListener('change', async (e) => {
  const room = state.options.LIMITS.maxPhotos - state.me.photos.length;
  const files = [...e.target.files].slice(0, room);
  e.target.value = '';
  $('#setup-error').textContent = '';
  state.uploading = files.length;
  refreshPhotoGrid();
  for (const file of files) {
    try {
      const blob = await resizeImage(file).catch(() => {
        throw new Error(`Couldn't read "${file.name}". Please use a JPG or PNG photo.`);
      });
      ({ user: state.me } = await api('POST', '/api/me/photos', undefined, { raw: blob }));
    } catch (err) {
      $('#setup-error').textContent = err.message;
    }
    state.uploading -= 1;
    refreshPhotoGrid();
  }
});

// Prompts

function renderPromptEditor() {
  const { maxPrompts } = state.options.LIMITS;
  const slots = [];
  for (let i = 0; i < maxPrompts; i++) {
    const current = state.me.prompts[i] || { prompt: '', answer: '' };
    const select = el('select', { 'aria-label': `Prompt ${i + 1}` },
      el('option', { value: '' }, i === 0 ? 'Select a prompt' : 'Select a prompt (optional)'),
      state.options.PROMPTS.map((p) => el('option', { value: p, selected: p === current.prompt }, p)));
    const answer = el('textarea', { rows: 2, maxlength: 250, placeholder: 'Write your answer…' });
    answer.value = current.answer;
    const counter = el('span', { class: 'counter' });
    const slot = el('div', { class: 'prompt-slot' }, select, answer, counter);
    const update = () => {
      answer.disabled = !select.value;
      slot.classList.toggle('filled', Boolean(select.value));
      counter.textContent = select.value ? `${answer.value.length}/250` : '';
    };
    select.addEventListener('change', () => {
      update();
      if (select.value) answer.focus();
    });
    answer.addEventListener('input', update);
    update();
    slots.push(slot);
  }
  return el('div', { class: 'prompt-editor' }, slots);
}

// Location

let locationDraft = null; // { latitude, longitude } found this session

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=en&lat=${lat}&lon=${lon}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('lookup failed');
  const a = (await res.json()).address || {};
  const area = a.suburb || a.neighbourhood || a.city_district || a.quarter;
  const city = a.city || a.town || a.village || a.county || a.state;
  return [...new Set([area, city].filter(Boolean))].join(', ');
}

function renderLocationStep() {
  locationDraft = null;
  const status = el('p', { class: 'status' },
    state.me.latitude !== null ? '✓ Location saved' : 'Sharing your location lets us show how far away people are.');
  const input = el('input', { id: 'city-input', maxlength: 80, placeholder: 'e.g. Indiranagar, Bengaluru', value: state.me.city });
  const hometown = el('input', { id: 'hometown-input', maxlength: 80, placeholder: 'e.g. Guwahati', value: state.me.hometown || '' });
  const button = el('button', { class: 'btn btn-outline btn-block', type: 'button' }, icon('locate'), 'Use my current location');

  button.addEventListener('click', () => {
    if (!navigator.geolocation) {
      status.textContent = "Your browser can't share location. Type your area instead.";
      return;
    }
    status.textContent = 'Finding you…';
    button.disabled = true;
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        locationDraft = { latitude: coords.latitude, longitude: coords.longitude };
        button.disabled = false;
        status.textContent = '✓ Location found';
        try {
          const place = await reverseGeocode(coords.latitude, coords.longitude);
          if (place) input.value = place;
          else status.textContent = '✓ Location found. Please type your area name.';
        } catch {
          status.textContent = '✓ Location found. Please type your area name.';
        }
      },
      (err) => {
        button.disabled = false;
        status.textContent = err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. You can type your area instead.'
          : "Couldn't get your location. You can type your area instead.";
      },
      { enableHighAccuracy: false, timeout: 15000 },
    );
  });

  return el('div', { class: 'stack' },
    button,
    status,
    el('label', { class: 'field' }, 'Where you live', input),
    el('label', { class: 'field' }, 'Where you\'re from (optional)', hometown));
}

// Details

function selectField(name, text, choices, value, emptyLabel = 'Prefer not to say') {
  return el('label', { class: 'field' }, text,
    el('select', { name },
      emptyLabel === null ? null : el('option', { value: '' }, emptyLabel),
      Object.entries(choices).map(([v, t]) => el('option', { value: v, selected: v === value }, t))));
}

function heightChoices() {
  const out = {};
  for (let cm = 140; cm <= 215; cm++) out[cm] = heightLabel(cm);
  return out;
}

function renderDetailsForm() {
  const me = state.me;
  const o = state.options;
  const bio = el('textarea', { name: 'bio', rows: 3, maxlength: 500, placeholder: 'A few words about yourself' });
  bio.value = me.bio;
  return el('form', { id: 'details-form', class: 'stack', onsubmit: (e) => e.preventDefault() },
    el('div', { class: 'row' },
      el('label', { class: 'field' }, 'First name', el('input', { name: 'name', required: true, maxlength: 50, value: me.name })),
      selectField('gender', 'Gender', o.GENDERS, me.gender, null)),
    el('div', { class: 'row' },
      selectField('height_cm', 'Height', heightChoices(), me.height_cm ? String(me.height_cm) : ''),
      el('label', { class: 'field' }, 'Job title', el('input', { name: 'job_title', maxlength: 60, value: me.job_title, placeholder: 'e.g. Designer' }))),
    selectField('looking_for', 'Looking for', o.LOOKING_FOR, me.looking_for),
    selectField('education', 'Education', o.EDUCATION, me.education),
    el('div', { class: 'row' },
      selectField('drinking', 'Drinking', o.HABITS, me.drinking),
      selectField('smoking', 'Smoking', o.HABITS, me.smoking)),
    selectField('kids', 'Children', o.KIDS, me.kids),
    el('label', { class: 'field' }, 'About me', bio));
}

// ---- Liking, passing, SuperSwipes ----

function itemForApi(item) {
  if (!item) return undefined;
  return item.type === 'photo' ? { type: 'photo', photo_id: item.photo_id } : { type: 'prompt', prompt: item.prompt };
}

// Sends one decision. Returns the API result, or null if it failed (after telling the user).
async function swipe(profile, liked, { item, comment = '', superSwipe = false } = {}) {
  try {
    const result = await api('POST', '/api/swipes', { target_id: profile.id, liked, comment, item: itemForApi(item), super: superSwipe || undefined });
    if (typeof result.super_swipes_left === 'number') state.me.super_swipes_left = result.super_swipes_left;
    if (result.matched) openMatch(result.match_id, result.profile);
    else if (superSwipe) toast(`SuperSwipe sent to ${profile.name} ⭐`);
    else if (liked) toast(`Like sent to ${profile.name}`);
    return result;
  } catch (err) {
    toast(err.message);
    return null;
  }
}

function openNoteSheet(profile, item, onSend) {
  const preview = item.type === 'photo'
    ? el('div', { class: 'item-preview photo-preview large' }, photoBox(item.url, 'fill', initialOf(profile)))
    : el('div', { class: 'item-preview prompt-preview' }, el('p', { class: 'p-q' }, item.prompt), el('p', { class: 'p-a' }, item.answer));
  const input = el('textarea', { rows: 2, maxlength: 300, placeholder: `Say something to ${profile.name}…` });
  const send = el('button', { class: 'btn btn-primary btn-block' }, icon('heart'), 'Like with note');
  send.addEventListener('click', () => {
    send.disabled = true;
    closeSheet();
    onSend(input.value.trim());
  });
  openSheet(el('div', { class: 'stack note-sheet' },
    el('h3', { class: 'display sheet-title center' }, `Send ${profile.name} a note`),
    preview,
    input,
    send,
    el('p', { class: 'fine center' }, 'Notes are sent with your like. If you match, it starts your chat.')));
  setTimeout(() => input.focus(), 250);
}

// Actions shared by every place a full profile is shown with decision buttons.
function decisionActions(profile, after) {
  const decide = async (liked, opts) => {
    const result = await swipe(profile, liked, opts);
    if (result) after({ ...result, liked });
  };
  return {
    onNote: (item) => openNoteSheet(profile, item, (comment) => decide(true, { item, comment })),
    onPass: () => decide(false),
    onLike: () => decide(true),
    onSuper: () => {
      if (!state.me.super_swipes_left) return toast(`You've used today's ${state.options.LIMITS.superSwipesPerDay} SuperSwipes`);
      decide(true, { superSwipe: true });
    },
    onBlock: () => blockUser(profile, () => after({ removed: true })),
    onReport: () => reportUser(profile, () => after({ removed: true })),
  };
}

// ---- Safety: block & report ----

async function blockUser(profile, done) {
  const ok = await confirmSheet({
    title: `Block ${profile.name}?`,
    text: "You won't see each other anywhere on Spark, and any match or chat will be removed.",
    action: 'Block',
    danger: true,
  });
  if (!ok) return;
  try {
    await api('POST', `/api/users/${profile.id}/block`);
    toast(`${profile.name} is blocked`);
    done();
  } catch (err) {
    toast(err.message);
  }
}

function reportUser(profile, done) {
  const details = el('textarea', { rows: 3, maxlength: 1000, placeholder: 'Tell us what happened (optional)' });
  const error = el('p', { class: 'error' });
  const submit = el('button', { class: 'btn btn-danger btn-block' }, icon('flag'), 'Report');
  const list = optionList('report-reason', state.options.REPORT_REASONS, null);
  submit.addEventListener('click', async () => {
    const reason = list.querySelector('input:checked')?.value;
    if (!reason) {
      error.textContent = 'Please choose a reason';
      return;
    }
    submit.disabled = true;
    try {
      await api('POST', `/api/users/${profile.id}/report`, { reason, details: details.value.trim() });
      closeSheet();
      toast(`Thanks for telling us. ${profile.name} is now blocked.`);
      done();
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });
  openSheet(el('div', { class: 'stack' },
    el('h3', { class: 'display sheet-title' }, `Report ${profile.name}`),
    el('p', { class: 'muted small' }, "Your report is private. We'll also block them so you won't see each other again."),
    list,
    details,
    error,
    submit));
}

// ---- People (one profile at a time) ----

function skeleton() {
  return el('div', { class: 'skeleton' }, el('div', { class: 'sk sk-photo' }), el('div', { class: 'sk sk-card' }), el('div', { class: 'sk sk-card' }));
}

async function loadDeck() {
  $('#deck').replaceChildren(skeleton());
  try {
    ({ profiles: state.deck } = await api('GET', '/api/discover'));
  } catch (err) {
    state.deck = [];
    toast(err.message);
  }
  renderDeck();
}

function renderDeck() {
  const deck = $('#deck');
  const profile = state.deck[0];
  if (!profile) {
    deck.replaceChildren(emptyState('people', "You've seen everyone for now", 'New people join every day. Widen your filters to see more people now.', {
      label: 'Adjust filters',
      onclick: () => openFilters(),
    }));
    return;
  }
  const card = renderProfile(profile, decisionActions(profile, (result) => nextInDeck(result)));
  card.classList.add('enter');
  enableSwipe(card, profile);
  deck.replaceChildren(card);
}

async function nextInDeck(result) {
  $('#deck .profile')?.classList.add(result.liked ? 'leave-like' : 'leave-pass');
  await new Promise((r) => setTimeout(r, 260));
  state.deck.shift();
  screenEl().scrollTop = 0;
  if (state.deck.length) renderDeck();
  else loadDeck();
}

// Drag the top photo sideways to like (right) or pass (left).
function enableSwipe(card, profile) {
  const hero = card.querySelector('.p-photo.hero');
  let start = null;
  hero.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    start = { x: e.clientX, y: e.clientY };
    hero.setPointerCapture(e.pointerId);
  });
  hero.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    if (Math.abs(dx) < 8) return;
    card.style.transition = 'none';
    card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
    hero.dataset.hint = dx > 0 ? 'like' : 'pass';
    hero.style.setProperty('--hint', Math.min(1, Math.abs(dx) / 120));
  });
  const end = async (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    start = null;
    card.style.transition = '';
    delete hero.dataset.hint;
    if (Math.abs(dx) > 110) {
      card.style.transform = `translateX(${dx > 0 ? 500 : -500}px) rotate(${dx > 0 ? 20 : -20}deg)`;
      const result = await swipe(profile, dx > 0);
      if (result) {
        state.deck.shift();
        screenEl().scrollTop = 0;
        if (state.deck.length) renderDeck();
        else loadDeck();
      } else {
        card.style.transform = '';
      }
    } else {
      card.style.transform = '';
    }
  };
  hero.addEventListener('pointerup', end);
  hero.addEventListener('pointercancel', end);
}

document.addEventListener('keydown', (e) => {
  if (state.view !== 'people' || !$('#sheet').classList.contains('hidden') || !$('#match-modal').classList.contains('hidden')) return;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
  const btns = $$('#deck .decide .round');
  if (e.key === 'ArrowLeft') btns[0]?.click();
  if (e.key === 'ArrowUp') btns[1]?.click();
  if (e.key === 'ArrowRight') btns[2]?.click();
});

// ---- Discover (daily recommendations) ----

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight - now;
}

function recCard(p) {
  const heart = el('button', { class: 'rec-heart', 'aria-label': `Like ${p.name}` }, icon('heart'));
  const cardEl = el('div', { class: 'rec-card', role: 'button', tabindex: 0 },
    el('div', { class: 'rec-photo' }, photoBox(photoUrl(p), 'fill', initialOf(p))),
    el('div', { class: 'rec-foot' },
      el('div', {},
        el('strong', {}, `${p.name}, ${p.age}`),
        p.common_ground?.[0] ? el('p', { class: 'rec-why' }, icon('spark'), p.common_ground[0]) : null),
      heart));
  heart.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (await swipe(p, true)) {
      cardEl.classList.add('liked');
      setTimeout(() => cardEl.remove(), 300);
    }
  });
  const open = () => openPerson(p, { from: 'discover' });
  cardEl.addEventListener('click', open);
  cardEl.addEventListener('keydown', (e) => e.key === 'Enter' && open());
  return cardEl;
}

async function loadDiscover() {
  $('#refresh-pill').textContent = `New picks in ${durationWords(msUntilMidnight())}`;
  const body = $('#discover-body');
  body.replaceChildren(el('div', { class: 'carousel' }, el('div', { class: 'sk sk-rec' }), el('div', { class: 'sk sk-rec' })));
  let data = { recommended: [], nearby: [] };
  try {
    data = await api('GET', '/api/recommended');
  } catch (err) {
    toast(err.message);
  }
  if (!data.recommended.length) {
    body.replaceChildren(emptyState('compass', 'No picks right now', 'Check back tomorrow for fresh recommendations, or widen your filters.', {
      label: 'Adjust filters',
      onclick: () => openFilters(),
    }));
    return;
  }
  body.replaceChildren(
    el('h2', { class: 'section-title' }, 'Recommended for you'),
    el('div', { class: 'carousel' }, data.recommended.map(recCard)),
    el('p', { class: 'fine pad-x why-line' }, icon('info'), 'Based on your profile and what you have in common'),
    data.nearby.length ? el('h2', { class: 'section-title' }, 'Near you') : null,
    data.nearby.length ? el('div', { class: 'carousel' }, data.nearby.map(recCard)) : null,
  );
}

$('#discover-help').addEventListener('click', () =>
  openSheet(el('div', { class: 'stack' },
    el('h3', { class: 'display sheet-title' }, 'How Discover works'),
    el('p', { class: 'muted' }, 'Every day we pick people you have the most in common with: what you\'re looking for, the prompts you both answered, where you live and more. Picks refresh at midnight.'),
    el('button', { class: 'btn btn-primary btn-block', onclick: closeSheet }, 'Got it'))));

// ---- Liked You ----

const LIKE_FILTERS = {
  all: { label: 'All', test: () => true },
  notes: { label: 'Notes', test: (l) => Boolean(l.comment) },
  super: { label: 'SuperSwipes', test: (l) => l.super },
  new: { label: 'New', test: (l) => Date.now() - parseTime(l.liked_at) < 24 * 3600 * 1000 },
  nearby: { label: 'Nearby', test: (l) => l.profile.distance_km !== null && l.profile.distance_km <= 10 },
};

async function loadLikes() {
  $('#likes-grid').replaceChildren(el('div', { class: 'sk sk-tile' }), el('div', { class: 'sk sk-tile' }));
  try {
    ({ likes: state.likes } = await api('GET', '/api/likes'));
  } catch (err) {
    state.likes = [];
    toast(err.message);
  }
  renderLikes();
}

function renderLikes() {
  $('#likes-chips').replaceChildren(
    ...Object.entries(LIKE_FILTERS).map(([key, f]) => {
      const active = state.likesFilter === key;
      return el('button', {
        class: `filter-chip ${active ? 'active' : ''}`,
        onclick: () => {
          state.likesFilter = key;
          renderLikes();
        },
      }, active ? icon('check') : null, `${f.label} • ${state.likes.filter(f.test).length}`);
    }),
  );
  const grid = $('#likes-grid');
  const shown = state.likes.filter(LIKE_FILTERS[state.likesFilter].test);
  if (!shown.length) {
    grid.replaceChildren(state.likes.length
      ? emptyState('heart', `No ${LIKE_FILTERS[state.likesFilter].label.toLowerCase()} likes yet`, 'Try another filter above.')
      : el('div', { class: 'boost' },
        el('div', { class: 'boost-avatar' }, avatar(state.me, 'xxl'), el('span', { class: 'boost-badge' }, icon('spark'))),
        el('h2', { class: 'display' }, 'Get noticed by more people'),
        el('p', { class: 'muted' }, 'Profiles with six photos and three thoughtful prompts get more likes. Make yours stand out.'),
        el('button', { class: 'btn btn-primary btn-block', onclick: () => show('edit') }, 'Improve my profile')));
    return;
  }
  grid.replaceChildren(
    ...shown.map((l) =>
      el('button', { class: `like-tile ${l.super ? 'super' : ''}`, onclick: () => openPerson(l.profile, { from: 'likes', like: l }) },
        photoBox(photoUrl(l.profile), 'fill', initialOf(l.profile)),
        el('span', { class: 'tile-tag' }, likedContext(l)),
        l.super ? el('span', { class: 'tile-star' }, icon('star')) : null,
        el('div', { class: 'tile-info' },
          el('strong', {}, `${l.profile.name}, ${l.profile.age}`),
          l.comment ? el('p', { class: 'tile-comment' }, l.comment) : null))),
  );
}

// ---- Someone's profile ----

function openPerson(profile, { from, like = null, matchId = null }) {
  state.person = { profile, from, like, matchId };
  show('person');
  $('#person-title').textContent = profile.name;
  const back = () => (from === 'chat' ? show('matches') : show(from));
  const context = like
    ? el('div', { class: `liked-context ${like.super ? 'super' : ''}` },
      el('p', { class: 'kicker' }, like.super ? icon('star') : null, `${profile.name} · ${likedContext(like)}`),
      likedItemPreview(like.item, state.me),
      like.comment ? el('div', { class: 'msg theirs solo' }, el('span', { class: 'msg-body' }, like.comment)) : null)
    : null;
  const actions = from === 'chat'
    ? {
      onBlock: () => blockUser(profile, () => show('matches')),
      onReport: () => reportUser(profile, () => show('matches')),
    }
    : decisionActions(profile, () => back());
  $('#person-body').replaceChildren(...[context, renderProfile(profile, actions)].filter(Boolean));
}

$('#person-back').addEventListener('click', () => {
  const { from, matchId, profile } = state.person;
  if (from === 'chat') openChat(matchId, profile);
  else show(from);
});

// ---- It's a match ----

function openMatch(matchId, profile) {
  state.pendingMatch = { matchId, profile };
  $('#match-photos').replaceChildren(
    photoBox(photoUrl(state.me), 'mp left', initialOf(state.me)),
    el('span', { class: 'match-heart' }, icon('heart')),
    photoBox(photoUrl(profile), 'mp right', initialOf(profile)));
  $('#match-text').textContent = `You and ${profile.name} liked each other. Say hi within ${state.options.LIMITS.matchExpiryHours} hours before the match expires.`;
  $('#hearts').replaceChildren(
    ...Array.from({ length: 16 }, () =>
      el('span', {
        class: 'float-up',
        style: `left:${Math.random() * 100}%;animation-delay:${(Math.random() * 1.6).toFixed(2)}s;font-size:${14 + Math.random() * 22}px`,
      }, '♥')),
  );
  $('#match-modal').classList.remove('hidden');
}

$('#match-close-btn').addEventListener('click', () => {
  $('#match-modal').classList.add('hidden');
});
$('#match-chat-btn').addEventListener('click', () => {
  $('#match-modal').classList.add('hidden');
  openChat(state.pendingMatch.matchId, state.pendingMatch.profile);
});

// ---- Filters ----

function openFilters() {
  state.filtersFrom = TAB_VIEWS.includes(state.view) ? state.view : HOME;
  show('filters');
}

function card(title, ...content) {
  return el('section', { class: 'card' }, el('div', { class: 'card-head' }, el('h3', {}, title)), ...content);
}

function chipGroup(name, choices, selected) {
  return el('div', { class: 'chips' },
    Object.entries(choices).map(([value, text]) =>
      el('label', { class: 'chip-toggle' },
        el('input', { type: 'checkbox', name, value, checked: selected.includes(value) }),
        el('span', {}, text))));
}

function pillGroup(name, choices, selected) {
  return el('div', { class: 'segmented' },
    Object.entries(choices).map(([value, text]) =>
      el('label', {}, el('input', { type: 'radio', name, value, checked: value === selected }), el('span', {}, text))));
}

// Two range inputs layered into one slider with two handles.
function dualRange(minName, maxName, min, max, low, high, format) {
  const out = el('span', { class: 'card-value' });
  const fill = el('div', { class: 'range-fill' });
  const a = el('input', { type: 'range', name: minName, min, max, value: low, 'aria-label': 'Minimum' });
  const b = el('input', { type: 'range', name: maxName, min, max, value: high, 'aria-label': 'Maximum' });
  const sync = (moved) => {
    if (Number(a.value) > Number(b.value)) {
      if (moved === a) a.value = b.value;
      else b.value = a.value;
    }
    const pct = (v) => ((v - min) / (max - min)) * 100;
    fill.style.left = `${pct(a.value)}%`;
    fill.style.right = `${100 - pct(b.value)}%`;
    out.textContent = format(Number(a.value), Number(b.value));
  };
  a.addEventListener('input', () => sync(a));
  b.addEventListener('input', () => sync(b));
  sync();
  return { out, node: el('div', { class: 'dual-range' }, el('div', { class: 'range-track' }), fill, a, b) };
}

function renderFilters() {
  const o = state.options;
  const f = state.me.filters;
  const form = $('#filters-form');

  const age = dualRange('min_age', 'max_age', 18, 99, f.min_age, f.max_age, (lo, hi) => `${lo} – ${hi === 99 ? '99+' : hi}`);

  const distanceOut = el('span', { class: 'card-value' });
  const distance = el('input', { type: 'range', class: 'single-range', name: 'max_distance_km', min: 1, max: 200, value: f.max_distance_km ?? 50 });
  const anywhere = el('input', { type: 'checkbox', name: 'anywhere', checked: f.max_distance_km === null });
  const syncDistance = () => {
    distance.disabled = anywhere.checked;
    distance.style.setProperty('--pct', `${((distance.value - 1) / 199) * 100}%`);
    distanceOut.textContent = anywhere.checked ? 'Anywhere' : `${distance.value} km`;
  };
  distance.addEventListener('input', syncDistance);
  anywhere.addEventListener('change', syncDistance);
  syncDistance();

  const heights = heightChoices();
  const noLocation = state.me.latitude === null;
  const ageCard = card('Age range', age.node);
  ageCard.querySelector('.card-head').append(age.out);
  const distanceCard = card('Maximum distance', distance,
    el('label', { class: 'switch-row' }, el('span', {}, 'Show people anywhere'), anywhere, el('span', { class: 'switch' })),
    noLocation ? el('p', { class: 'fine' }, 'Share your location (Profile → Edit profile → Location) to filter by distance.') : null);
  distanceCard.querySelector('.card-head').append(distanceOut);

  form.replaceChildren(
    card("I'm interested in", pillGroup('interested_in', o.INTERESTS, state.me.interested_in)),
    ageCard,
    distanceCard,
    card('Height', el('div', { class: 'row' },
      selectField('min_height_cm', 'From', heights, f.min_height_cm ? String(f.min_height_cm) : '', 'Any'),
      selectField('max_height_cm', 'To', heights, f.max_height_cm ? String(f.max_height_cm) : '', 'Any'))),
    card('Looking for', chipGroup('looking_for', o.LOOKING_FOR, f.looking_for)),
    card('Education', chipGroup('education', o.EDUCATION, f.education)),
    card('Drinking', chipGroup('drinking', o.HABITS, f.drinking)),
    card('Smoking', chipGroup('smoking', o.HABITS, f.smoking)),
    card('Children', chipGroup('kids', o.KIDS, f.kids)),
    el('p', { class: 'fine pad-x' }, "Leave a group empty to see everyone. When you pick options, people who haven't answered are hidden."),
    el('p', { class: 'error pad-x', id: 'filters-error' }),
    el('div', { class: 'sticky-footer' }, el('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Apply filters')),
  );
}

function readFilters(form) {
  const data = new FormData(form);
  const filters = {
    min_age: Number(data.get('min_age')),
    max_age: Number(data.get('max_age')),
    max_distance_km: data.get('anywhere') ? null : Number(data.get('max_distance_km')),
    min_height_cm: data.get('min_height_cm') || null,
    max_height_cm: data.get('max_height_cm') || null,
  };
  for (const k of ['looking_for', 'education', 'drinking', 'smoking', 'kids']) filters[k] = data.getAll(k);
  return { filters, interested_in: data.get('interested_in') };
}

$('#filters-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { filters, interested_in } = readFilters(e.target);
  try {
    if (interested_in !== state.me.interested_in) await api('PUT', '/api/me', { interested_in });
    ({ user: state.me } = await api('PUT', '/api/me/filters', filters));
    toast('Filters updated');
    show(state.filtersFrom);
  } catch (err) {
    $('#filters-error').textContent = err.message;
  }
});

$('#filters-back').addEventListener('click', () => show(state.filtersFrom));
$('#filters-reset').addEventListener('click', async () => {
  ({ user: state.me } = await api('PUT', '/api/me/filters', state.options.DEFAULT_FILTERS));
  renderFilters();
  toast('Filters reset');
});

// ---- Chats ----

// A ring around an avatar showing how much of the 24h match window is left.
function countdownRing(m) {
  const total = state.options.LIMITS.matchExpiryHours * 3600 * 1000;
  const left = Math.max(0, parseTime(m.expires_at) - Date.now());
  const r = 46;
  const c = 2 * Math.PI * r;
  const svg = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="${r}" class="ring-bg"/><circle cx="50" cy="50" r="${r}" class="ring-fg" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - left / total)}"/></svg>`;
  const ring = el('span', { class: 'countdown', title: `${durationWords(left)} left to say hi` });
  ring.innerHTML = svg;
  ring.append(avatar(m.profile));
  return ring;
}

async function loadMatches() {
  const body = $('#matches-body');
  body.replaceChildren(el('div', { class: 'pad-x' }, el('div', { class: 'sk sk-row' }), el('div', { class: 'sk sk-row' })));
  try {
    ({ matches: state.matches } = await api('GET', '/api/matches'));
  } catch (err) {
    state.matches = [];
    toast(err.message);
  }
  renderMatches();
}

function renderMatches() {
  const body = $('#matches-body');
  const q = state.chatQuery.trim().toLowerCase();
  const matches = state.matches.filter((m) => !q || m.profile.name.toLowerCase().includes(q));
  if (!state.matches.length) {
    body.replaceChildren(emptyState('chat', 'No matches yet', "When you and someone like each other, you'll be able to chat here.", {
      label: 'Start swiping',
      onclick: () => show('people'),
    }));
    return;
  }
  const queue = matches.filter((m) => !m.last_message && !m.expired);
  const convos = matches.filter((m) => m.last_message || m.expired);
  const sections = [
    queue.length
      ? el('section', {},
        el('h3', { class: 'section-head' }, 'Your matches ', el('span', { class: 'muted' }, `(${queue.length})`)),
        el('div', { class: 'queue' },
          queue.map((m) =>
            el('button', { class: 'queue-item', onclick: () => openChat(m.match_id, m.profile) },
              countdownRing(m),
              el('span', {}, m.profile.name)))))
      : null,
    el('section', {},
      el('h3', { class: 'section-head' }, 'Chats ', el('span', { class: 'muted' }, '(Recent)')),
      convos.length
        ? el('div', { class: 'convos' },
          convos.map((m) => {
            if (m.expired) {
              return el('button', { class: 'convo expired', onclick: () => expiredSheet(m) },
                el('span', { class: 'expired-ring' }, avatar(m.profile)),
                el('div', { class: 'convo-text' },
                  el('strong', {}, m.profile.name),
                  el('p', { class: 'convo-last' }, `Match expired ${timeAgo(m.expires_at)} ago`)));
            }
            const mine = m.last_sender_id === state.me.id;
            return el('button', { class: 'convo', onclick: () => openChat(m.match_id, m.profile) },
              avatar(m.profile),
              el('div', { class: 'convo-text' },
                el('div', { class: 'convo-top' },
                  el('strong', {}, m.profile.name),
                  mine ? null : el('span', { class: 'pill-move' }, 'Your move'),
                  el('time', {}, timeAgo(m.last_message_at))),
                el('p', { class: `convo-last ${mine ? '' : 'unread'}` }, `${mine ? 'You: ' : ''}${m.last_message}`)));
          }))
        : el('p', { class: 'muted pad-x' }, q ? 'No chats match your search.' : 'Say hi to a new match to start chatting.')),
  ];
  body.replaceChildren(...sections.filter(Boolean));
}

function expiredSheet(m) {
  openSheet(el('div', { class: 'stack center' },
    avatar(m.profile, 'xl center-self'),
    el('h3', { class: 'display sheet-title' }, `Your match with ${m.profile.name} expired`),
    el('p', { class: 'muted' }, `Neither of you said hi within ${state.options.LIMITS.matchExpiryHours} hours.`),
    el('button', {
      class: 'btn btn-primary btn-block',
      onclick: async () => {
        closeSheet();
        await api('DELETE', `/api/matches/${m.match_id}`).catch((err) => toast(err.message));
        loadMatches();
      },
    }, 'Remove from chats'),
    el('button', { class: 'btn btn-ghost btn-block', onclick: closeSheet }, 'Close')));
}

$('#chat-search-btn').addEventListener('click', () => {
  const wrap = $('#chat-search-wrap');
  wrap.classList.toggle('hidden');
  if (!wrap.classList.contains('hidden')) $('#chat-search').focus();
  else {
    state.chatQuery = '';
    $('#chat-search').value = '';
    renderMatches();
  }
});
$('#chat-search').addEventListener('input', (e) => {
  state.chatQuery = e.target.value;
  renderMatches();
});

// ---- Chat ----

function icebreakers(profile) {
  const ideas = profile.prompts.map((pr) => ({
    label: pr.prompt,
    text: `Your answer to "${pr.prompt}" made me smile. `,
  }));
  ideas.push(
    { label: 'Coffee or chai?', text: 'Important question first: coffee or chai?' },
    { label: 'Perfect weekend', text: "What's your idea of a perfect weekend?" },
  );
  return ideas.slice(0, 4);
}

function openChat(matchId, profile) {
  show('chat');
  state.chat = { matchId, profile, lastId: 0, timer: null, count: 0 };
  $('#chat-with').replaceChildren(avatar(profile), el('span', {}, profile.name));
  $('#messages').replaceChildren(
    el('div', { class: 'chat-intro' },
      avatar(profile, 'xl'),
      el('p', { class: 'display' }, `You matched with ${profile.name}`),
      el('p', { class: 'muted small' }, 'Either of you can make the first move. Start with something from their profile.')));
  const input = $('#message-form').body;
  $('#icebreakers').replaceChildren(
    ...icebreakers(profile).map((idea) =>
      el('button', {
        class: 'icebreaker',
        type: 'button',
        onclick: () => {
          input.value = idea.text;
          input.focus();
        },
      }, idea.label)),
  );
  $('#icebreakers').classList.remove('hidden');
  pollMessages();
  state.chat.timer = setInterval(pollMessages, 3000);
  input.focus();
}

function stopChatPolling() {
  if (state.chat?.timer) clearInterval(state.chat.timer);
  if (state.chat) state.chat.timer = null;
}

function appendMessages(messages) {
  const box = $('#messages');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  for (const m of messages) {
    if (m.id <= state.chat.lastId) continue;
    state.chat.lastId = m.id;
    state.chat.count += 1;
    box.append(el('div', { class: `msg ${m.sender_id === state.me.id ? 'mine' : 'theirs'}` },
      el('span', { class: 'msg-body' }, m.body),
      el('time', {}, clockTime(m.created_at))));
  }
  $('#icebreakers').classList.toggle('hidden', state.chat.count > 0);
  if (atBottom || messages.some((m) => m.sender_id === state.me.id)) box.scrollTop = box.scrollHeight;
}

async function pollMessages() {
  const chat = state.chat;
  if (!chat) return;
  try {
    const { messages } = await api('GET', `/api/matches/${chat.matchId}/messages?after=${chat.lastId}`);
    if (state.chat === chat) appendMessages(messages);
  } catch (err) {
    if (state.chat !== chat || !chat.timer) return;
    // The other person may have unmatched or blocked.
    stopChatPolling();
    toast(err.message);
    show('matches');
  }
}

$('#message-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = e.target.body;
  const body = input.value.trim();
  if (!body || !state.chat) return;
  input.value = '';
  try {
    const { message } = await api('POST', `/api/matches/${state.chat.matchId}/messages`, { body });
    appendMessages([message]);
  } catch (err) {
    input.value = body;
    toast(err.message);
  }
});

$('#chat-back').addEventListener('click', () => show('matches'));
$('#chat-with').addEventListener('click', () => {
  const { profile, matchId } = state.chat;
  openPerson(profile, { from: 'chat', matchId });
});
$('#chat-more').addEventListener('click', () => {
  const { profile, matchId } = state.chat;
  const action = (iconName, text, onclick, cls = '') =>
    el('button', { class: `sheet-action ${cls}`, onclick: () => { closeSheet(); onclick(); } }, icon(iconName), text);
  openSheet(el('div', { class: 'stack' },
    action('eye', `View ${profile.name}'s profile`, () => openPerson(profile, { from: 'chat', matchId })),
    action('x', 'Unmatch', unmatch),
    action('ban', 'Block', () => blockUser(profile, () => show('matches'))),
    action('flag', 'Report', () => reportUser(profile, () => show('matches')), 'danger'),
    el('button', { class: 'btn btn-ghost btn-block', onclick: closeSheet }, 'Cancel')));
});

async function unmatch() {
  const { profile, matchId } = state.chat;
  const ok = await confirmSheet({
    title: `Unmatch ${profile.name}?`,
    text: "Your conversation will be deleted and you won't see each other again.",
    action: 'Unmatch',
    danger: true,
  });
  if (!ok) return;
  try {
    await api('DELETE', `/api/matches/${matchId}`);
    toast(`Unmatched ${profile.name}`);
    show('matches');
  } catch (err) {
    toast(err.message);
  }
}

// ---- Profile ----

const DETAIL_FIELDS = ['height_cm', 'job_title', 'education', 'looking_for', 'drinking', 'smoking', 'kids', 'bio'];

function profileStrength(me) {
  const { maxPhotos, maxPrompts } = state.options.LIMITS;
  const answered = DETAIL_FIELDS.filter((f) => me[f]).length;
  const score =
    (Math.min(me.photos.length, maxPhotos) / maxPhotos) * 40 +
    (Math.min(me.prompts.length, maxPrompts) / maxPrompts) * 30 +
    (me.city ? 4 : 0) + (me.latitude !== null ? 3 : 0) + (me.hometown ? 3 : 0) +
    (answered / DETAIL_FIELDS.length) * 20;
  return { pct: Math.round(score), answered };
}

function checklist(me) {
  const { maxPhotos, maxPrompts } = state.options.LIMITS;
  return [
    [me.photos.length >= maxPhotos, `Add ${maxPhotos} photos (${me.photos.length}/${maxPhotos})`, 'photos'],
    [me.prompts.length >= maxPrompts, `Answer ${maxPrompts} prompts (${me.prompts.length}/${maxPrompts})`, 'prompts'],
    [me.latitude !== null, 'Share your location', 'location'],
    [Boolean(me.hometown), 'Add where you\'re from', 'location'],
    [Boolean(me.looking_for), 'Say what you\'re looking for', 'details'],
    [Boolean(me.height_cm), 'Add your height', 'details'],
    [Boolean(me.bio), 'Write a short bio', 'details'],
  ];
}

function renderMyProfile() {
  const me = state.me;
  const { pct } = profileStrength(me);
  const firstTodo = checklist(me).find(([done]) => !done);

  const tabs = el('div', { class: 'pill-tabs' },
    [['strength', 'Profile strength'], ['safety', 'Safety and wellbeing']].map(([key, text]) =>
      el('button', {
        class: state.profileTab === key ? 'active' : '',
        onclick: () => {
          state.profileTab = key;
          renderMyProfile();
        },
      }, text)));

  const actionCard = (iconName, title, sub, onclick) =>
    el('button', { class: 'action-card', onclick },
      el('span', { class: 'action-icon' }, icon(iconName)),
      el('span', {}, el('strong', {}, title), el('small', {}, sub)));

  const strength = el('div', { class: 'stack' },
    el('div', { class: 'action-grid' },
      actionCard('star', 'SuperSwipe', `${me.super_swipes_left} left today`, () =>
        openSheet(el('div', { class: 'stack' },
          el('h3', { class: 'display sheet-title' }, 'SuperSwipe'),
          el('p', { class: 'muted' }, `Tap the yellow star on someone's profile to let them know you're really interested. They'll see you first in their Liked You. You get ${state.options.LIMITS.superSwipesPerDay} a day.`),
          el('button', { class: 'btn btn-primary btn-block', onclick: () => { closeSheet(); show('people'); } }, 'Start swiping')))),
      actionCard('filter', 'Filters', 'Who you see', openFilters)),
    el('section', { class: 'promo' },
      el('span', { class: 'promo-badge' }, pct >= 100 ? 'ALL-STAR' : 'STAND OUT'),
      el('p', {}, pct >= 100
        ? "Your profile is complete. You're all set to make great connections."
        : 'Complete profiles get more matches. Finish yours to get noticed by more people.'),
      firstTodo
        ? el('button', { class: 'btn btn-primary btn-block', onclick: () => startSetup('edit', firstTodo[2]) }, 'Finish my profile')
        : el('button', { class: 'btn btn-primary btn-block', onclick: () => show('edit') }, 'View my profile')),
    el('h3', { class: 'section-head flush' }, 'Your profile checklist'),
    el('div', { class: 'list' },
      checklist(me).map(([done, text, step]) =>
        el('button', { class: `list-row ${done ? 'done' : ''}`, onclick: () => startSetup('edit', step) },
          el('span', { class: 'check-dot' }, icon(done ? 'check' : 'plus')),
          el('span', { class: 'list-title' }, text),
          icon('next', 'chev')))));

  const tips = [
    ['users', 'Meet in public', 'For the first few dates, pick a busy café or restaurant, not someone\'s home.'],
    ['mail', 'Tell a friend', 'Share where you\'re going and who you\'re meeting.'],
    ['coins', 'Never send money', 'Anyone asking for money or gift cards is a scammer. Report them.'],
    ['shield', 'Trust your instincts', 'If something feels off, leave. You can block or report anyone from their profile or your chat.'],
  ];
  const safety = el('div', { class: 'list' },
    tips.map(([i, t, d]) =>
      el('div', { class: 'list-row static' },
        el('span', { class: 'list-icon' }, icon(i)),
        el('span', { class: 'tip' }, el('strong', {}, t), el('small', {}, d)))));

  $('#profile-body').replaceChildren(
    el('div', { class: 'me-row' },
      el('div', { class: 'strength-ring', style: `--pct:${pct}` }, avatar(me, 'xl')),
      el('div', {},
        el('h2', { class: 'display' }, me.name),
        el('p', { class: 'muted small' }, `${pct}% complete`),
        el('button', { class: 'btn btn-outline btn-sm', onclick: () => show('edit') }, 'Edit profile'))),
    tabs,
    el('div', { class: 'pad-x' }, state.profileTab === 'safety' ? safety : strength));
}

function renderEditProfile() {
  const me = state.me;
  const { answered } = profileStrength(me);
  const { maxPhotos, maxPrompts } = state.options.LIMITS;
  const row = (iconName, title, value, onclick) =>
    el('button', { class: 'list-row', onclick },
      el('span', { class: 'list-icon' }, icon(iconName)),
      el('span', { class: 'list-title' }, title),
      el('span', { class: 'list-value' }, value),
      icon('next', 'chev'));
  const tabs = el('div', { class: 'segmented wide' },
    ['edit', 'view'].map((t) =>
      el('label', {},
        el('input', {
          type: 'radio',
          name: 'edit-tab',
          checked: state.editTab === t,
          onchange: () => {
            state.editTab = t;
            renderEditProfile();
          },
        }),
        el('span', {}, t === 'edit' ? 'Edit' : 'Preview'))));
  $('#edit-body').replaceChildren(
    tabs,
    state.editTab === 'view'
      ? el('div', { class: 'deck' }, renderProfile(me))
      : el('div', { class: 'pad-x stack' },
        el('div', { class: 'list' },
          row('camera', 'Photos', `${me.photos.length}/${maxPhotos}`, () => startSetup('edit', 'photos')),
          row('quote', 'Prompts', `${me.prompts.length}/${maxPrompts}`, () => startSetup('edit', 'prompts')),
          row('pin', 'Location', me.city || 'Not set', () => startSetup('edit', 'location')),
          row('user', 'About you', `${answered}/${DETAIL_FIELDS.length} answered`, () => startSetup('edit', 'details')))),
  );
}

function filtersSummary() {
  const f = state.me.filters;
  return [
    state.options.INTERESTS[state.me.interested_in],
    `${f.min_age}–${f.max_age === 99 ? '99+' : f.max_age}`,
    f.max_distance_km === null ? 'Anywhere' : `${f.max_distance_km} km`,
  ].join(' · ');
}

$('#settings-btn').addEventListener('click', () => {
  const action = (iconName, text, sub, onclick, cls = '') =>
    el('button', { class: `sheet-action ${cls}`, onclick: () => { closeSheet(); onclick(); } },
      icon(iconName), el('span', {}, text, sub ? el('small', {}, sub) : null));
  openSheet(el('div', { class: 'stack' },
    el('h3', { class: 'display sheet-title' }, 'Settings'),
    action('filter', 'Dating filters', filtersSummary(), openFilters),
    action('user', 'Edit profile', null, () => show('edit')),
    action('palette', 'App colour', `${ACCENTS[storedSetting('accent', 'yellow', ACCENTS)][0]} · ${MODES[storedSetting('mode', 'light', MODES)]}`, openThemeSheet),
    action('info', 'Terms & Conditions', null, () => window.open('terms.html', '_blank', 'noopener')),
    action('shield', 'Privacy Policy', null, () => window.open('privacy.html', '_blank', 'noopener')),
    action('logout', 'Log out', state.me.email, logout, 'danger')));
});
$('#safety-btn').addEventListener('click', () => {
  state.profileTab = 'safety';
  renderMyProfile();
});

// ---- App colour (saved per device in localStorage) ----

const ACCENTS = {
  yellow: ['Honey', '#fdd85d'],
  pink: ['Rose', '#ff9fb8'],
  blue: ['Ocean', '#8cc8ff'],
  purple: ['Lavender', '#c3adff'],
  green: ['Mint', '#86e3b8'],
  orange: ['Sunset', '#ffb27d'],
};
const MODES = { light: 'Light', dark: 'Dark', auto: 'Auto' };

function storedSetting(key, fallback, allowed) {
  try {
    const value = localStorage.getItem(key);
    return Object.hasOwn(allowed, value ?? '') ? value : fallback;
  } catch {
    return fallback;
  }
}

function saveSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode: still applies for this visit */ }
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme() {
  const accent = storedSetting('accent', 'yellow', ACCENTS);
  const mode = storedSetting('mode', 'light', MODES);
  const html = document.documentElement;
  html.dataset.accent = accent;
  html.dataset.mode = mode === 'dark' || (mode === 'auto' && darkQuery.matches) ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]').content = getComputedStyle(html).getPropertyValue('--bg').trim();
}

darkQuery.addEventListener('change', applyTheme);

function openThemeSheet() {
  const render = () => {
    const accent = storedSetting('accent', 'yellow', ACCENTS);
    const mode = storedSetting('mode', 'light', MODES);
    return el('div', { class: 'stack' },
      el('h3', { class: 'display sheet-title' }, 'App colour'),
      el('div', { class: 'swatches' },
        Object.entries(ACCENTS).map(([key, [name, hex]]) =>
          el('button', {
            class: `swatch ${key === accent ? 'active' : ''}`,
            'aria-pressed': String(key === accent),
            onclick: () => {
              saveSetting('accent', key);
              applyTheme();
              $('#sheet-body').replaceChildren(render());
            },
          }, el('span', { class: 'swatch-dot', style: `background:${hex}` }, icon('check')), name))),
      el('h3', { class: 'section-head flush' }, 'Appearance'),
      el('div', { class: 'segmented' },
        Object.entries(MODES).map(([key, name]) =>
          el('label', {},
            el('input', {
              type: 'radio',
              name: 'mode',
              checked: key === mode,
              onchange: () => {
                saveSetting('mode', key);
                applyTheme();
              },
            }),
            el('span', {}, name)))),
      el('p', { class: 'fine' }, 'Auto follows your phone or computer setting.'),
      el('button', { class: 'btn btn-primary btn-block', onclick: closeSheet }, 'Done'));
  };
  openSheet(render());
}

$('#theme-btn').addEventListener('click', openThemeSheet);

// ---- Boot ----

(async function init() {
  applyTheme();
  hydrateIcons();
  state.options = await (await fetch('/api/options')).json();
  if (!state.token) return show('welcome');
  try {
    ({ user: state.me } = await api('GET', '/api/me'));
    goHome();
  } catch {
    logoutLocal();
  }
})();
