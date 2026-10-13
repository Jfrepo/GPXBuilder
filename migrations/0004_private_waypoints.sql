-- Private My Library waypoint sync. Additive only.
CREATE TABLE IF NOT EXISTS private_library_waypoints (
  owner_id TEXT NOT NULL,
  waypoint_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  payload_json TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  client_modified_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  device_id TEXT,
  PRIMARY KEY (owner_id, waypoint_id)
);

CREATE INDEX IF NOT EXISTS idx_private_library_waypoints_owner_updated
  ON private_library_waypoints(owner_id, updated_at, waypoint_id);

CREATE TABLE IF NOT EXISTS private_library_waypoint_revisions (
  owner_id TEXT NOT NULL,
  waypoint_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  client_modified_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  device_id TEXT,
  PRIMARY KEY (owner_id, waypoint_id, revision)
);

CREATE TRIGGER IF NOT EXISTS trg_private_library_waypoints_after_insert
AFTER INSERT ON private_library_waypoints
BEGIN
  INSERT OR REPLACE INTO private_library_waypoint_revisions
    (owner_id, waypoint_id, revision, payload_json, deleted, client_modified_at, updated_at, device_id)
  VALUES
    (NEW.owner_id, NEW.waypoint_id, NEW.revision, NEW.payload_json, NEW.deleted, NEW.client_modified_at, NEW.updated_at, NEW.device_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_private_library_waypoints_after_update
AFTER UPDATE ON private_library_waypoints
BEGIN
  INSERT OR REPLACE INTO private_library_waypoint_revisions
    (owner_id, waypoint_id, revision, payload_json, deleted, client_modified_at, updated_at, device_id)
  VALUES
    (NEW.owner_id, NEW.waypoint_id, NEW.revision, NEW.payload_json, NEW.deleted, NEW.client_modified_at, NEW.updated_at, NEW.device_id);
END;
