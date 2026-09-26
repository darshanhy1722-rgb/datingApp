const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

let server;
let base;

before(async () => {
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

let counter = 0;
async function signup(overrides = {}) {
  counter += 1;
  const body = {
    email: `user${counter}@example.com`,
    password: 'password123',
    name: `User${counter}`,
    age: 28,
    gender: 'woman',
    interested_in: 'everyone',
    ...overrides,
  };
  const res = await call('POST', '/api/signup', { body });
  assert.equal(res.status, 201, JSON.stringify(res.data));
  return res.data;
}

test('signup validates input', async () => {
  const young = await call('POST', '/api/signup', {
    body: { email: 'kid@example.com', password: 'password123', name: 'Kid', age: 16, gender: 'man', interested_in: 'woman' },
  });
  assert.equal(young.status, 400);

  const shortPw = await call('POST', '/api/signup', {
    body: { email: 'pw@example.com', password: 'short', name: 'Pw', age: 20, gender: 'man', interested_in: 'woman' },
  });
  assert.equal(shortPw.status, 400);

  const badPhoto = await call('POST', '/api/signup', {
    body: {
      email: 'photo@example.com', password: 'password123', name: 'P', age: 20,
      gender: 'man', interested_in: 'woman', photo_url: 'javascript:alert(1)',
    },
  });
  assert.equal(badPhoto.status, 400);
});

test('signup, login, duplicate email, logout', async () => {
  const { user, token } = await signup({ email: 'Alice@Example.com' });
  assert.equal(user.email, 'alice@example.com');
  assert.equal(user.password_hash, undefined);

  const dup = await call('POST', '/api/signup', {
    body: { email: 'alice@example.com', password: 'password123', name: 'A', age: 30, gender: 'woman', interested_in: 'man' },
  });
  assert.equal(dup.status, 409);

  const wrong = await call('POST', '/api/login', { body: { email: 'alice@example.com', password: 'nope-nope' } });
  assert.equal(wrong.status, 401);

  const ok = await call('POST', '/api/login', { body: { email: 'ALICE@example.com', password: 'password123' } });
  assert.equal(ok.status, 200);

  assert.equal((await call('GET', '/api/me', { token })).status, 200);
  assert.equal((await call('POST', '/api/logout', { token })).status, 204);
  assert.equal((await call('GET', '/api/me', { token })).status, 401);
});

test('profile update', async () => {
  const { token } = await signup();
  const res = await call('PUT', '/api/me', { token, body: { bio: '  Hello!  ', min_age: 25, max_age: 35 } });
  assert.equal(res.status, 200);
  assert.equal(res.data.user.bio, 'Hello!');
  assert.equal(res.data.user.min_age, 25);

  const bad = await call('PUT', '/api/me', { token, body: { min_age: 40, max_age: 30 } });
  assert.equal(bad.status, 400);
});

test('discover respects gender and age preferences on both sides', async () => {
  const man = await signup({ gender: 'man', interested_in: 'woman', age: 30, min_age: 25, max_age: 35 });
  const womanForMen = await signup({ gender: 'woman', interested_in: 'man', age: 29 });
  const womanForWomen = await signup({ gender: 'woman', interested_in: 'woman', age: 29 });
  const tooOld = await signup({ gender: 'woman', interested_in: 'man', age: 50 });
  const wantsYounger = await signup({ gender: 'woman', interested_in: 'everyone', age: 27, max_age: 26 });
  const otherMan = await signup({ gender: 'man', interested_in: 'everyone', age: 30 });

  const { data } = await call('GET', '/api/discover', { token: man.token });
  const ids = data.profiles.map((p) => p.id);
  assert.ok(ids.includes(womanForMen.user.id));
  assert.ok(!ids.includes(womanForWomen.user.id), 'she is not interested in men');
  assert.ok(!ids.includes(tooOld.user.id), 'outside his age range');
  assert.ok(!ids.includes(wantsYounger.user.id), 'he is outside her age range');
  assert.ok(!ids.includes(otherMan.user.id), 'he is only interested in women');
  assert.ok(!ids.includes(man.user.id), 'never shows yourself');
  assert.equal(data.profiles[0].email, undefined, 'emails are private');
});

test('mutual likes create a match; chat works; unmatch removes it', async () => {
  const a = await signup({ gender: 'man', interested_in: 'woman' });
  const b = await signup({ gender: 'woman', interested_in: 'man' });
  const c = await signup({ gender: 'woman', interested_in: 'man' });

  const first = await call('POST', '/api/swipes', { token: a.token, body: { target_id: b.user.id, liked: true } });
  assert.deepEqual(first.data, { matched: false });

  // Swiped profiles no longer appear in discover.
  const disc = await call('GET', '/api/discover', { token: a.token });
  assert.ok(!disc.data.profiles.some((p) => p.id === b.user.id));

  const second = await call('POST', '/api/swipes', { token: b.token, body: { target_id: a.user.id, liked: true } });
  assert.equal(second.data.matched, true);
  const matchId = second.data.match_id;

  // A pass never matches.
  await call('POST', '/api/swipes', { token: c.token, body: { target_id: a.user.id, liked: false } });
  const noMatch = await call('POST', '/api/swipes', { token: a.token, body: { target_id: c.user.id, liked: true } });
  assert.equal(noMatch.data.matched, false);

  const aMatches = await call('GET', '/api/matches', { token: a.token });
  assert.equal(aMatches.data.matches.length, 1);
  assert.equal(aMatches.data.matches[0].profile.id, b.user.id);

  const sent = await call('POST', `/api/matches/${matchId}/messages`, { token: a.token, body: { body: 'Hi there!' } });
  assert.equal(sent.status, 201);
  const reply = await call('POST', `/api/matches/${matchId}/messages`, { token: b.token, body: { body: 'Hey :)' } });

  const all = await call('GET', `/api/matches/${matchId}/messages`, { token: b.token });
  assert.deepEqual(all.data.messages.map((m) => m.body), ['Hi there!', 'Hey :)']);
  const newer = await call('GET', `/api/matches/${matchId}/messages?after=${sent.data.message.id}`, { token: a.token });
  assert.deepEqual(newer.data.messages.map((m) => m.id), [reply.data.message.id]);

  // Outsiders can't read or post.
  assert.equal((await call('GET', `/api/matches/${matchId}/messages`, { token: c.token })).status, 404);
  assert.equal(
    (await call('POST', `/api/matches/${matchId}/messages`, { token: c.token, body: { body: 'x' } })).status,
    404,
  );
  assert.equal((await call('POST', `/api/matches/${matchId}/messages`, { token: a.token, body: { body: '  ' } })).status, 400);

  assert.equal((await call('DELETE', `/api/matches/${matchId}`, { token: b.token })).status, 204);
  assert.equal((await call('GET', '/api/matches', { token: a.token })).data.matches.length, 0);
  assert.equal((await call('GET', `/api/matches/${matchId}/messages`, { token: a.token })).status, 404);
});

test('swipe validation', async () => {
  const a = await signup();
  assert.equal((await call('POST', '/api/swipes', { token: a.token, body: { target_id: a.user.id, liked: true } })).status, 400);
  assert.equal((await call('POST', '/api/swipes', { token: a.token, body: { target_id: 999999, liked: true } })).status, 404);
  assert.equal((await call('POST', '/api/swipes', { token: a.token, body: { target_id: 1, liked: 'yes' } })).status, 400);
  assert.equal((await call('POST', '/api/swipes', { body: { target_id: 1, liked: true } })).status, 401);
});
