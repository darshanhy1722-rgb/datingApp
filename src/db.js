const { DatabaseSync } = require('node:sqlite');

const SCHEMA_VERSION = 2;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  birthdate     TEXT    NOT NULL,             -- YYYY-MM-DD
  gender        TEXT    NOT NULL CHECK (gender IN ('man', 'woman', 'nonbinary')),
  interested_in TEXT    NOT NULL CHECK (interested_in IN ('man', 'woman', 'everyone')),
  bio           TEXT    NOT NULL DEFAULT '',
  city          TEXT    NOT NULL DEFAULT '',
  latitude      REAL,                         -- rounded to ~100 m, never shown to others
  longitude     REAL,
  height_cm     INTEGER,
  job_title     TEXT    NOT NULL DEFAULT '',
  education     TEXT,
  looking_for   TEXT,
  drinking      TEXT,
  smoking       TEXT,
  kids          TEXT,
  filters       TEXT    NOT NULL DEFAULT '{}', -- JSON, see normalizeFilters()
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url        TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompts (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  prompt   TEXT    NOT NULL,
  answer   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS swipes (
  swiper_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  liked      INTEGER NOT NULL CHECK (liked IN (0, 1)),
  comment    TEXT    NOT NULL DEFAULT '',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (swiper_id, target_id)
);

-- user_a is always the smaller id so each pair has exactly one row.
CREATE TABLE IF NOT EXISTS matches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id   INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id, id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id, id);
CREATE INDEX IF NOT EXISTS idx_prompts_user ON prompts(user_id, position);
CREATE INDEX IF NOT EXISTS idx_swipes_target ON swipes(target_id, liked);
`;

const TABLES = ['messages', 'matches', 'swipes', 'prompts', 'photos', 'sessions', 'users'];

function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON;');

  const { user_version: version } = db.prepare('PRAGMA user_version').get();
  const hasUsers = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (hasUsers && version !== SCHEMA_VERSION) {
    // Still pre-release: rather than migrating, start over with the new schema.
    console.warn(`Database schema changed (v${version} -> v${SCHEMA_VERSION}); resetting ${path}. Run "npm run seed" for demo data.`);
    db.exec('PRAGMA foreign_keys = OFF;');
    for (const t of TABLES) db.exec(`DROP TABLE IF EXISTS ${t};`);
    db.exec('PRAGMA foreign_keys = ON;');
  }

  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  return db;
}

// Runs fn inside a transaction, rolling back if it throws.
function transaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { openDb, transaction };
