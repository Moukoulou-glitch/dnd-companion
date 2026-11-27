-- The admin's own tags on characters (Player, Character, Level, Campaign, General). The Worker also makes it
-- itself the first time it's needed (CREATE TABLE IF NOT EXISTS), so nothing has to be run by hand.
CREATE TABLE IF NOT EXISTS character_tags (id TEXT PRIMARY KEY, tags TEXT NOT NULL);
