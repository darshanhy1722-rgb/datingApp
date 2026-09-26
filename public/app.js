'use strict';

const state = {
  token: localStorage.getItem('token'),
  me: null,
  options: null, // choices and labels from /api/options
  deck: [],
  chat: null, // { matchId, profile, lastId, timer }
  person: null, // { profile, from } for the full-profile view
  setup: null, // { mode: 'onboard' | 'edit', step }
  liking: null, // { profile, onDone } while the like sheet is open
  pendingMatch: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Small DOM builder: el('div', { class: 'x', onclick: fn }, child, 'text', ...)
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'value') node.value = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c);
  return node;
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
  return `${cm} cm (${Math.floor(totalIn / 12)}'${totalIn % 12}")`;
}

function initialOf(p) {
  return p.name.charAt(0).toUpperCase();
}

function photoUrl(p) {
  return p.photos?.[0]?.url || '';
}

// A photo tile that falls back to a gradient + initial if the image can't load.
function photoBox(url, className, fallbackText = '') {
  const box = el('div', { class: `photo ${className}` }, el('span', { class: 'photo-initial' }, fallbackText));
  if (url) {
    const img = el('img', { src: url, alt: '', loading: 'lazy' });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}

function avatar(p) {
  return photoBox(photoUrl(p), 'avatar', initialOf(p));
}

// ---- Full profile card (Hinge-style: photos interleaved with prompts) ----

function detailChips(p) {
  const chips = [];
  if (p.distance_km !== null && p.distance_km !== undefined) chips.push(`📍 ${p.distance_km} km away`);
  if (p.city) chips.push(`🏠 ${p.city}`);
  if (p.height_cm) chips.push(`📏 ${heightLabel(p.height_cm)}`);
  if (p.job_title) chips.push(`💼 ${p.job_title}`);
  if (p.education) chips.push(`🎓 ${label('EDUCATION', p.education)}`);
  if (p.looking_for) chips.push(`🔍 ${label('LOOKING_FOR', p.looking_for)}`);
  if (p.drinking) chips.push(`🍷 Drinks: ${label('HABITS', p.drinking)}`);
  if (p.smoking) chips.push(`🚬 Smokes: ${label('HABITS', p.smoking)}`);
  if (p.kids) chips.push(`👶 ${label('KIDS', p.kids)}`);
  return el('div', { class: 'chips' }, chips.map((c) => el('span', { class: 'chip' }, c)));
}

function promptCard(pr) {
  return el('div', { class: 'prompt-card' }, el('div', { class: 'prompt-q' }, pr.prompt), el('div', { class: 'prompt-a' }, pr.answer));
}

function renderProfile(p) {
  const [first, ...rest] = p.photos;
  const prompts = [...p.prompts];
  const parts = [
    el('div', { class: 'hero' },
      photoBox(first?.url, 'hero-photo', initialOf(p)),
      el('div', { class: 'hero-info' }, el('h3', {}, `${p.name}, ${p.age}`))),
    detailChips(p),
  ];
  if (p.bio) parts.push(el('div', { class: 'prompt-card' }, el('div', { class: 'prompt-q' }, 'About me'), el('div', { class: 'prompt-a small' }, p.bio)));
  // Alternate prompt, photo, prompt, photo… then whatever is left.
  while (prompts.length || rest.length) {
    if (prompts.length) parts.push(promptCard(prompts.shift()));
    if (rest.length) parts.push(photoBox(rest.shift().url, 'profile-photo', initialOf(p)));
  }
  return el('article', { class: 'profile' }, parts);
}

// ---- Navigation ----

function show(view) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $(`#view-${view}`).classList.remove('hidden');
  $('#topbar').classList.toggle('hidden', view === 'auth' || (view === 'setup' && state.setup?.mode === 'onboard'));
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (view !== 'chat') stopChatPolling();
  window.scrollTo(0, 0);
  if (view === 'discover') loadDeck();
  if (view === 'likes') loadLikes();
  if (view === 'matches') loadMatches();
  if (view === 'profile') renderMyProfile();
  if (view === 'filters') renderFilters();
  if (!['auth', 'setup', 'likes'].includes(view)) refreshLikesBadge();
}

$$('.nav-btn').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

