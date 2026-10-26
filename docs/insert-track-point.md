# Insert track point

Select a visible editable track, choose **Insert track point**, tap its line between two existing points, then tap the desired new location. A yellow preview marks the selected segment before placement. This adds a geometry point, not a saved waypoint; it does not snap to roads or invent elevation/time data.

The operation uses the full segment geometry even where point markers are thinned. Junctions, exact endpoints and ambiguous overlapping segments ask the user to choose another location or zoom in. Other visible tracks cannot become the insertion target while this mode is active.

One placement is one Undo step. Undo during the preview returns to choosing a segment. Cancel restores the edit-session snapshot. The completion tick leaves changes unsaved; Save explicitly commits using the existing stale-row checks and local-save failure handling. IDs, metadata, other segments and saved waypoints are preserved.

No Cloudflare configuration, D1 schema, account access or provider requests change. Validation uses synthetic records in the emitted editor with all network requests intercepted; physical-device and live Development acceptance remain separate.
