# GPX export

Library **Export** opens a read-only summary of all ticked saved tracks/routes and saved waypoints, with names and counts. The existing ticks are the persisted map-visibility flags (`visible !== false`). Search, category filters and active editor highlighting do not narrow that set. Unticked items are excluded; an empty set disables Download and Share rather than exporting everything.

Download produces one GPX 1.1 file. Capability-checked Share uses the same file; unsupported/rejected sharing retains explicit download, and cancelling native share never downloads automatically. Cancel/Escape closes the summary without changing ticks or saved records. There is no second selection UI or duplicate Library export button. Each saved track/waypoint menu also offers Export: its summary explicitly names that saved item alone, regardless of its own tick or other ticks, and leaves every tick unchanged.

The editor toolbar's separate **Export current track** retains its original behavior, including the current unsaved editor geometry. Library export uses saved records; save edits first. Delete behavior is unchanged and receives no new export selection state.

Both bulk and single-item summaries use the same download/share flow. A missing or ambiguous single-item target is rejected; it never falls back to bulk. The snapshot includes all saved record bytes and ticks. Before creating a file, export rejects any changed track or waypoint state and asks the user to reopen the summary. Names are rendered with textContent; XML text, coordinates, time and elevation are validated. GPX includes saved waypoint metadata and true track/route geometry, with no generated corner waypoints or dummy tracks. Disconnected route segments remain separate routes.

The browser serializer is literal String.raw source: do not inject a server function with .toString(), because Wrangler can add Worker-only helpers. `npm run test:waypoint-export-bundled` creates an actual Wrangler dry-run bundle and runs synthetic page tests against that emitted Worker. Desktop/mobile layout, download and stubbed native sharing are covered. This is not physical iPhone/Safari or Garmin testing. Full external XSD validation remains unverified (the earlier schema fetch was blocked).

No Cloudflare binding, D1 schema, security, service, database write or account API change is required.
