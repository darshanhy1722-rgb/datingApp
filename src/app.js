const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { openDb, transaction } = require('./db');
const { hashPassword, verifyPassword, newToken } = require('./auth');
const options = require('./options');
const {
  HttpError,
  ageFrom,
  validateBirthdate,
  text,
  int,
  validateDetails,
  normalizeFilters,
  parseFilters,
  passesFilters,
  DEFAULT_FILTERS,
} = require('./profile');

const { PROMPTS, LIMITS, REPORT_REASONS, LOOKING_FOR, KIDS, TERMS_VERSION } = options;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_COMMENT_LENGTH = 300;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const DISCOVER_PAGE_SIZE = 20;
const RECOMMENDED_SIZE = 10;

// Times in the database are UTC "YYYY-MM-DD HH:MM:SS".
const parseDbTime = (s) => new Date(`${s.replace(' ', 'T')}Z`);

// Identify uploads by their leading bytes rather than trusting the Content-Type header.
function imageExtension(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function createApp({ dbPath = ':memory:', uploadDir = path.join(__dirname, '..', 'uploads') } = {}) {
  const db = openDb(dbPath);
  fs.mkdirSync(uploadDir, { recursive: true });

  const app = express();
  app.locals.db = db;

  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/uploads', express.static(uploadDir, { fallthrough: false, maxAge: '7d' }));

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userBySession: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token = ?'),

    photos: db.prepare('SELECT id, url FROM photos WHERE user_id = ? ORDER BY id'),
    photoCount: db.prepare('SELECT COUNT(*) AS n FROM photos WHERE user_id = ?'),
    insertPhoto: db.prepare('INSERT INTO photos (user_id, url) VALUES (?, ?) RETURNING id, url'),
    photoById: db.prepare('SELECT * FROM photos WHERE id = ? AND user_id = ?'),
    deletePhoto: db.prepare('DELETE FROM photos WHERE id = ?'),

    prompts: db.prepare('SELECT prompt, answer FROM prompts WHERE user_id = ? ORDER BY position'),
    deletePrompts: db.prepare('DELETE FROM prompts WHERE user_id = ?'),
    insertPrompt: db.prepare('INSERT INTO prompts (user_id, position, prompt, answer) VALUES (?, ?, ?, ?)'),

    updateFilters: db.prepare('UPDATE users SET filters = ? WHERE id = ?'),
    acceptTerms: db.prepare("UPDATE users SET terms_version = ?, terms_accepted_at = datetime('now') WHERE id = ?"),

    upsertSwipe: db.prepare(
      `INSERT INTO swipes (swiper_id, target_id, liked, comment, liked_item, super) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (swiper_id, target_id)
       DO UPDATE SET liked = excluded.liked, comment = excluded.comment, liked_item = excluded.liked_item,
                     super = excluded.super, created_at = datetime('now')`,
    ),
    superSwipesToday: db.prepare(
      "SELECT COUNT(*) AS n FROM swipes WHERE swiper_id = ? AND super = 1 AND created_at > datetime('now', '-1 day')",
    ),
    likeFrom: db.prepare('SELECT comment FROM swipes WHERE swiper_id = ? AND target_id = ? AND liked = 1'),
    insertMatch: db.prepare('INSERT OR IGNORE INTO matches (user_a, user_b) VALUES (?, ?)'),
    matchByPair: db.prepare('SELECT * FROM matches WHERE user_a = ? AND user_b = ?'),
    matchForUser: db.prepare('SELECT * FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?)'),
    deleteMatch: db.prepare('DELETE FROM matches WHERE id = ?'),
    deleteMatchByPair: db.prepare('DELETE FROM matches WHERE user_a = ? AND user_b = ?'),
    messageCount: db.prepare('SELECT COUNT(*) AS n FROM messages WHERE match_id = ?'),

    blockedEitherWay: db.prepare(
      'SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)',
    ),
    insertBlock: db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id) VALUES (?, ?)'),
    insertReport: db.prepare('INSERT INTO reports (reporter_id, reported_id, reason, details) VALUES (?, ?, ?, ?)'),

    // Candidates whose gender fits my interest and whose interest fits my gender,
    // with a complete profile, that I haven't swiped on yet. Other filters run in JS.
    candidates: db.prepare(
      `SELECT u.* FROM users u
       WHERE u.id != :me
         AND (:interested_in = 'everyone' OR u.gender = :interested_in)
         AND (u.interested_in = 'everyone' OR u.interested_in = :gender)
         AND u.city != ''
         AND (SELECT COUNT(*) FROM photos p WHERE p.user_id = u.id) >= :min_photos
         AND (SELECT COUNT(*) FROM prompts p WHERE p.user_id = u.id) >= :min_prompts
         AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = :me AND s.target_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = :me AND b.blocked_id = u.id)
                                                 OR (b.blocker_id = u.id AND b.blocked_id = :me))`,
    ),
    likesMe: db.prepare(
      `SELECT u.*, s.comment AS like_comment, s.liked_item, s.super AS super_like, s.created_at AS liked_at
       FROM swipes s JOIN users u ON u.id = s.swiper_id
       WHERE s.target_id = :me AND s.liked = 1
         AND NOT EXISTS (SELECT 1 FROM swipes mine WHERE mine.swiper_id = :me AND mine.target_id = u.id)
         AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = :me AND b.blocked_id = u.id)
                                                 OR (b.blocker_id = u.id AND b.blocked_id = :me))
       ORDER BY s.super DESC, s.created_at DESC, s.rowid DESC`,
    ),
    matches: db.prepare(
      `SELECT m.id AS match_id, m.created_at AS matched_at, u.*,
              (SELECT body FROM messages WHERE match_id = m.id ORDER BY id DESC LIMIT 1) AS last_message,
              (SELECT created_at FROM messages WHERE match_id = m.id ORDER BY id DESC LIMIT 1) AS last_message_at,
              (SELECT sender_id FROM messages WHERE match_id = m.id ORDER BY id DESC LIMIT 1) AS last_sender_id
       FROM matches m
       JOIN users u ON u.id = CASE WHEN m.user_a = :me THEN m.user_b ELSE m.user_a END
       WHERE m.user_a = :me OR m.user_b = :me
       ORDER BY COALESCE(last_message_at, m.created_at) DESC, m.id DESC`,
    ),
    messagesAfter: db.prepare(
      'SELECT id, sender_id, body, created_at FROM messages WHERE match_id = ? AND id > ? ORDER BY id LIMIT 200',
    ),
    insertMessage: db.prepare(
      'INSERT INTO messages (match_id, sender_id, body) VALUES (?, ?, ?) RETURNING id, sender_id, body, created_at',
    ),
  };

  // ---- Profile shapes ----

  function missingSteps(user) {
    const missing = [];
    if (q.photoCount.get(user.id).n < LIMITS.minPhotos) missing.push('photos');
    if (q.prompts.all(user.id).length < LIMITS.minPrompts) missing.push('prompts');
    if (!user.city) missing.push('location');
    return missing;
  }

  // What other people can see. Exact coordinates are never exposed, only a distance.
  function publicProfile(u, distance = null) {
    return {
      id: u.id,
      name: u.name,
      age: ageFrom(u.birthdate),
      gender: u.gender,
      city: u.city,
      hometown: u.hometown,
      distance_km: distance === null ? null : Math.max(1, Math.round(distance)),
      bio: u.bio,
      height_cm: u.height_cm,
      job_title: u.job_title,
      education: u.education,
      looking_for: u.looking_for,
      drinking: u.drinking,
      smoking: u.smoking,
      kids: u.kids,
      photos: q.photos.all(u.id),
      prompts: q.prompts.all(u.id),
    };
  }

  function ownProfile(u) {
    const missing = missingSteps(u);
    return {
      ...publicProfile(u),
      email: u.email,
      birthdate: u.birthdate,
      interested_in: u.interested_in,
      latitude: u.latitude,
      longitude: u.longitude,
      filters: parseFilters(u.filters),
      missing,
      profile_complete: missing.length === 0,
      terms_accepted: u.terms_version === TERMS_VERSION,
      super_swipes_left: Math.max(0, LIMITS.superSwipesPerDay - q.superSwipesToday.get(u.id).n),
    };
  }

  // A match with no messages expires a while after it was made (Bumble-style).
  function matchExpiry(match, messageCount) {
    if (messageCount > 0) return { expires_at: null, expired: false };
    const expiresAt = new Date(parseDbTime(match.created_at).getTime() + LIMITS.matchExpiryHours * 3600 * 1000);
    return { expires_at: expiresAt.toISOString(), expired: expiresAt <= new Date() };
  }

  const isBlocked = (a, b) => Boolean(q.blockedEitherWay.get(a, b, b, a));
  const pairOf = (a, b) => (a < b ? [a, b] : [b, a]);

  // ---- Middleware ----

  function requireAuth(req, _res, next) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = token && q.userBySession.get(token);
    if (!user) return next(new HttpError(401, 'Please log in'));
    req.user = user;
    req.token = token;
    next();
  }

  // Browsing, liking and messaging need a finished profile and the current Terms accepted.
  function requireComplete(req, _res, next) {
    if (req.user.terms_version !== TERMS_VERSION) {
      return next(new HttpError(403, 'Please accept the Terms & Conditions and Privacy Policy first'));
    }
    if (missingSteps(req.user).length) return next(new HttpError(403, 'Finish setting up your profile first'));
    next();
  }

  function loadMatch(req) {
    const id = int(req.params.id, 'match id', 1, Number.MAX_SAFE_INTEGER);
    const match = q.matchForUser.get(id, req.user.id, req.user.id);
    if (!match) throw new HttpError(404, 'Match not found');
    return match;
  }

  // ---- Public ----

  app.get('/api/options', (_req, res) => {
    res.json({ ...options, DEFAULT_FILTERS });
  });

  // ---- Auth ----

  app.post('/api/signup', (req, res) => {
    const body = req.body || {};
    const email = text(body.email ?? '', 'email', 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'A valid email is required');
    if (typeof body.password !== 'string' || body.password.length < 8) {
      throw new HttpError(400, 'Password must be at least 8 characters');
    }
    for (const field of ['name', 'gender', 'interested_in']) {
      if (body[field] === undefined) throw new HttpError(400, `${field} is required`);
    }
    if (body.accept_terms !== true) {
      throw new HttpError(400, 'Please confirm you are 18+ and accept the Terms & Conditions and Privacy Policy');
    }
    const birthdate = validateBirthdate(body.birthdate);
    const d = validateDetails({ name: body.name, gender: body.gender, interested_in: body.interested_in });
    if (q.userByEmail.get(email)) throw new HttpError(409, 'An account with that email already exists');

    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO users (email, password_hash, name, birthdate, gender, interested_in, filters, terms_version, terms_accepted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      )
      .run(email, hashPassword(body.password), d.name, birthdate, d.gender, d.interested_in, JSON.stringify(DEFAULT_FILTERS), TERMS_VERSION);
    const user = q.userById.get(lastInsertRowid);
    const token = newToken();
    q.insertSession.run(token, user.id);
    res.status(201).json({ token, user: ownProfile(user) });
  });

  app.post('/api/login', (req, res) => {
    const { email, password } = req.body || {};
    const user = typeof email === 'string' && q.userByEmail.get(email.trim().toLowerCase());
    if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
      throw new HttpError(401, 'Incorrect email or password');
    }
    const token = newToken();
    q.insertSession.run(token, user.id);
    res.json({ token, user: ownProfile(user) });
  });

  app.post('/api/logout', requireAuth, (req, res) => {
    q.deleteSession.run(req.token);
    res.status(204).end();
  });

  // ---- My profile ----

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: ownProfile(req.user) });
  });

  app.put('/api/me', requireAuth, (req, res) => {
    const changes = validateDetails(req.body || {});
    const fields = Object.keys(changes);
    if (fields.length) {
      const sets = fields.map((f) => `${f} = ?`).join(', ');
      db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...fields.map((f) => changes[f]), req.user.id);
    }
    res.json({ user: ownProfile(q.userById.get(req.user.id)) });
  });

  // For people who signed up before the current Terms (or before Terms existed).
  app.post('/api/me/accept-terms', requireAuth, (req, res) => {
    if ((req.body || {}).version !== TERMS_VERSION) {
      throw new HttpError(409, 'The Terms have changed. Please reload and review the latest version.');
    }
    q.acceptTerms.run(TERMS_VERSION, req.user.id);
    res.json({ user: ownProfile(q.userById.get(req.user.id)) });
  });

  app.put('/api/me/filters', requireAuth, (req, res) => {
    const filters = normalizeFilters(req.body || {});
    q.updateFilters.run(JSON.stringify(filters), req.user.id);
    res.json({ user: ownProfile(q.userById.get(req.user.id)) });
  });

  app.put('/api/me/prompts', requireAuth, (req, res) => {
    const list = (req.body || {}).prompts;
    if (!Array.isArray(list)) throw new HttpError(400, 'prompts must be a list');
    if (list.length > LIMITS.maxPrompts) throw new HttpError(400, `You can answer up to ${LIMITS.maxPrompts} prompts`);
    const clean = list.map((p, i) => {
      if (!PROMPTS.includes(p?.prompt)) throw new HttpError(400, `Prompt ${i + 1} is not one of the available prompts`);
      const answer = text(p.answer ?? '', 'answer', 250);
      if (!answer) throw new HttpError(400, `Please answer "${p.prompt}"`);
      return { prompt: p.prompt, answer };
    });
    if (new Set(clean.map((p) => p.prompt)).size !== clean.length) {
      throw new HttpError(400, 'Each prompt can only be used once');
    }
    transaction(db, () => {
      q.deletePrompts.run(req.user.id);
      clean.forEach((p, i) => q.insertPrompt.run(req.user.id, i, p.prompt, p.answer));
    });
    res.json({ user: ownProfile(req.user) });
  });

  // The body is the raw image (the browser resizes it first). JPEG, PNG and WebP are accepted.
  app.post(
    '/api/me/photos',
    requireAuth,
    express.raw({ type: () => true, limit: MAX_PHOTO_BYTES }),
    (req, res) => {
      if (q.photoCount.get(req.user.id).n >= LIMITS.maxPhotos) {
        throw new HttpError(400, `You can have up to ${LIMITS.maxPhotos} photos`);
      }
      const buf = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const ext = imageExtension(buf);
      if (!ext) throw new HttpError(400, 'Please upload a JPG, PNG or WebP image');
      const filename = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(uploadDir, filename), buf);
      const photo = q.insertPhoto.get(req.user.id, `/uploads/${filename}`);
      res.status(201).json({ photo, user: ownProfile(req.user) });
    },
  );

  app.delete('/api/me/photos/:id', requireAuth, (req, res) => {
    const photo = q.photoById.get(int(req.params.id, 'photo id', 1, Number.MAX_SAFE_INTEGER), req.user.id);
    if (!photo) throw new HttpError(404, 'Photo not found');
    q.deletePhoto.run(photo.id);
    if (photo.url.startsWith('/uploads/')) {
      fs.rm(path.join(uploadDir, path.basename(photo.url)), { force: true }, () => {});
    }
    res.json({ user: ownProfile(req.user) });
  });

  // ---- Discovery & likes ----

  // Everyone who fits both people's preferences and hasn't been swiped on or blocked.
  function eligibleCandidates(me) {
    const myFilters = parseFilters(me.filters);
    const rows = q.candidates.all({
      me: me.id,
      gender: me.gender,
      interested_in: me.interested_in,
      min_photos: LIMITS.minPhotos,
      min_prompts: LIMITS.minPrompts,
    });
    const results = [];
    for (const u of rows) {
      const pass = passesFilters(me, myFilters, u, parseFilters(u.filters));
      if (pass) results.push({ u, distance: pass.distance });
    }
    return results;
  }

  const byDistance = (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || a.u.id - b.u.id;

  app.get('/api/discover', requireAuth, requireComplete, (req, res) => {
    // Closest first; people without a location go last.
    const results = eligibleCandidates(req.user).sort(byDistance);
    res.json({
      profiles: results.slice(0, DISCOVER_PAGE_SIZE).map(({ u, distance }) => publicProfile(u, distance)),
    });
  });

  // What two people have in common, strongest first.
  function commonGround(me, myPrompts, u, theirPrompts, distance) {
    const found = [];
    if (me.looking_for && me.looking_for === u.looking_for) {
      found.push([3, `You both want: ${LOOKING_FOR[u.looking_for].toLowerCase()}`]);
    }
    for (const p of theirPrompts) {
      if (myPrompts.includes(p.prompt)) found.push([2, `You both answered "${p.prompt}"`]);
    }
    if (me.kids && me.kids === u.kids) found.push([1, `Same plans for children: ${KIDS[u.kids].toLowerCase()}`]);
    if (me.city && me.city === u.city) found.push([1, `You both live in ${u.city}`]);
    else if (distance !== null && distance < 10) found.push([1, 'Lives near you']);
    if (me.hometown && me.hometown === u.hometown) found.push([1, `You're both from ${u.hometown}`]);
    if (me.education && me.education === u.education) found.push([1, 'Similar education']);
    if (me.drinking && me.drinking === u.drinking) found.push([0.5, 'Similar drinking habits']);
    found.sort((a, b) => b[0] - a[0]);
    return { score: found.reduce((sum, [w]) => sum + w, 0), reasons: found.map(([, r]) => r) };
  }

  // A stable-per-day random number, so the picks change daily but not on every refresh.
  function dailyShuffle(meId, userId) {
    const day = new Date().toISOString().slice(0, 10);
    return parseInt(crypto.createHash('sha256').update(`${day}:${meId}:${userId}`).digest('hex').slice(0, 8), 16);
  }

  app.get('/api/recommended', requireAuth, requireComplete, (req, res) => {
    const me = req.user;
    const myPrompts = q.prompts.all(me.id).map((p) => p.prompt);
    const scored = eligibleCandidates(me).map((c) => {
      const prompts = q.prompts.all(c.u.id);
      return { ...c, ...commonGround(me, myPrompts, c.u, prompts, c.distance), shuffle: dailyShuffle(me.id, c.u.id) };
    });
    scored.sort((a, b) => b.score - a.score || a.shuffle - b.shuffle);
    const recommended = scored.slice(0, RECOMMENDED_SIZE);
    const picked = new Set(recommended.map((c) => c.u.id));
    const nearby = scored.filter((c) => !picked.has(c.u.id) && c.distance !== null).sort(byDistance).slice(0, RECOMMENDED_SIZE);
    const shape = ({ u, distance, reasons }) => ({ ...publicProfile(u, distance), common_ground: reasons });
    res.json({ recommended: recommended.map(shape), nearby: nearby.map(shape) });
  });

  function distanceBetween(a, b) {
    const pass = passesFilters(a, { ...DEFAULT_FILTERS }, b, { ...DEFAULT_FILTERS });
    return pass ? pass.distance : null;
  }

  // Checks that a liked photo/prompt really is on the target's profile; returns what to store.
  function validateLikedItem(item, target) {
    if (item === undefined || item === null) return null;
    if (item.type === 'photo') {
      const photoId = int(item.photo_id, 'photo_id', 1, Number.MAX_SAFE_INTEGER);
      if (!q.photoById.get(photoId, target.id)) throw new HttpError(400, 'That photo is not on their profile');
      return { type: 'photo', photo_id: photoId };
    }
    if (item.type === 'prompt') {
      if (!q.prompts.all(target.id).some((p) => p.prompt === item.prompt)) {
        throw new HttpError(400, 'That prompt is not on their profile');
      }
      return { type: 'prompt', prompt: item.prompt };
    }
    throw new HttpError(400, 'item.type must be photo or prompt');
  }

  // Turns a stored liked item into something the liked person can display.
  function describeLikedItem(json, owner) {
    if (!json) return null;
    const item = JSON.parse(json);
    if (item.type === 'photo') {
      const photo = q.photoById.get(item.photo_id, owner.id);
      return photo ? { type: 'photo', url: photo.url } : null;
    }
    const prompt = q.prompts.all(owner.id).find((p) => p.prompt === item.prompt);
    return prompt ? { type: 'prompt', prompt: prompt.prompt, answer: prompt.answer } : null;
  }

  // People who liked me and are waiting for my answer.
  app.get('/api/likes', requireAuth, (req, res) => {
    const rows = q.likesMe.all({ me: req.user.id });
    res.json({
      likes: rows.map((u) => ({
        super: Boolean(u.super_like),
        comment: u.like_comment,
        item: describeLikedItem(u.liked_item, req.user),
        liked_at: u.liked_at,
        profile: publicProfile(u, distanceBetween(req.user, u)),
      })),
    });
  });

  app.post('/api/swipes', requireAuth, requireComplete, (req, res) => {
    const { target_id, liked } = req.body || {};
    const isSuper = req.body.super === true;
    if (isSuper && liked !== true) throw new HttpError(400, 'A SuperSwipe must be a like');
    const targetId = int(target_id, 'target_id', 1, Number.MAX_SAFE_INTEGER);
    if (typeof liked !== 'boolean') throw new HttpError(400, 'liked must be true or false');
    const comment = liked ? text(req.body.comment ?? '', 'comment', MAX_COMMENT_LENGTH) : '';
    if (targetId === req.user.id) throw new HttpError(400, "You can't like yourself");
    const target = q.userById.get(targetId);
    if (!target || isBlocked(req.user.id, targetId)) throw new HttpError(404, 'User not found');
    if (isSuper && q.superSwipesToday.get(req.user.id).n >= LIMITS.superSwipesPerDay) {
      throw new HttpError(429, `You've used all ${LIMITS.superSwipesPerDay} SuperSwipes for today`);
    }
    const item = liked ? validateLikedItem(req.body.item, target) : null;

    const result = transaction(db, () => {
      q.upsertSwipe.run(req.user.id, targetId, liked ? 1 : 0, comment, item && JSON.stringify(item), isSuper ? 1 : 0);
      const theirLike = liked && q.likeFrom.get(targetId, req.user.id);
      if (!theirLike) return { matched: false };

      const [a, b] = pairOf(req.user.id, targetId);
      const { changes } = q.insertMatch.run(a, b);
      const match = q.matchByPair.get(a, b);
      if (changes) {
        // Comments sent with the likes open the conversation.
        if (theirLike.comment) q.insertMessage.get(match.id, targetId, theirLike.comment);
        if (comment) q.insertMessage.get(match.id, req.user.id, comment);
      }
      return { matched: true, match_id: match.id };
    });
    if (result.matched) result.profile = publicProfile(target, distanceBetween(req.user, target));
    result.super_swipes_left = Math.max(0, LIMITS.superSwipesPerDay - q.superSwipesToday.get(req.user.id).n);
    res.json(result);
  });

  // ---- Safety: block & report ----

  function loadOtherUser(req) {
    const id = int(req.params.id, 'user id', 1, Number.MAX_SAFE_INTEGER);
    if (id === req.user.id) throw new HttpError(400, "You can't do that to yourself");
    if (!q.userById.get(id)) throw new HttpError(404, 'User not found');
    return id;
  }

  // Blocking hides both people from each other everywhere and removes any match.
  function block(me, otherId) {
    q.insertBlock.run(me, otherId);
    q.deleteMatchByPair.run(...pairOf(me, otherId));
  }

  app.post('/api/users/:id/block', requireAuth, (req, res) => {
    const otherId = loadOtherUser(req);
    transaction(db, () => block(req.user.id, otherId));
    res.status(204).end();
  });

  app.post('/api/users/:id/report', requireAuth, (req, res) => {
    const otherId = loadOtherUser(req);
    const { reason } = req.body || {};
    if (!Object.hasOwn(REPORT_REASONS, reason ?? '')) {
      throw new HttpError(400, `reason must be one of: ${Object.keys(REPORT_REASONS).join(', ')}`);
    }
    const details = text(req.body.details ?? '', 'details', 1000);
    transaction(db, () => {
      q.insertReport.run(req.user.id, otherId, reason, details);
      block(req.user.id, otherId);
    });
    res.status(201).json({ reported: true });
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
        last_sender_id: r.last_sender_id,
        ...matchExpiry({ created_at: r.matched_at }, r.last_message ? 1 : 0),
        profile: publicProfile(r, distanceBetween(req.user, r)),
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
    const after = req.query.after === undefined ? 0 : int(req.query.after, 'after', 0, Number.MAX_SAFE_INTEGER);
    res.json({ messages: q.messagesAfter.all(match.id, after) });
  });

  app.post('/api/matches/:id/messages', requireAuth, requireComplete, (req, res) => {
    const match = loadMatch(req);
    const body = text((req.body || {}).body ?? '', 'body', MAX_MESSAGE_LENGTH);
    if (!body) throw new HttpError(400, 'Message cannot be empty');
    if (matchExpiry(match, q.messageCount.get(match.id).n).expired) {
      throw new HttpError(410, 'This match expired because nobody said hi in time');
    }
    res.status(201).json({ message: q.insertMessage.get(match.id, req.user.id, body) });
  });

  // ---- Errors ----

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') err = new HttpError(400, 'Invalid JSON body');
    if (err.type === 'entity.too.large') err = new HttpError(413, 'That file is too large');
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
  });

  return app;
}

module.exports = { createApp };
