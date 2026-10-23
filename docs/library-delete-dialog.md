# My Library single-track Delete confirmation

The row-menu Delete action uses a scoped Mancardo dialog. It names the exact track
using textContent, warns that deletion cannot be undone, and initially focuses
Keep track. Escape, close, backdrop and initial Enter keep the record. Tab stays
inside the modal. Opening again cannot retarget an existing confirmation.

The confirmation captures the library row, stored row, working editor and last
reconciled owner/revision/hash. Delete consumes its token once, hashes the captured
row and then reads the final workspace identity/revision. Changed account, revision,
content, editor or stored row fails closed without removing anything. An active
edit must be finished or cancelled first. The existing authorized tombstone queue,
owner checks, conflict handling and retry semantics remain in charge of deletion.
Bulk deletion, waypoint deletion and Shared unpublication are unchanged.

Validation uses synthetic Chromium/IndexedDB/API fixtures only. No user records,
D1 schema, authentication, security settings or deployment configuration change.
Development integration is held for parent coordination with the Fuel candidate.

## Suggested later dialog work (audit only)

1. Bulk My Library deletion, waypoint deletion and Shared deletion: consistent
   destructive confirmation, explicit affected names/count, safe default and
   separate exact owner/revision checks for each operation. Shared deletion must
   clearly describe unpublication rather than private-library deletion.
2. Track and waypoint rename prompts: branded form with focused current name,
   validation and distinct Cancel/Save; preserve existing persistence behavior.
3. Recovery prompt: describe the specific local draft, preserve it on dismissal,
   avoid converting dismissal into destructive deletion.
4. Save/conflict/publication failure alerts: accessible in-app feedback with
   actionable status; do not hide failures or imply a cloud save succeeded.
5. Find & Plan conversation clear and import/export information: lower priority.

Existing naming/save, import and waypoint overlays are already app-owned; audit
focus/labels before styling consistently. Native beforeunload is browser-owned:
its text/buttons cannot be reliably restyled. Preserve that browser protection.
