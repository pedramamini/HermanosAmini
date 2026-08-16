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
