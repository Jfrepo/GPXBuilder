PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS shared_library_tracks (
  track_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  gpx TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  modified_by TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0,1))
);

CREATE INDEX IF NOT EXISTS idx_shared_library_tracks_modified
  ON shared_library_tracks(deleted, modified_at DESC, track_id);

CREATE TABLE IF NOT EXISTS shared_library_versions (
  track_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  name TEXT NOT NULL,
  gpx TEXT NOT NULL,
  modified_at INTEGER NOT NULL,
  modified_by TEXT NOT NULL,
  PRIMARY KEY (track_id, version),
  FOREIGN KEY (track_id) REFERENCES shared_library_tracks(track_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shared_library_versions_track
  ON shared_library_versions(track_id, version DESC);

CREATE TRIGGER IF NOT EXISTS trg_shared_library_tracks_after_insert
AFTER INSERT ON shared_library_tracks
BEGIN
  INSERT OR IGNORE INTO shared_library_versions
    (track_id, version, name, gpx, modified_at, modified_by)
  VALUES
    (NEW.track_id, NEW.current_version, NEW.name, NEW.gpx, NEW.modified_at, NEW.modified_by);
END;

CREATE TRIGGER IF NOT EXISTS trg_shared_library_tracks_after_update
AFTER UPDATE ON shared_library_tracks
WHEN NEW.current_version <> OLD.current_version
BEGIN
  INSERT OR IGNORE INTO shared_library_versions
    (track_id, version, name, gpx, modified_at, modified_by)
  VALUES
    (NEW.track_id, NEW.current_version, NEW.name, NEW.gpx, NEW.modified_at, NEW.modified_by);
END;
