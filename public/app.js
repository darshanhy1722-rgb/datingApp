'use strict';

const state = {
  token: localStorage.getItem('token'),
  me: null,
  deck: [],
  chat: null, // { matchId, profile, lastId, timer }
  pendingMatch: null,
};

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

// Layer the photo over the gradient so a broken image URL still leaves a solid background.
const FALLBACK_BG = 'linear-gradient(135deg, #ffb3c1, #ff4f70)';
function setPhoto(node, profile) {
  if (!profile.photo_url) return;
  node.style.backgroundImage = `url(${JSON.stringify(profile.photo_url)}), ${FALLBACK_BG}`;
  // The initial-letter placeholder stays until the photo has actually loaded.
  const img = new Image();
  img.onload = () => node.classList.add('photo-loaded');
  img.src = profile.photo_url;
}

function avatar(profile) {
  const a = el('div', { class: 'avatar' }, profile.name.charAt(0).toUpperCase());
  setPhoto(a, profile);
  return a;
}

async function api(method, url, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401 && state.token) {
    logoutLocal();
    throw new Error('Your session expired. Please log in again.');
  }
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error(data?.error || 'Request failed');
  return data;
}

function formData(form) {
  const data = Object.fromEntries(new FormData(form));
  for (const k of ['age', 'min_age', 'max_age']) if (k in data) data[k] = Number(data[k]);
  return data;
}

// ---- Navigation ----

