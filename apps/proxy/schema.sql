-- The whole database. Two tables, no user records, nothing that identifies a
-- person: a domain listing is public information, and an appeal is submitted by
-- someone acting on their own behalf who chose what to put in it.

CREATE TABLE IF NOT EXISTS listings (
  domain      TEXT PRIMARY KEY,
  feed        TEXT NOT NULL,
  entry_date  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appeals (
  reference   TEXT PRIMARY KEY,
  domain      TEXT NOT NULL,
  contact     TEXT,
  message     TEXT,
  created_at  TEXT NOT NULL
);

-- The retention sweep reads this; without it, 180 days is a claim rather than a
-- rule.
CREATE INDEX IF NOT EXISTS appeals_by_created ON appeals (created_at);

-- Two reads that happen on every appeal: how many this domain has filed in the
-- last hour, and whether this exact submission is already on file. Without the
-- index both are full scans of a table that only ever grows between sweeps —
-- and the first of them is the rate limit, so a slow count is a slow refusal.
CREATE INDEX IF NOT EXISTS appeals_by_domain ON appeals (domain, created_at);

-- Published feeds, served verbatim. The worker never signs: the private half of
-- the key stays off the server, so what is stored here is exactly what the
-- signing tool produced and exactly what the extension verifies.
CREATE TABLE IF NOT EXISTS feeds (
  name        TEXT PRIMARY KEY,
  body        TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
