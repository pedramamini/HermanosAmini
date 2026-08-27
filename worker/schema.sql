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

/* ── telemetry ──
   One row per page LOAD in `hits`, one row per interaction in `events`.
   Read only by the admin dashboard at /adm/<ADMIN_TOKEN>. Raw client IPs are
   stored deliberately: the whole reason this exists is to recognise a signage
   player that cannot tell us who it is, and a salted hash cannot answer
   "which network is that". Retention is 60 days, swept on write. */
CREATE TABLE IF NOT EXISTS hits (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  sid      TEXT NOT NULL,        -- random per page load, never persisted client-side
  ip       TEXT,
  asn      INTEGER,
  org      TEXT,                 -- cf.asOrganization: the network's own name
  country  TEXT,
  city     TEXT,
  colo     TEXT,
  ua       TEXT,
  path     TEXT,
  ref      TEXT,                 -- document.referrer as the PAGE saw it
  mode     TEXT,                 -- gate | demo | kiosk | signage
  vw       INTEGER,
  vh       INTEGER,
  dpr      REAL,
  framed   INTEGER NOT NULL DEFAULT 0,
  ancestor TEXT,                 -- top-level origin when framed
  build    TEXT
);
CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits (ts DESC);
CREATE INDEX IF NOT EXISTS idx_hits_ip ON hits (ip, ts DESC);
CREATE INDEX IF NOT EXISTS idx_hits_sid ON hits (sid);

CREATE TABLE IF NOT EXISTS events (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts   INTEGER NOT NULL,
  sid  TEXT NOT NULL,
  kind TEXT NOT NULL,           -- key | cfg | dl | fx | panel | chat | share | photo | preset | voice | end
  name TEXT,                    -- the key char, the CFG dial, 'macos'/'windows', the effect...
  val  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ev_ts ON events (ts DESC);
CREATE INDEX IF NOT EXISTS idx_ev_kind ON events (kind, name);
CREATE INDEX IF NOT EXISTS idx_ev_sid ON events (sid);

/* Rules that force a viewer into demo mode: a bulletin board cannot click
   through a gate. `pat` is one of
     ip:1.2.3.4        exact client IP
     net:1.2.3.        IP prefix (plain string prefix match, so pick the dots)
     asn:13335         whole network
     ref:kitcast.tv    substring of the referrer the page reports
     ua:BrightSign     substring of the user agent
   Editable with one D1 INSERT, so adding a display never needs a page deploy. */
CREATE TABLE IF NOT EXISTS signage (
  pat      TEXT PRIMARY KEY,
  note     TEXT,
  added_at INTEGER NOT NULL,
  hits     INTEGER NOT NULL DEFAULT 0,
  last_at  INTEGER
);