function goHome() {
  if (state.me.profile_complete) show('discover');
  else startSetup('onboard');
}

// ---- Auth ----

// Pill-style radio buttons built from the option lists.
function renderPills(container, name, choices, selected, { multi = false } = {}) {
  container.replaceChildren(
    ...Object.entries(choices).map(([value, text]) =>
      el('label', { class: 'pill' },
        el('input', {
          type: multi ? 'checkbox' : 'radio',
          name,
          value,
          checked: multi ? selected.includes(value) : selected === value,
          required: !multi,
        }),
        el('span', {}, text))),
  );
}

function maxBirthdate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

function setupAuthForms() {
  const form = $('#signup-form');
  renderPills(form.querySelector('[data-radio=gender]'), 'gender', state.options.GENDERS, null);
  renderPills(form.querySelector('[data-radio=interested_in]'), 'interested_in', state.options.INTERESTS, null);
  form.birthdate.max = maxBirthdate();
  form.birthdate.min = '1920-01-01';
}

$$('[data-auth]').forEach((tab) =>
  tab.addEventListener('click', () => {
    $$('[data-auth]').forEach((t) => t.classList.toggle('active', t === tab));
    $('#login-form').classList.toggle('hidden', tab.dataset.auth !== 'login');
    $('#signup-form').classList.toggle('hidden', tab.dataset.auth !== 'signup');
    $('#auth-error').textContent = '';
  }),
);

async function handleAuth(e, url) {
  e.preventDefault();
  $('#auth-error').textContent = '';
  try {
    const { token, user } = await api('POST', url, Object.fromEntries(new FormData(e.target)));
    state.token = token;
    state.me = user;
    localStorage.setItem('token', token);
    e.target.reset();
    goHome();
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
  try { await api('POST', '/api/logout'); } catch { /* already logged out */ }
  logoutLocal();
});

// ---- Profile setup wizard ----

const STEPS = ['photos', 'prompts', 'location', 'details'];

function startSetup(mode, step) {
  if (!step) step = mode === 'onboard' ? STEPS.find((s) => state.me.missing.includes(s)) || 'details' : 'photos';
  state.setup = { mode, step };
  show('setup');
  renderSetupStep();
}

function renderSetupStep() {
  const { mode, step } = state.setup;
  const index = STEPS.indexOf(step);
  const def = SETUP_STEPS[step];
  $('#setup-progress').classList.toggle('hidden', mode === 'edit');
  $('#setup-progress div').style.width = `${((index + 1) / STEPS.length) * 100}%`;
  $('#setup-step-label').textContent = mode === 'onboard' ? `Step ${index + 1} of ${STEPS.length}` : '';
  $('#setup-title').textContent = def.title;
  $('#setup-subtitle').textContent = def.subtitle();
  $('#setup-error').textContent = '';
  $('#setup-back').textContent = mode === 'edit' ? 'Cancel' : 'Back';
  $('#setup-back').classList.toggle('invisible', mode === 'onboard' && index === 0);
  $('#setup-next').textContent = mode === 'edit' ? 'Save' : index === STEPS.length - 1 ? 'Finish' : 'Next';
  $('#setup-body').replaceChildren(def.render());
}

$('#setup-back').addEventListener('click', () => {
  const { mode, step } = state.setup;
  if (mode === 'edit') return show('profile');
  state.setup.step = STEPS[Math.max(0, STEPS.indexOf(step) - 1)];
  renderSetupStep();
});

$('#setup-next').addEventListener('click', async () => {
  const { mode, step } = state.setup;
  const button = $('#setup-next');
  $('#setup-error').textContent = '';
  button.disabled = true;
  try {
    await SETUP_STEPS[step].save();
    if (mode === 'edit') return show('profile');
    const next = STEPS[STEPS.indexOf(step) + 1];
    if (next) {
      state.setup.step = next;
      renderSetupStep();
      window.scrollTo(0, 0);
    } else if (state.me.profile_complete) {
      show('discover');
    } else {
      // Something required was skipped; jump back to it.
      state.setup.step = STEPS.find((s) => state.me.missing.includes(s));
      renderSetupStep();
    }
  } catch (err) {
    $('#setup-error').textContent = err.message;
  } finally {
    button.disabled = false;
  }
});