function show(view) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${view}`).classList.remove('hidden');
  $('#topbar').classList.toggle('hidden', view === 'auth');
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view !== 'chat') stopChatPolling();
  if (view === 'discover') loadDeck();
  if (view === 'matches') loadMatches();
  if (view === 'profile') fillProfile();
}

document.querySelectorAll('.nav-btn').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

// ---- Auth ----

document.querySelectorAll('[data-auth]').forEach((tab) =>
  tab.addEventListener('click', () => {
    document.querySelectorAll('[data-auth]').forEach((t) => t.classList.toggle('active', t === tab));
    $('#login-form').classList.toggle('hidden', tab.dataset.auth !== 'login');
    $('#signup-form').classList.toggle('hidden', tab.dataset.auth !== 'signup');
    $('#auth-error').textContent = '';
  }),
);

async function handleAuth(e, url) {
  e.preventDefault();
  $('#auth-error').textContent = '';
  try {
    const { token, user } = await api('POST', url, formData(e.target));
    state.token = token;
    state.me = user;
    localStorage.setItem('token', token);
    e.target.reset();
    show('discover');
  } catch (err) {
    $('#auth-error').textContent = err.message;
  }
}

$('#login-form').addEventListener('submit', (e) => handleAuth(e, '/api/login'));
$('#signup-form').addEventListener('submit', (e) => handleAuth(e, '/api/signup'));

function logoutLocal() {
  state.token = null;
  state.me = null;
  localStorage.removeItem('token');
  show('auth');
}

$('#logout-btn').addEventListener('click', async () => {
  try { await api('POST', '/api/logout'); } catch { /* ignore */ }
  logoutLocal();
});

// ---- Discover ----

async function loadDeck() {
  try {
    const { profiles } = await api('GET', '/api/discover');
    state.deck = profiles;
  } catch (err) {
    state.deck = [];
  }
  renderDeck();
}

function renderDeck() {
  const deck = $('#deck');
  deck.replaceChildren();
  $('#swipe-actions').classList.toggle('hidden', state.deck.length === 0);
  if (!state.deck.length) {
    deck.append(
      el('div', { class: 'empty' },
        el('h3', {}, 'No one new right now'),
        el('p', {}, 'Check back later, or widen your preferences in your profile.')),
    );
    return;
  }
  // Render the top two so the next card is visible underneath.
  state.deck.slice(0, 2).reverse().forEach((p, i, arr) => {
    const card = el('div', { class: 'profile-card' });
    card.append(el('div', { class: 'initial' }, p.name.charAt(0).toUpperCase()));
    setPhoto(card, p);
    card.append(
      el('div', { class: 'stamp like' }, 'LIKE'),
      el('div', { class: 'stamp nope' }, 'NOPE'),
      el('div', { class: 'info' },
        el('h3', {}, `${p.name}, ${p.age}`),
        el('div', { class: 'city' }, p.city || ''),
        el('p', { class: 'bio' }, p.bio || '')),
    );
    if (i === arr.length - 1) enableDrag(card);
    else card.style.transform = 'scale(0.96) translateY(10px)';
    deck.append(card);
  });
}

function enableDrag(card) {
  let startX = null;
  let dx = 0;
  card.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    card.setPointerCapture(e.pointerId);
    card.style.transition = 'none';
  });
  card.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    dx = e.clientX - startX;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 20}deg)`;
    card.querySelector('.stamp.like').style.opacity = Math.max(0, dx / 100);
    card.querySelector('.stamp.nope').style.opacity = Math.max(0, -dx / 100);
  });
  const end = () => {
    if (startX === null) return;
    startX = null;
    card.style.transition = '';
    if (Math.abs(dx) > 110) swipe(dx > 0);
    else {
      card.style.transform = '';
      card.querySelectorAll('.stamp').forEach((s) => (s.style.opacity = 0));
    }
    dx = 0;
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

let swiping = false;
async function swipe(liked) {
  const profile = state.deck[0];
  if (!profile || swiping) return;
  swiping = true;
  const top = $('#deck').lastElementChild;
  if (top) {
    top.style.transform = `translateX(${liked ? 600 : -600}px) rotate(${liked ? 30 : -30}deg)`;
    top.style.opacity = 0;
  }
  try {
    const result = await api('POST', '/api/swipes', { target_id: profile.id, liked });
    if (result.matched) openMatchModal(result.match_id, result.profile);
  } catch (err) {
    alert(err.message);
  }
  setTimeout(() => {
    state.deck.shift();
    swiping = false;
    if (state.deck.length) renderDeck();
    else loadDeck();
  }, 200);
}

$('#like-btn').addEventListener('click', () => swipe(true));
$('#pass-btn').addEventListener('click', () => swipe(false));
document.addEventListener('keydown', (e) => {
  if ($('#view-discover').classList.contains('hidden') || !$('#match-modal').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') swipe(true);
  if (e.key === 'ArrowLeft') swipe(false);
});

function openMatchModal(matchId, profile) {
  state.pendingMatch = { matchId, profile };
  $('#match-modal-text').textContent = `You and ${profile.name} like each other.`;
  $('#match-modal').classList.remove('hidden');
}

$('#match-close-btn').addEventListener('click', () => $('#match-modal').classList.add('hidden'));
$('#match-chat-btn').addEventListener('click', () => {
  $('#match-modal').classList.add('hidden');
  const { matchId, profile } = state.pendingMatch;
  openChat(matchId, profile);
});

// ---- Matches ----

async function loadMatches() {
  const list = $('#match-list');
  try {
    const { matches } = await api('GET', '/api/matches');
    list.replaceChildren();
    if (!matches.length) {
      list.append(el('li', { class: 'empty' }, 'No matches yet. Keep swiping!'));
      return;
    }
    for (const m of matches) {
      const item = el('li', {},
        avatar(m.profile),
        el('div', { class: 'text' },
          el('div', { class: 'name' }, m.profile.name),
          el('div', { class: 'preview' }, m.last_message || 'New match. Say hi!')));
      item.addEventListener('click', () => openChat(m.match_id, m.profile));
      list.append(item);
    }
  } catch (err) {
    list.replaceChildren(el('li', { class: 'empty' }, err.message));
  }
}

// ---- Chat ----

function openChat(matchId, profile) {
  show('chat');
  state.chat = { matchId, profile, lastId: 0, timer: null };
  $('#chat-with').replaceChildren(avatar(profile), el('span', {}, profile.name));
  $('#messages').replaceChildren();
  pollMessages();
  state.chat.timer = setInterval(pollMessages, 3000);
  $('#message-form').body.focus();
}

function stopChatPolling() {
  if (state.chat?.timer) clearInterval(state.chat.timer);
  state.chat = null;
}

function appendMessages(messages) {
  const box = $('#messages');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
  for (const m of messages) {
    if (m.id <= state.chat.lastId) continue;
    state.chat.lastId = m.id;
    box.append(el('div', { class: `bubble ${m.sender_id === state.me.id ? 'mine' : 'theirs'}` }, m.body));
  }
  if (atBottom || messages.some((m) => m.sender_id === state.me.id)) box.scrollTop = box.scrollHeight;
}

async function pollMessages() {
  const chat = state.chat;
  if (!chat) return;
  try {
    const { messages } = await api('GET', `/api/matches/${chat.matchId}/messages?after=${chat.lastId}`);
    if (state.chat === chat) appendMessages(messages);
  } catch (err) {
    // The match may have been removed by the other person.
    stopChatPolling();
    alert(err.message);
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
    alert(err.message);
  }
});

$('#chat-back').addEventListener('click', () => show('matches'));
$('#unmatch-btn').addEventListener('click', async () => {
  if (!state.chat || !confirm(`Unmatch ${state.chat.profile.name}? This can't be undone.`)) return;
  try {
    await api('DELETE', `/api/matches/${state.chat.matchId}`);
    show('matches');
  } catch (err) {
    alert(err.message);
  }
});

// ---- Profile ----

function fillProfile() {
  const form = $('#profile-form');
  for (const [k, v] of Object.entries(state.me || {})) if (form.elements[k]) form.elements[k].value = v;
  $('#profile-notice').textContent = '';
}

$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const notice = $('#profile-notice');
  try {
    const { user } = await api('PUT', '/api/me', formData(e.target));
    state.me = user;
    notice.className = 'notice';
    notice.textContent = 'Saved!';
  } catch (err) {
    notice.className = 'error';
    notice.textContent = err.message;
  }
});

// ---- Boot ----

(async function init() {
  if (!state.token) return show('auth');
  try {
    const { user } = await api('GET', '/api/me');
    state.me = user;
    show('discover');
  } catch {
    logoutLocal();
  }
})();
