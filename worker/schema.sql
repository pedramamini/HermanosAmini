-- SKLZ shared preset gallery
CREATE TABLE IF NOT EXISTS presets (
  id          TEXT PRIMARY KEY,          -- short url-safe slug
  name        TEXT NOT NULL,             -- display name as typed
  name_key    TEXT NOT NULL UNIQUE,      -- normalized, prevents duplicates
  config      TEXT NOT NULL,             -- JSON blob, schema-validated on write
  created_at  INTEGER NOT NULL,
  views       INTEGER NOT NULL DEFAULT 0,
  loads       INTEGER NOT NULL DEFAULT 0,
  author_hash TEXT,                      -- salted ip hash, for rate limiting only
  hidden      INTEGER NOT NULL DEFAULT 0 -- moderation kill switch
);
CREATE INDEX IF NOT EXISTS idx_rank ON presets (hidden, loads DESC, views DESC);
CREATE INDEX IF NOT EXISTS idx_recent ON presets (hidden, created_at DESC);

-- one row per author per hour, cheap abuse brake
CREATE TABLE IF NOT EXISTS writes (
  author_hash TEXT NOT NULL,
  hour_bucket INTEGER NOT NULL,
  n           INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (author_hash, hour_bucket)
);

-- Element requests from the site. Each becomes a public GitHub issue; the
-- email (optional) exists only to tell that person when their request ships.
CREATE TABLE IF NOT EXISTS requests (
  id           TEXT PRIMARY KEY,
  body         TEXT NOT NULL,
  email        TEXT,
  config       TEXT,
  created_at   INTEGER NOT NULL,
  issue_number INTEGER,           -- filled once the issue is filed
  filed_at     INTEGER,
  notified_open   INTEGER NOT NULL DEFAULT 0,  -- "we got it" mail sent
  notified_closed INTEGER NOT NULL DEFAULT 0,  -- "it shipped" mail sent
  author_hash  TEXT,
  probe_q      TEXT,             -- the follow-up we asked
  detail       TEXT              -- what they answered, if they did
);
CREATE INDEX IF NOT EXISTS idx_req_issue ON requests (issue_number);
CREATE INDEX IF NOT EXISTS idx_req_pending ON requests (notified_closed, issue_number);

/* ── short links ──
   Stores a CONFIG STRING, never a URL. See cleanShareString() in src/index.js:
   a shortener that stores URLs is an open redirect, and this one structurally
   cannot become one. `hash` makes the mint idempotent per board. */
CREATE TABLE IF NOT EXISTS shorts (
  code        TEXT PRIMARY KEY,
  q           TEXT NOT NULL,             -- "palette:3,hueShift:-40"
  hash        TEXT,                      -- salted hash of q, for dedupe
  created_at  INTEGER NOT NULL,
  hits        INTEGER NOT NULL DEFAULT 0,
  author_hash TEXT
);
CREATE INDEX IF NOT EXISTS idx_shorts_hash ON shorts (hash);
