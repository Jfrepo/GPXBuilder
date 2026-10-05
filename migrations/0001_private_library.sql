-- ManCardo private My Library cloud-sync foundation
-- Additive migration only. No existing tables are altered or deleted.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS private_library_tracks (
  owner_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  name TEXT NOT NULL,
  track_type TEXT NOT NULL CHECK (track_type IN ('track','route')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  content_sha256 TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT,
  PRIMARY KEY (owner_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_private_library_tracks_owner_updated
  ON private_library_tracks(owner_id, updated_at, track_id);

CREATE TABLE IF NOT EXISTS private_library_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  name TEXT NOT NULL,
  track_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  content_sha256 TEXT NOT NULL,
  deleted INTEGER NOT NULL CHECK (deleted IN (0,1)),
  updated_at INTEGER NOT NULL,
  device_id TEXT,
  UNIQUE (owner_id, track_id, revision)
);

CREATE INDEX IF NOT EXISTS idx_private_library_revisions_track
  ON private_library_revisions(owner_id, track_id, revision DESC);

-- Revision history is written by the database itself so a successful track mutation
-- cannot forget to create its corresponding immutable revision record.
CREATE TRIGGER IF NOT EXISTS trg_private_library_tracks_after_insert
AFTER INSERT ON private_library_tracks
BEGIN
  INSERT OR IGNORE INTO private_library_revisions
    (owner_id, track_id, revision, name, track_type, payload_json, content_sha256, deleted, updated_at, device_id)
  VALUES
    (NEW.owner_id, NEW.track_id, NEW.revision, NEW.name, NEW.track_type, NEW.payload_json, NEW.content_sha256, NEW.deleted, NEW.updated_at, NEW.device_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_private_library_tracks_after_update
AFTER UPDATE ON private_library_tracks
WHEN NEW.revision <> OLD.revision
BEGIN
  INSERT OR IGNORE INTO private_library_revisions
    (owner_id, track_id, revision, name, track_type, payload_json, content_sha256, deleted, updated_at, device_id)
  VALUES
    (NEW.owner_id, NEW.track_id, NEW.revision, NEW.name, NEW.track_type, NEW.payload_json, NEW.content_sha256, NEW.deleted, NEW.updated_at, NEW.device_id);
END;
