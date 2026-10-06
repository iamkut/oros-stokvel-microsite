CREATE TABLE IF NOT EXISTS submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  name        TEXT    NOT NULL,
  phone       TEXT    NOT NULL,
  flavour     TEXT    NOT NULL,
  province    TEXT,
  opt_in      INTEGER NOT NULL CHECK (opt_in IN (0, 1)),
  consent     INTEGER NOT NULL CHECK (consent = 1),
  ip_hash     TEXT,
  user_agent  TEXT,
  campaign    TEXT    NOT NULL DEFAULT 'stokvel-2026',
  UNIQUE(campaign, phone)
);

CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_ip_hash ON submissions(ip_hash, created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor   TEXT    NOT NULL,
  action  TEXT    NOT NULL,
  details TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at DESC);
