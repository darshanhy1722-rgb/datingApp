const path = require('node:path');
const express = require('express');
const { openDb } = require('./db');
const { hashPassword, verifyPassword, newToken } = require('./auth');

const GENDERS = ['man', 'woman', 'nonbinary'];
const INTERESTS = ['man', 'woman', 'everyone'];
const MAX_MESSAGE_LENGTH = 2000;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function publicProfile(u) {
  return {
    id: u.id,
    name: u.name,
    age: u.age,
    gender: u.gender,
    bio: u.bio,
    city: u.city,
    photo_url: u.photo_url,
  };
}

function ownProfile(u) {
  return {
    ...publicProfile(u),
    email: u.email,
    interested_in: u.interested_in,
    min_age: u.min_age,
    max_age: u.max_age,
  };
}

function toInt(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new HttpError(400, `${field} must be a whole number`);
  return n;
}

function trimmed(value, field, maxLen) {
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
  const s = value.trim();
  if (s.length > maxLen) throw new HttpError(400, `${field} must be at most ${maxLen} characters`);
  return s;
}

// Validates the editable profile fields. With `partial`, missing fields are skipped.
function validateProfile(body, { partial }) {
  const out = {};
  const has = (k) => body[k] !== undefined;
  const need = (k) => {
    if (!partial && !has(k)) throw new HttpError(400, `${k} is required`);
    return has(k);
  };

  if (need('name')) {
    out.name = trimmed(body.name, 'name', 50);
    if (!out.name) throw new HttpError(400, 'name is required');
  }
  if (need('age')) {
    out.age = toInt(body.age, 'age');
    if (out.age < 18 || out.age > 120) throw new HttpError(400, 'You must be 18 or older');
  }
  if (need('gender')) {
    if (!GENDERS.includes(body.gender)) throw new HttpError(400, `gender must be one of ${GENDERS.join(', ')}`);
    out.gender = body.gender;
  }
  if (need('interested_in')) {
    if (!INTERESTS.includes(body.interested_in)) {
      throw new HttpError(400, `interested_in must be one of ${INTERESTS.join(', ')}`);
    }
    out.interested_in = body.interested_in;
  }
  if (has('min_age')) out.min_age = toInt(body.min_age, 'min_age');
  if (has('max_age')) out.max_age = toInt(body.max_age, 'max_age');
  if (has('bio')) out.bio = trimmed(body.bio, 'bio', 500);
  if (has('city')) out.city = trimmed(body.city, 'city', 80);
  if (has('photo_url')) {
    out.photo_url = trimmed(body.photo_url, 'photo_url', 500);
    if (out.photo_url && !/^https?:\/\//i.test(out.photo_url)) {
      throw new HttpError(400, 'photo_url must start with http:// or https://');
    }
  }
  return out;
}

function checkAgeRange(minAge, maxAge) {
  if (minAge < 18 || maxAge > 120 || minAge > maxAge) {
    throw new HttpError(400, 'Age range must be between 18 and 120, with min_age <= max_age');
  }
}

