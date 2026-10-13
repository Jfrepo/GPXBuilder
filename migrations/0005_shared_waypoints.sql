CREATE TABLE IF NOT EXISTS shared_library_waypoints (
  shared_id TEXT PRIMARY KEY,
  source_owner TEXT NOT NULL,
  source_waypoint_id TEXT NOT NULL,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  icon TEXT NOT NULL DEFAULT 'pin',
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  modified_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  modified_by TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  UNIQUE(source_owner, source_waypoint_id)
);

CREATE INDEX IF NOT EXISTS idx_shared_library_waypoints_modified
  ON shared_library_waypoints(deleted, modified_at DESC);
