-- Players allowed in (the admin is always allowed, from ADMIN_EMAIL), and how many characters each may keep.
CREATE TABLE players (
  email TEXT PRIMARY KEY,
  char_limit INTEGER NOT NULL DEFAULT 6,
  added_at INTEGER NOT NULL
);

-- Each character: its owner's verified email and the saved record (snapshot + operations), as JSON.
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX characters_owner ON characters (owner);