function createApp({ dbPath = ':memory:' } = {}) {
  const db = openDb(dbPath);
  const app = express();
  app.locals.db = db;

  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userBySession: db.prepare(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?',
    ),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    upsertSwipe: db.prepare(
      `INSERT INTO swipes (swiper_id, target_id, liked) VALUES (?, ?, ?)
       ON CONFLICT (swiper_id, target_id) DO UPDATE SET liked = excluded.liked, created_at = datetime('now')`,
    ),
    likedBy: db.prepare('SELECT 1 FROM swipes WHERE swiper_id = ? AND target_id = ? AND liked = 1'),
    insertMatch: db.prepare('INSERT OR IGNORE INTO matches (user_a, user_b) VALUES (?, ?)'),
    matchByPair: db.prepare('SELECT * FROM matches WHERE user_a = ? AND user_b = ?'),
    matchForUser: db.prepare('SELECT * FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?)'),
    deleteMatch: db.prepare('DELETE FROM matches WHERE id = ?'),
    discover: db.prepare(
      `SELECT u.* FROM users u
       WHERE u.id != :me
         AND (:interested_in = 'everyone' OR u.gender = :interested_in)
         AND (u.interested_in = 'everyone' OR u.interested_in = :gender)
         AND u.age BETWEEN :min_age AND :max_age
         AND :age BETWEEN u.min_age AND u.max_age
         AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = :me AND s.target_id = u.id)
       ORDER BY RANDOM()
       LIMIT :limit`,
    ),
    matches: db.prepare(
      `SELECT m.id AS match_id, m.created_at AS matched_at, u.*,
              (SELECT body FROM messages WHERE match_id = m.id ORDER BY id DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages WHERE match_id = m.id ORDER BY id DESC LIMIT 1) AS last_message_at
       FROM matches m
       JOIN users u ON u.id = CASE WHEN m.user_a = :me THEN m.user_b ELSE m.user_a END
       WHERE m.user_a = :me OR m.user_b = :me
       ORDER BY COALESCE(last_message_at, m.created_at) DESC`,
    ),
    messagesAfter: db.prepare(
      'SELECT id, sender_id, body, created_at FROM messages WHERE match_id = ? AND id > ? ORDER BY id LIMIT 200',
    ),
    insertMessage: db.prepare(
      'INSERT INTO messages (match_id, sender_id, body) VALUES (?, ?, ?) RETURNING id, sender_id, body, created_at',
    ),
  };

  function startSession(userId) {
    const token = newToken();
    q.insertSession.run(token, userId);
    return token;
  }

  function requireAuth(req, _res, next) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = token && q.userBySession.get(token);
    if (!user) return next(new HttpError(401, 'Please log in'));
    req.user = user;
    req.token = token;
    next();
  }

  function loadMatch(req) {
    const id = toInt(req.params.id, 'match id');
    const match = q.matchForUser.get(id, req.user.id, req.user.id);
    if (!match) throw new HttpError(404, 'Match not found');
    return match;
  }

  // ---- Auth ----

  app.post('/api/signup', (req, res) => {
    const body = req.body || {};
    const email = trimmed(body.email ?? '', 'email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'A valid email is required');
    if (typeof body.password !== 'string' || body.password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }
    const p = validateProfile(body, { partial: false });
    const minAge = p.min_age ?? 18;
    const maxAge = p.max_age ?? 99;
    checkAgeRange(minAge, maxAge);
    if (q.userByEmail.get(email)) throw new HttpError(409, 'An account with that email already exists');

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO users (email, password_hash, name, age, gender, interested_in, min_age, max_age, bio, city, photo_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        email,
        hashPassword(body.password),
        p.name,
        p.age,
        p.gender,
        p.interested_in,
        minAge,
        maxAge,
        p.bio ?? '',
        p.city ?? '',
        p.photo_url ?? '',
      );
    const user = q.userById.get(lastInsertRowid);
    res.status(201).json({ token: startSession(user.id), user: ownProfile(user) });
  });

  app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = typeof email === 'string' && q.userByEmail.get(email.trim().toLowerCase());
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'Incorrect email or password');
    }
    res.json({ token: startSession(user.id), user: ownProfile(user) });
  });

  app.post('/api/logout', requireAuth, (req, res) => {
    q.deleteSession.run(req.token);
    res.status(204).end();
  });

  // ---- Profile ----

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: ownProfile(req.user) });
  });

  app.put('/api/me', requireAuth, (req, res) => {
    const changes = validateProfile(req.body || {}, { partial: true });
    checkAgeRange(changes.min_age ?? req.user.min_age, changes.max_age ?? req.user.max_age);
    const fields = Object.keys(changes);
    if (fields.length) {
      const sets = fields.map((f) => `${f} = ?`).join(', ');
      db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...fields.map((f) => changes[f]), req.user.id);
    }
    res.json({ user: ownProfile(q.userById.get(req.user.id)) });
  });

  // ---- Discovery & swiping ----

  app.get('/api/discover', requireAuth, (req, res) => {
    const me = req.user;
    const rows = q.discover.all({
      me: me.id,
      gender: me.gender,
      interested_in: me.interested_in,
      age: me.age,
      min_age: me.min_age,
      max_age: me.max_age,
      limit: 20,
    });
    res.json({ profiles: rows.map(publicProfile) });
  });

  app.post('/api/swipes', requireAuth, (req, res) => {
    const { target_id, liked } = req.body || {};
    const targetId = toInt(target_id, 'target_id');
    if (typeof liked !== 'boolean') throw new HttpError(400, 'liked must be true or false');
    if (targetId === req.user.id) throw new HttpError(400, "You can't swipe on yourself");
    const target = q.userById.get(targetId);
    if (!target) throw new HttpError(404, 'User not found');

    q.upsertSwipe.run(req.user.id, targetId, liked ? 1 : 0);

    if (liked && q.likedBy.get(targetId, req.user.id)) {
      const [a, b] = req.user.id < targetId ? [req.user.id, targetId] : [targetId, req.user.id];
      q.insertMatch.run(a, b);
      const match = q.matchByPair.get(a, b);
      return res.json({ matched: true, match_id: match.id, profile: publicProfile(target) });
    }
    res.json({ matched: false });
  });

  // ---- Matches & chat ----

  app.get('/api/matches', requireAuth, (req, res) => {
    const rows = q.matches.all({ me: req.user.id });
    res.json({
      matches: rows.map((r) => ({
        match_id: r.match_id,
        matched_at: r.matched_at,
        last_message: r.last_message,
        last_message_at: r.last_message_at,
        profile: publicProfile(r),
      })),
    });
  });

  app.delete('/api/matches/:id', requireAuth, (req, res) => {
    const match = loadMatch(req);
    q.deleteMatch.run(match.id);
    res.status(204).end();
  });

  app.get('/api/matches/:id/messages', requireAuth, (req, res) => {
    const match = loadMatch(req);
    const after = req.query.after === undefined ? 0 : toInt(req.query.after, 'after');
    res.json({ messages: q.messagesAfter.all(match.id, after) });
  });

  app.post('/api/matches/:id/messages', requireAuth, (req, res) => {
    const match = loadMatch(req);
    const body = trimmed((req.body || {}).body ?? '', 'body', MAX_MESSAGE_LENGTH);
    if (!body) throw new HttpError(400, 'Message cannot be empty');
    res.status(201).json({ message: q.insertMessage.get(match.id, req.user.id, body) });
  });

  // ---- Errors ----

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON body');
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
  });

  return app;
}

module.exports = { createApp };