const SETUP_STEPS = {
  photos: {
    title: 'Add your photos',
    subtitle: () => `Add at least ${state.options.LIMITS.minPhotos} photos (up to ${state.options.LIMITS.maxPhotos}). The first one is your main photo.`,
    render: renderPhotoGrid,
    async save() {
      if (state.me.photos.length < state.options.LIMITS.minPhotos) {
        throw new Error(`Please add at least ${state.options.LIMITS.minPhotos} photos`);
      }
    },
  },
  prompts: {
    title: 'Answer some prompts',
    subtitle: () => `Pick up to ${state.options.LIMITS.maxPrompts} prompts. They give people something to talk to you about.`,
    render: renderPromptEditor,
    async save() {
      const rows = [...$$('.prompt-edit')].map((row) => ({
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
    title: 'Where are you?',
    subtitle: () => 'We use your location to show people near you. Others only see your area and how far away you are, never your exact address.',
    render: renderLocationStep,
    async save() {
      const city = $('#city-input').value.trim();
      if (!city) throw new Error('Please use your current location or type your area/city');
      const body = { city };
      if (locationDraft) Object.assign(body, locationDraft);
      ({ user: state.me } = await api('PUT', '/api/me', body));
    },
  },
  details: {
    title: 'About you',
    subtitle: () => 'All optional, but people can filter on these, and complete profiles get more likes.',
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
  const grid = el('div', { class: 'photo-grid', id: 'photo-grid' });
  state.me.photos.forEach((photo, i) => {
    grid.append(
      el('div', { class: 'photo-slot filled' },
        photoBox(photo.url, 'slot-photo', '?'),
        i === 0 ? el('span', { class: 'main-tag' }, 'Main') : null,
        el('button', { class: 'remove', type: 'button', title: 'Remove photo', onclick: () => removePhoto(photo.id) }, '✕')),
    );
  });
  for (let i = state.me.photos.length; i < maxPhotos; i++) {
    grid.append(el('button', { class: 'photo-slot empty', type: 'button', onclick: () => $('#photo-input').click() }, '+'));
  }
  return grid;
}

function refreshPhotoGrid() {
  const grid = $('#photo-grid');
  if (grid) grid.replaceWith(renderPhotoGrid());
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
  const files = [...e.target.files];
  e.target.value = '';
  $('#setup-error').textContent = '';
  for (const file of files) {
    if (state.me.photos.length >= state.options.LIMITS.maxPhotos) break;
    try {
      const blob = await resizeImage(file).catch(() => {
        throw new Error(`Couldn't read "${file.name}". Please use a JPG or PNG photo.`);
      });
      ({ user: state.me } = await api('POST', '/api/me/photos', undefined, { raw: blob }));
      refreshPhotoGrid();
    } catch (err) {
      $('#setup-error').textContent = err.message;
    }
  }
});

// Prompts

function renderPromptEditor() {
  const { maxPrompts } = state.options.LIMITS;
  const wrap = el('div', { class: 'prompt-editor' });
  for (let i = 0; i < maxPrompts; i++) {
    const current = state.me.prompts[i] || { prompt: '', answer: '' };
    const select = el('select', {},
      el('option', { value: '' }, i === 0 ? 'Choose a prompt…' : 'Choose a prompt (optional)…'),
      state.options.PROMPTS.map((p) => el('option', { value: p, selected: p === current.prompt }, p)));
    const answer = el('textarea', { rows: 2, maxlength: 250, placeholder: 'Your answer' });
    answer.value = current.answer;
    const counter = el('span', { class: 'hint' });
    const update = () => {
      answer.disabled = !select.value;
      counter.textContent = select.value ? `${answer.value.length}/250` : '';
    };
    select.addEventListener('change', update);
    answer.addEventListener('input', update);
    update();
    wrap.append(el('div', { class: 'prompt-edit' }, select, answer, counter));
  }
  return wrap;
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
  const status = el('p', { class: 'hint' },
    state.me.latitude !== null ? '✓ Location saved.' : 'Tip: sharing your location lets us show how far away people are.');
  const input = el('input', { id: 'city-input', maxlength: 80, placeholder: 'e.g. Indiranagar, Bengaluru', value: state.me.city });
  const button = el('button', { class: 'secondary', type: 'button' }, '📍 Use my current location');

  button.addEventListener('click', () => {
    if (!navigator.geolocation) {
      status.textContent = "Your browser can't share location. Type your area instead.";
      return;
    }
    status.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        locationDraft = { latitude: coords.latitude, longitude: coords.longitude };
        status.textContent = '✓ Location found.';
        try {
          const place = await reverseGeocode(coords.latitude, coords.longitude);
          if (place) input.value = place;
          else status.textContent = '✓ Location found. Please type your area name.';
        } catch {
          status.textContent = '✓ Location found. Please type your area name.';
        }
      },
      (err) => {
        status.textContent = err.code === err.PERMISSION_DENIED
          ? 'Location permission was denied. You can type your area instead.'
          : "Couldn't get your location. You can type your area instead.";
      },
      { enableHighAccuracy: false, timeout: 15000 },
    );
  });

  return el('div', { class: 'form' }, button, status, el('label', {}, 'Your area / city', input));
}

// Details

function selectField(name, text, choices, value, emptyLabel = 'Prefer not to say') {
  return el('label', {}, text,
    el('select', { name },
      el('option', { value: '' }, emptyLabel),
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
  return el('form', { id: 'details-form', class: 'form', onsubmit: (e) => e.preventDefault() },
    el('label', {}, 'First name', el('input', { name: 'name', required: true, maxlength: 50, value: me.name })),
    genderSelect(me.gender),
    selectField('height_cm', 'Height', heightChoices(), me.height_cm ? String(me.height_cm) : ''),
    selectField('looking_for', 'Looking for', o.LOOKING_FOR, me.looking_for),
    el('label', {}, 'Job title', el('input', { name: 'job_title', maxlength: 60, value: me.job_title, placeholder: 'e.g. Software engineer' })),
    selectField('education', 'Education', o.EDUCATION, me.education),
    el('div', { class: 'row' },
      selectField('drinking', 'Drinking', o.HABITS, me.drinking),
      selectField('smoking', 'Smoking', o.HABITS, me.smoking)),
    selectField('kids', 'Children', o.KIDS, me.kids),
    el('label', {}, 'About me', bio),
  );
}

// Gender can't be blank, so it gets a select without the empty option.
function genderSelect(value) {
  return el('label', {}, 'I am a',
    el('select', { name: 'gender' },
      Object.entries(state.options.GENDERS).map(([v, t]) => el('option', { value: v, selected: v === value }, t))));
}

// ---- Discover ----

async function loadDeck() {
  const deck = $('#deck');
  deck.replaceChildren(el('p', { class: 'empty' }, 'Loading…'));
  try {
    ({ profiles: state.deck } = await api('GET', '/api/discover'));
  } catch (err) {
    state.deck = [];
  }
  renderDeck();
}

function renderDeck() {
  const deck = $('#deck');
  const profile = state.deck[0];
  $('#discover-actions').classList.toggle('hidden', !profile);
  if (!profile) {
    deck.replaceChildren(
      el('div', { class: 'empty card' },
        el('h3', {}, "You've seen everyone for now"),
        el('p', {}, 'Check back later, or widen your filters to see more people.'),
        el('button', { class: 'primary', onclick: () => show('filters') }, 'Adjust filters')),
    );
    return;
  }
  deck.replaceChildren(renderProfile(profile));
}

let swiping = false;
async function swipe(profile, liked, comment = '') {
  if (swiping) return null;
  swiping = true;
  try {
    const result = await api('POST', '/api/swipes', { target_id: profile.id, liked, comment });
    if (result.matched) openMatchModal(result.match_id, result.profile);
    return result;
  } catch (err) {
    alert(err.message);
    return null;
  } finally {
    swiping = false;
  }
}

async function swipeTop(liked, comment) {
  const profile = state.deck[0];
  if (!profile) return;
  const result = await swipe(profile, liked, comment);
  if (!result) return;
  state.deck.shift();
  window.scrollTo(0, 0);
  if (state.deck.length) renderDeck();
  else loadDeck();
}

$('#pass-btn').addEventListener('click', () => swipeTop(false));
$('#like-btn').addEventListener('click', () => {
  if (state.deck[0]) openLikeSheet(state.deck[0], (comment) => swipeTop(true, comment));
});

document.addEventListener('keydown', (e) => {
  if ($('#view-discover').classList.contains('hidden')) return;
  if (!$('#match-modal').classList.contains('hidden') || !$('#like-modal').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') swipeTop(true);
  if (e.key === 'ArrowLeft') swipeTop(false);
});

$('#open-filters').addEventListener('click', () => show('filters'));

// Like sheet: an optional comment goes with the like.

function openLikeSheet(profile, onDone) {
  state.liking = { profile, onDone };
  $('#like-title').textContent = `Like ${profile.name}?`;
  $('#like-form').comment.value = '';
  $('#like-modal').classList.remove('hidden');
  $('#like-form').comment.focus();
}

$('#like-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const { onDone } = state.liking;
  const comment = e.target.comment.value.trim();
  $('#like-modal').classList.add('hidden');
  onDone(comment);
});
$('#like-cancel').addEventListener('click', () => $('#like-modal').classList.add('hidden'));

function openMatchModal(matchId, profile) {
  state.pendingMatch = { matchId, profile };
  $('#match-avatars').replaceChildren(avatar(state.me), avatar(profile));
  $('#match-modal-text').textContent = `You and ${profile.name} like each other.`;
  $('#match-modal').classList.remove('hidden');
}

$('#match-close-btn').addEventListener('click', () => $('#match-modal').classList.add('hidden'));
$('#match-chat-btn').addEventListener('click', () => {
  $('#match-modal').classList.add('hidden');
  openChat(state.pendingMatch.matchId, state.pendingMatch.profile);
});

// ---- Filters ----

function renderFilters() {
  const o = state.options;
  const f = state.me.filters;
  const form = $('#filters-form');

  const showMe = el('div', { class: 'pills' });
  renderPills(showMe, 'interested_in', o.INTERESTS, state.me.interested_in);

  const ageMin = el('input', { type: 'number', name: 'min_age', min: 18, max: 99, value: f.min_age, required: true });
  const ageMax = el('input', { type: 'number', name: 'max_age', min: 18, max: 99, value: f.max_age, required: true });

  const anywhere = f.max_distance_km === null;
  const distance = el('input', { type: 'range', name: 'max_distance_km', min: 1, max: 200, value: f.max_distance_km ?? 50 });
  const distanceOut = el('span', { class: 'value' });
  const anywhereBox = el('input', { type: 'checkbox', name: 'anywhere', checked: anywhere });
  const syncDistance = () => {
    distance.disabled = anywhereBox.checked;
    distanceOut.textContent = anywhereBox.checked ? 'Anywhere' : `Within ${distance.value} km`;
  };
  distance.addEventListener('input', syncDistance);
  anywhereBox.addEventListener('change', syncDistance);
  syncDistance();

  const heights = heightChoices();
  const multi = (name, choices) => {
    const box = el('div', { class: 'pills' });
    renderPills(box, name, choices, f[name], { multi: true });
    return box;
  };

  const section = (title, hint, ...content) =>
    el('fieldset', {}, el('legend', {}, title), hint ? el('p', { class: 'hint' }, hint) : null, ...content);

  form.replaceChildren(
    section('Show me', null, showMe),
    section('Age range', null, el('div', { class: 'row' }, el('label', {}, 'From', ageMin), el('label', {}, 'To', ageMax))),
    section('Distance', state.me.latitude === null ? 'Share your location (Profile → Edit location) for distance filtering.' : null,
      distanceOut, distance, el('label', { class: 'inline' }, anywhereBox, ' Show people anywhere')),
    section('Height', null, el('div', { class: 'row' },
      selectField('min_height_cm', 'From', heights, f.min_height_cm ? String(f.min_height_cm) : '', 'Any'),
      selectField('max_height_cm', 'To', heights, f.max_height_cm ? String(f.max_height_cm) : '', 'Any'))),
    section('Looking for', 'Pick none to see everyone.', multi('looking_for', o.LOOKING_FOR)),
    section('Education', null, multi('education', o.EDUCATION)),
    section('Drinking', null, multi('drinking', o.HABITS)),
    section('Smoking', null, multi('smoking', o.HABITS)),
    section('Children', null, multi('kids', o.KIDS)),
    el('p', { class: 'hint' }, 'When you choose options above, people who haven\'t filled that in are hidden.'),
    el('p', { class: 'error', id: 'filters-error' }),
    el('button', { class: 'primary', type: 'submit' }, 'Apply filters'),
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
    show('discover');
  } catch (err) {
    $('#filters-error').textContent = err.message;
  }
});

$('#filters-back').addEventListener('click', () => show('discover'));
$('#filters-reset').addEventListener('click', async () => {
  ({ user: state.me } = await api('PUT', '/api/me/filters', state.options.DEFAULT_FILTERS));
  renderFilters();
});

// ---- Likes you ----

async function refreshLikesBadge() {
  try {
    const { likes } = await api('GET', '/api/likes');
    const badge = $('#likes-badge');
    badge.textContent = likes.length;
    badge.classList.toggle('hidden', likes.length === 0);
    return likes;
  } catch {
    return [];
  }
}

async function loadLikes() {
  const grid = $('#likes-grid');
  const likes = await refreshLikesBadge();
  if (!likes.length) {
    grid.replaceChildren(el('p', { class: 'empty' }, 'No new likes yet. Complete profiles with great prompts get more likes!'));
    return;
  }
  grid.replaceChildren(
    ...likes.map((l) =>
      el('button', { class: 'like-tile', onclick: () => openPerson(l.profile, 'likes') },
        photoBox(photoUrl(l.profile), 'tile-photo', initialOf(l.profile)),
        el('div', { class: 'tile-name' }, `${l.profile.name}, ${l.profile.age}`),
        l.comment ? el('div', { class: 'tile-comment' }, `“${l.comment}”`) : null)),
  );
}

// ---- Someone's full profile ----

function openPerson(profile, from) {
  state.person = { profile, from };
  show('person');
  $('#person-body').replaceChildren(renderProfile(profile));
  $('#person-actions').classList.toggle('hidden', from !== 'likes');
}

$('#person-back').addEventListener('click', () => {
  const { from } = state.person;
  if (from === 'chat') openChat(state.person.matchId, state.person.profile);
  else show(from);
});
$('#person-pass').addEventListener('click', async () => {
  if (await swipe(state.person.profile, false)) show('likes');
});
$('#person-like').addEventListener('click', () =>
  openLikeSheet(state.person.profile, async (comment) => {
    const result = await swipe(state.person.profile, true, comment);
    if (result?.matched) $('#person-actions').classList.add('hidden');
    else if (result) show('likes');
  }),
);

// ---- Matches ----

async function loadMatches() {
  const list = $('#match-list');
  try {
    const { matches } = await api('GET', '/api/matches');
    if (!matches.length) {
      list.replaceChildren(el('li', { class: 'empty' }, 'No matches yet. Keep liking!'));
      return;
    }
    list.replaceChildren(
      ...matches.map((m) =>
        el('li', { onclick: () => openChat(m.match_id, m.profile) },
          avatar(m.profile),
          el('div', { class: 'text' },
            el('div', { class: 'name' }, m.profile.name),
            el('div', { class: 'preview' }, m.last_message || 'New match. Say hi!')))),
    );
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
  if (state.chat) state.chat.timer = null;
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
    if (state.chat !== chat || !chat.timer) return;
    // The other person may have unmatched.
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
$('#chat-with').addEventListener('click', () => {
  const { profile, matchId } = state.chat;
  openPerson(profile, 'chat');
  state.person.matchId = matchId;
});
$('#unmatch-btn').addEventListener('click', async () => {
  if (!state.chat || !confirm(`Unmatch ${state.chat.profile.name}? This can't be undone.`)) return;
  try {
    await api('DELETE', `/api/matches/${state.chat.matchId}`);
    show('matches');
  } catch (err) {
    alert(err.message);
  }
});

// ---- My profile ----

function renderMyProfile() {
  $('#my-profile').replaceChildren(renderProfile(state.me));
}

$$('[data-edit]').forEach((b) => b.addEventListener('click', () => startSetup('edit', b.dataset.edit)));

// ---- Boot ----

(async function init() {
  state.options = await (await fetch('/api/options')).json();
  setupAuthForms();
  if (!state.token) return show('auth');
  try {
    ({ user: state.me } = await api('GET', '/api/me'));
    goHome();
  } catch {
    logoutLocal();
  }
})();
