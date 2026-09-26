const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/app');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const BENGALURU = { latitude: 12.9716, longitude: 77.5946 };
const MYSURU = { latitude: 12.2958, longitude: 76.6394 }; // ~125 km from Bengaluru

let server;
let base;
let uploadDir;

before(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dating-uploads-'));
  const app = createApp({ uploadDir });
  server = app.listen(0);
  server.app = app;
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

async function call(method, url, { token, body, raw, type } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (raw !== undefined) {
    headers['Content-Type'] = type || 'image/jpeg';
    payload = raw;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(base + url, { method, headers, body: payload });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

function birthdateForAge(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 1); // birthday already passed this year
  return d.toISOString().slice(0, 10);
}

let counter = 0;
async function signup(overrides = {}) {
  counter += 1;
  const body = {
    email: `user${counter}@example.com`,
    password: 'password123',
    name: `User${counter}`,
    birthdate: birthdateForAge(28),
    gender: 'woman',
    interested_in: 'everyone',
    ...overrides,
  };
  const res = await call('POST', '/api/signup', { body });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data;
}

// A user who has finished onboarding: 2 photos, a prompt and a location.
async function completeUser({ details = {}, filters, location = BENGALURU, ...signupFields } = {}) {
  const { token, user } = await signup(signupFields);
  await call('POST', '/api/me/photos', { token, raw: JPEG });
  await call('POST', '/api/me/photos', { token, raw: JPEG });
  await call('PUT', '/api/me/prompts', {
    token,
    body: { prompts: [{ prompt: 'A perfect first date', answer: 'Street food and a long walk' }] },
  });
  const res = await call('PUT', '/api/me', { token, body: { city: 'Somewhere', ...location, ...details } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  if (filters) {
    const f = await call('PUT', '/api/me/filters', { token, body: filters });
    assert.equal(f.status, 200, JSON.stringify(f.data));
  }
  assert.equal(res.data.user.profile_complete, true);
  return { token, user: res.data.user };
}

async function discoverIds(token) {
  const res = await call('GET', '/api/discover', { token });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.profiles.map((p) => p.id);
}

test('signup requires 18+ and a real date of birth', async () => {
  const base = { password: 'password123', name: 'X', gender: 'man', interested_in: 'woman' };
  const cases = [
    { email: 'kid@example.com', birthdate: birthdateForAge(17) },
    { email: 'bad@example.com', birthdate: '2000-02-30' },
    { email: 'fmt@example.com', birthdate: '01/01/1990' },
    { email: 'none@example.com' },
  ];
  for (const c of cases) {
    const res = await call('POST', '/api/signup', { body: { ...base, ...c } });
    assert.equal(res.status, 400, c.email);
  }
  const { user } = await signup({ birthdate: birthdateForAge(25) });
  assert.equal(user.age, 25);
  assert.equal(user.profile_complete, false);
  assert.deepEqual(user.missing, ['photos', 'prompts', 'location']);
});

test('login, duplicate email, logout', async () => {
  const { token } = await signup({ email: 'Alice@Example.com' });
  const dup = await call('POST', '/api/signup', {
    body: { email: 'alice@example.com', password: 'password123', name: 'A', birthdate: '1990-01-01', gender: 'woman', interested_in: 'man' },
  });
  assert.equal(dup.status, 409);
  assert.equal((await call('POST', '/api/login', { body: { email: 'alice@example.com', password: 'wrong-pass' } })).status, 401);
  const ok = await call('POST', '/api/login', { body: { email: 'ALICE@example.com', password: 'password123' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.password_hash, undefined);
  assert.equal((await call('POST', '/api/logout', { token })).status, 204);
  assert.equal((await call('GET', '/api/me', { token })).status, 401);
});

test('photo upload: type check, limit, delete', async () => {
  const { token } = await signup();
  const bad = await call('POST', '/api/me/photos', { token, raw: Buffer.from('<svg>hi</svg>'), type: 'image/jpeg' });
  assert.equal(bad.status, 400);

  const first = await call('POST', '/api/me/photos', { token, raw: JPEG });
  assert.equal(first.status, 201);
  assert.match(first.data.photo.url, /^\/uploads\/[0-9a-f]{32}\.jpg$/);
  const served = await fetch(base + first.data.photo.url);
  assert.equal(served.status, 200);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), JPEG);

  for (let i = 0; i < 5; i++) assert.equal((await call('POST', '/api/me/photos', { token, raw: JPEG })).status, 201);
  assert.equal((await call('POST', '/api/me/photos', { token, raw: JPEG })).status, 400, 'max 6 photos');

  const del = await call('DELETE', `/api/me/photos/${first.data.photo.id}`, { token });
  assert.equal(del.data.user.photos.length, 5);
  const other = await signup();
  assert.equal((await call('DELETE', `/api/me/photos/${del.data.user.photos[0].id}`, { token: other.token })).status, 404);
});

test('prompts must come from the list, be answered and be unique', async () => {
  const { token } = await signup();
  const put = (prompts) => call('PUT', '/api/me/prompts', { token, body: { prompts } });
  assert.equal((await put([{ prompt: 'Made up prompt', answer: 'x' }])).status, 400);
  assert.equal((await put([{ prompt: 'Typical Sunday', answer: '   ' }])).status, 400);
  assert.equal((await put([{ prompt: 'Typical Sunday', answer: 'a' }, { prompt: 'Typical Sunday', answer: 'b' }])).status, 400);
  const ok = await put([
    { prompt: 'Typical Sunday', answer: 'Dosa then a nap' },
    { prompt: 'I geek out on', answer: 'Maps' },
  ]);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data.user.prompts.map((p) => p.prompt), ['Typical Sunday', 'I geek out on']);
});

test('location is rounded and never shown to others', async () => {
  const { token } = await signup();
  const res = await call('PUT', '/api/me', { token, body: { city: 'Indiranagar, Bengaluru', latitude: 12.978412, longitude: 77.640823 } });
  assert.equal(res.data.user.latitude, 12.978);
  assert.equal(res.data.user.longitude, 77.641);
  assert.equal((await call('PUT', '/api/me', { token, body: { latitude: 100, longitude: 0 } })).status, 400);
});

test('incomplete profiles cannot browse and are not shown', async () => {
  const incomplete = await signup({ gender: 'woman', interested_in: 'man' });
  const viewer = await completeUser({ gender: 'man', interested_in: 'woman' });
  assert.equal((await call('GET', '/api/discover', { token: incomplete.token })).status, 403);
  assert.ok(!(await discoverIds(viewer.token)).includes(incomplete.user.id));
});

test('discover only shows the genders each person is interested in', async () => {
  const man = await completeUser({ gender: 'man', interested_in: 'woman' });
  const womanIntoMen = await completeUser({ gender: 'woman', interested_in: 'man' });
  const womanIntoWomen = await completeUser({ gender: 'woman', interested_in: 'woman' });
  const otherMan = await completeUser({ gender: 'man', interested_in: 'everyone' });
  const nonbinary = await completeUser({ gender: 'nonbinary', interested_in: 'everyone' });

  const ids = await discoverIds(man.token);
  assert.ok(ids.includes(womanIntoMen.user.id));
  assert.ok(!ids.includes(womanIntoWomen.user.id), 'she only wants women');
  assert.ok(!ids.includes(otherMan.user.id), 'he only wants women');
  assert.ok(!ids.includes(nonbinary.user.id), 'he only wants women');
  assert.ok(!ids.includes(man.user.id), 'never yourself');

  const nbIds = await discoverIds(nonbinary.token);
  assert.ok(nbIds.includes(otherMan.user.id));
  assert.ok(!nbIds.includes(man.user.id), 'man only wants women');
});

test('filters: age (both ways), distance, height and details', async () => {
  const me = await completeUser({
    gender: 'man',
    interested_in: 'man',
    birthdate: birthdateForAge(30),
    filters: { min_age: 25, max_age: 35, max_distance_km: 50, min_height_cm: 170, looking_for: ['long_term', 'long_term_open'] },
  });
  const make = (opts) =>
    completeUser({
      gender: 'man',
      interested_in: 'man',
      birthdate: birthdateForAge(opts.age ?? 29),
      location: opts.location ?? BENGALURU,
      details: { height_cm: 180, looking_for: 'long_term', ...opts.details },
      filters: opts.filters,
    });

  const good = await make({});
  const tooOld = await make({ age: 40 });
  const wantsOlder = await make({ filters: { min_age: 32, max_age: 45 } });
  const tooFar = await make({ location: MYSURU });
  const tooShort = await make({ details: { height_cm: 165 } });
  const noHeight = await make({ details: { height_cm: null } });
  const casual = await make({ details: { looking_for: 'short_term' } });

  const ids = await discoverIds(me.token);
  assert.ok(ids.includes(good.user.id));
  for (const [label, u] of Object.entries({ tooOld, wantsOlder, tooFar, tooShort, noHeight, casual })) {
    assert.ok(!ids.includes(u.user.id), label);
  }

  const profile = (await call('GET', '/api/discover', { token: me.token })).data.profiles.find((p) => p.id === good.user.id);
  assert.equal(profile.distance_km, 1);
  assert.equal(profile.latitude, undefined, 'coordinates stay private');
  assert.equal(profile.email, undefined);
  assert.equal(profile.photos.length, 2);
  assert.equal(profile.prompts[0].prompt, 'A perfect first date');

  // Widening the filters brings people back.
  await call('PUT', '/api/me/filters', { token: me.token, body: { min_age: 18, max_age: 99 } });
  const wider = await discoverIds(me.token);
  for (const u of [tooOld, tooFar, tooShort, noHeight, casual]) assert.ok(wider.includes(u.user.id));
  assert.ok(!wider.includes(wantsOlder.user.id), 'their own age filter still applies');
});

test('filter validation', async () => {
  const { token } = await signup();
  const put = (body) => call('PUT', '/api/me/filters', { token, body });
  assert.equal((await put({ min_age: 40, max_age: 30 })).status, 400);
  assert.equal((await put({ max_distance_km: 0 })).status, 400);
  assert.equal((await put({ drinking: ['maybe'] })).status, 400);
  assert.equal((await put({ min_height_cm: 190, max_height_cm: 160 })).status, 400);
  const ok = await put({ max_distance_km: 25, drinking: ['no', 'no', 'sometimes'] });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.filters.max_distance_km, 25);
  assert.deepEqual(ok.data.user.filters.drinking, ['no', 'sometimes']);
  assert.equal(ok.data.user.filters.min_age, 18);
});

test('likes with comments, Likes You, matching and chat', async () => {
  const a = await completeUser({ gender: 'man', interested_in: 'woman' });
  const b = await completeUser({ gender: 'woman', interested_in: 'man' });

  const like = await call('POST', '/api/swipes', {
    token: a.token,
    body: { target_id: b.user.id, liked: true, comment: 'Your first-date idea is perfect' },
  });
  assert.equal(like.data.matched, false);
  assert.ok(!(await discoverIds(a.token)).includes(b.user.id), 'swiped people leave the feed');

  const likes = await call('GET', '/api/likes', { token: b.token });
  assert.equal(likes.data.likes.length, 1);
  assert.equal(likes.data.likes[0].profile.id, a.user.id);
  assert.equal(likes.data.likes[0].comment, 'Your first-date idea is perfect');

  const back = await call('POST', '/api/swipes', { token: b.token, body: { target_id: a.user.id, liked: true, comment: 'Thanks!' } });
  assert.equal(back.data.matched, true);
  const matchId = back.data.match_id;
  assert.equal((await call('GET', '/api/likes', { token: b.token })).data.likes.length, 0);

  const opening = await call('GET', `/api/matches/${matchId}/messages`, { token: a.token });
  assert.deepEqual(
    opening.data.messages.map((m) => [m.sender_id, m.body]),
    [[a.user.id, 'Your first-date idea is perfect'], [b.user.id, 'Thanks!']],
  );

  const sent = await call('POST', `/api/matches/${matchId}/messages`, { token: a.token, body: { body: 'Coffee this week?' } });
  assert.equal(sent.status, 201);
  const matches = await call('GET', '/api/matches', { token: b.token });
  assert.equal(matches.data.matches[0].last_message, 'Coffee this week?');

  const outsider = await completeUser();
  assert.equal((await call('GET', `/api/matches/${matchId}/messages`, { token: outsider.token })).status, 404);

  assert.equal((await call('DELETE', `/api/matches/${matchId}`, { token: b.token })).status, 204);
  assert.equal((await call('GET', '/api/matches', { token: a.token })).data.matches.length, 0);
});

test('a pass never matches and hides the like', async () => {
  const a = await completeUser({ gender: 'man', interested_in: 'woman' });
  const b = await completeUser({ gender: 'woman', interested_in: 'man' });
  await call('POST', '/api/swipes', { token: a.token, body: { target_id: b.user.id, liked: true } });
  await call('POST', '/api/swipes', { token: b.token, body: { target_id: a.user.id, liked: false } });
  assert.equal((await call('GET', '/api/likes', { token: b.token })).data.likes.length, 0);
  assert.equal((await call('GET', '/api/matches', { token: a.token })).data.matches.length, 0);
});

test('swipe validation', async () => {
  const a = await completeUser();
  const post = (body, token = a.token) => call('POST', '/api/swipes', { token, body });
  assert.equal((await post({ target_id: a.user.id, liked: true })).status, 400);
  assert.equal((await post({ target_id: 999999, liked: true })).status, 404);
  assert.equal((await post({ target_id: 1, liked: 'yes' })).status, 400);
  assert.equal((await post({ target_id: 1, liked: true }, null)).status, 401);
  const incomplete = await signup();
  assert.equal((await post({ target_id: a.user.id, liked: true }, incomplete.token)).status, 403);
});

test('liking a specific photo or prompt (Hinge-style)', async () => {
  const a = await completeUser({ gender: 'man', interested_in: 'woman' });
  const b = await completeUser({ gender: 'woman', interested_in: 'man' });
  const c = await completeUser({ gender: 'woman', interested_in: 'man' });
  const like = (token, body) => call('POST', '/api/swipes', { token, body });

  // The item must exist on the liked person's profile.
  const otherPhoto = c.user.photos[0].id;
  assert.equal((await like(a.token, { target_id: b.user.id, liked: true, item: { type: 'photo', photo_id: otherPhoto } })).status, 400);
  assert.equal((await like(a.token, { target_id: b.user.id, liked: true, item: { type: 'prompt', prompt: 'Typical Sunday' } })).status, 400);
  assert.equal((await like(a.token, { target_id: b.user.id, liked: true, item: { type: 'video' } })).status, 400);

  const photo = b.user.photos[1];
  assert.equal((await like(a.token, { target_id: b.user.id, liked: true, item: { type: 'photo', photo_id: photo.id }, comment: 'Great shot' })).status, 200);
  assert.equal((await like(a.token, { target_id: c.user.id, liked: true, item: { type: 'prompt', prompt: 'A perfect first date' } })).status, 200);

  const bLikes = (await call('GET', '/api/likes', { token: b.token })).data.likes;
  assert.deepEqual(bLikes[0].item, { type: 'photo', url: photo.url });
  assert.equal(bLikes[0].comment, 'Great shot');
  const cLikes = (await call('GET', '/api/likes', { token: c.token })).data.likes;
  assert.deepEqual(cLikes[0].item, { type: 'prompt', prompt: 'A perfect first date', answer: 'Street food and a long walk' });

  // If the liked photo is deleted, the like stays but without the item.
  await call('DELETE', `/api/me/photos/${photo.id}`, { token: b.token });
  assert.equal((await call('GET', '/api/likes', { token: b.token })).data.likes[0].item, null);
});

test('matches report who sent the last message ("your move")', async () => {
  const a = await completeUser({ gender: 'man', interested_in: 'woman' });
  const b = await completeUser({ gender: 'woman', interested_in: 'man' });
  await call('POST', '/api/swipes', { token: a.token, body: { target_id: b.user.id, liked: true } });
  const { data } = await call('POST', '/api/swipes', { token: b.token, body: { target_id: a.user.id, liked: true } });
  let m = (await call('GET', '/api/matches', { token: a.token })).data.matches[0];
  assert.equal(m.last_sender_id, null);
  await call('POST', `/api/matches/${data.match_id}/messages`, { token: b.token, body: { body: 'Hey!' } });
  m = (await call('GET', '/api/matches', { token: a.token })).data.matches[0];
  assert.equal(m.last_sender_id, b.user.id);
});

test('upgrading a v2 database keeps existing data', () => {
  const { DatabaseSync } = require('node:sqlite');
  const { openDb } = require('../src/db');
  const file = path.join(uploadDir, 'v2.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
            CREATE TABLE swipes (swiper_id INTEGER, target_id INTEGER, liked INTEGER, comment TEXT NOT NULL DEFAULT '',
                                 created_at TEXT, PRIMARY KEY (swiper_id, target_id));
            INSERT INTO users (id, email) VALUES (1, 'kept@example.com');
            INSERT INTO swipes (swiper_id, target_id, liked) VALUES (1, 2, 1);
            PRAGMA user_version = 2;`);
  old.close();
  const db = openDb(file);
  assert.equal(db.prepare('SELECT email FROM users').get().email, 'kept@example.com');
  assert.equal(db.prepare('SELECT liked_item FROM swipes').get().liked_item, null);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 4);
  assert.equal(db.prepare('SELECT super FROM swipes').get().super, 0);
  db.close();
});

test('SuperSwipes: limited per day and shown first in Likes You', async () => {
  const me = await completeUser({ gender: 'woman', interested_in: 'man' });
  const fans = [];
  for (let i = 0; i < 5; i++) fans.push(await completeUser({ gender: 'man', interested_in: 'woman' }));
  const swipe = (token, body) => call('POST', '/api/swipes', { token, body });

  assert.equal((await swipe(fans[0].token, { target_id: me.user.id, liked: false, super: true })).status, 400);
  await swipe(fans[0].token, { target_id: me.user.id, liked: true });
  const sup = await swipe(fans[1].token, { target_id: me.user.id, liked: true, super: true });
  assert.equal(sup.status, 200);
  assert.equal(sup.data.super_swipes_left, 2);

  const likes = (await call('GET', '/api/likes', { token: me.token })).data.likes;
  assert.equal(likes[0].profile.id, fans[1].user.id, 'SuperSwipes come first');
  assert.equal(likes[0].super, true);
  assert.equal(likes[1].super, false);

  // Three per day.
  const heavy = fans[2];
  const targets = [me];
  for (let i = 0; i < 3; i++) targets.push(await completeUser({ gender: 'woman', interested_in: 'man' }));
  for (const t of targets.slice(0, 3)) {
    assert.equal((await swipe(heavy.token, { target_id: t.user.id, liked: true, super: true })).status, 200);
  }
  const over = await swipe(heavy.token, { target_id: targets[3].user.id, liked: true, super: true });
  assert.equal(over.status, 429);
  assert.equal((await call('GET', '/api/me', { token: heavy.token })).data.user.super_swipes_left, 0);
});

test('blocking hides people both ways and removes the match', async () => {
  const a = await completeUser({ gender: 'man', interested_in: 'woman' });
  const b = await completeUser({ gender: 'woman', interested_in: 'man' });
  await call('POST', '/api/swipes', { token: a.token, body: { target_id: b.user.id, liked: true } });
  await call('POST', '/api/swipes', { token: b.token, body: { target_id: a.user.id, liked: true } });
  assert.equal((await call('GET', '/api/matches', { token: a.token })).data.matches.length, 1);

  assert.equal((await call('POST', `/api/users/${a.user.id}/block`, { token: a.token })).status, 400, 'not yourself');
  assert.equal((await call('POST', `/api/users/${b.user.id}/block`, { token: a.token })).status, 204);
  assert.equal((await call('GET', '/api/matches', { token: b.token })).data.matches.length, 0);

  // Blocked people never see each other in Discover or Likes You, and can't like each other.
  const fresh = await completeUser({ gender: 'woman', interested_in: 'man' });
  await call('POST', `/api/users/${fresh.user.id}/block`, { token: a.token });
  assert.ok(!(await discoverIds(a.token)).includes(fresh.user.id));
  assert.ok(!(await discoverIds(fresh.token)).includes(a.user.id));
  assert.equal((await call('POST', '/api/swipes', { token: fresh.token, body: { target_id: a.user.id, liked: true } })).status, 404);
  assert.ok(!(await call('GET', '/api/likes', { token: a.token })).data.likes.some((l) => l.profile.id === fresh.user.id));
  assert.equal((await call('POST', '/api/swipes', { token: a.token, body: { target_id: fresh.user.id, liked: true } })).status, 404);
});

test('reporting needs a valid reason and also blocks', async () => {
  const a = await completeUser({ gender: 'man', interested_in: 'woman' });
  const b = await completeUser({ gender: 'woman', interested_in: 'man' });
  const report = (body) => call('POST', `/api/users/${b.user.id}/report`, { token: a.token, body });
  assert.equal((await report({ reason: 'boring' })).status, 400);
  assert.equal((await report({})).status, 400);
  assert.equal((await report({ reason: 'fake', details: 'Asked me for money' })).status, 201);
  assert.ok(!(await discoverIds(a.token)).includes(b.user.id));
  const row = server.app.locals.db.prepare('SELECT reason, details FROM reports WHERE reported_id = ?').get(b.user.id);
  assert.equal(row.reason, 'fake');
  assert.equal(row.details, 'Asked me for money');
});

test('matches expire after 24h without a message', async () => {
  const a = await completeUser({ gender: 'man', interested_in: 'woman' });
  const b = await completeUser({ gender: 'woman', interested_in: 'man' });
  await call('POST', '/api/swipes', { token: a.token, body: { target_id: b.user.id, liked: true } });
  const { data } = await call('POST', '/api/swipes', { token: b.token, body: { target_id: a.user.id, liked: true } });
  let m = (await call('GET', '/api/matches', { token: a.token })).data.matches[0];
  assert.equal(m.expired, false);
  assert.ok(new Date(m.expires_at) > new Date());

  server.app.locals.db.prepare("UPDATE matches SET created_at = datetime('now', '-25 hours') WHERE id = ?").run(data.match_id);
  m = (await call('GET', '/api/matches', { token: a.token })).data.matches[0];
  assert.equal(m.expired, true);
  const send = await call('POST', `/api/matches/${data.match_id}/messages`, { token: a.token, body: { body: 'Hi!' } });
  assert.equal(send.status, 410);
});

test('a conversation that started never expires', async () => {
  const a = await completeUser({ gender: 'man', interested_in: 'woman' });
  const b = await completeUser({ gender: 'woman', interested_in: 'man' });
  await call('POST', '/api/swipes', { token: a.token, body: { target_id: b.user.id, liked: true } });
  const { data } = await call('POST', '/api/swipes', { token: b.token, body: { target_id: a.user.id, liked: true } });
  await call('POST', `/api/matches/${data.match_id}/messages`, { token: a.token, body: { body: 'Hi!' } });
  server.app.locals.db.prepare("UPDATE matches SET created_at = datetime('now', '-5 days') WHERE id = ?").run(data.match_id);
  const m = (await call('GET', '/api/matches', { token: b.token })).data.matches[0];
  assert.equal(m.expired, false);
  assert.equal((await call('POST', `/api/matches/${data.match_id}/messages`, { token: b.token, body: { body: 'Hey' } })).status, 201);
});

test('recommendations explain what you have in common', async () => {
  const me = await completeUser({ gender: 'nonbinary', interested_in: 'everyone', details: { looking_for: 'friends', hometown: 'Guwahati' } });
  const twin = await completeUser({ gender: 'nonbinary', interested_in: 'everyone', details: { looking_for: 'friends', hometown: 'Guwahati' } });
  const res = await call('GET', '/api/recommended', { token: me.token });
  assert.equal(res.status, 200);
  const pick = res.data.recommended.find((p) => p.id === twin.user.id);
  assert.ok(pick, 'the most similar person is recommended');
  assert.equal(pick.common_ground[0], 'You both want: new friends');
  assert.ok(pick.common_ground.includes('You both answered "A perfect first date"'));
  assert.ok(pick.common_ground.includes("You're both from Guwahati"));
  assert.equal(pick.hometown, 'Guwahati');
  assert.equal(res.data.recommended[0].id, twin.user.id, 'highest score first');
});
