# Cancel track editing

The completion tick is the sole Complete Change control. It is amber with a visible
! while an edit awaits completion, and neutral/disabled otherwise. Cancel is a
fitted × directly below it on desktop (alongside it in the mobile toolbar), with
an accessible name and tooltip. The top banner contains mode guidance only. New route,
Extend, Move, Reverse, point deletion and Undo/Redo establish a cancellable working
session. Cancel confirms a remaining geometry change in a scoped, accessible
Mancardo dialog. Keep editing has initial focus; Escape, close and backdrop
dismiss without discarding. Confirm rechecks the original session, whole working
copy and saved row before restoring anything. Stale prompts cannot discard later
edits, completed Saves or concurrent updates. Cancel restores the pre-session
working copy and selection/history/dirty indicator, and exits editing. Empty or
fully undone sessions do not prompt. Join To Point before destination selection
retains its immediate Cancel exit without starting a discard session. A new route is discarded without naming,
creating a library row or deleting any existing track. Only recovery storage with
that draft's exact ID may be removed.

## Persistence boundaries

The session never rolls back library rows, sync metadata, an IndexedDB outbox,
cloud revisions or Shared publications. Earlier unsaved geometry and earlier
pending saves remain intact. A successful explicit local Save ends the boundary;
cloud acknowledgement can finish later. Subsequent edits start from the saved
working copy. A failed local write leaves editing open.

Split, Join Next and range deletion stage geometry when a session is active.
Their existing standalone persistence behavior is unchanged. Cross-track Join,
metadata/publication, destructive actions, import and track navigation require the
user to finish or cancel the current session first. Complete Change on an existing
track keeps the working changes unsaved. For a new route it opens naming; closing
the name dialog returns to the same session. Saving the name commits it.

Concurrent changes to the same saved library row (including another tab), or
replacement of the editor, deliberately block Cancel, Complete and Save. The
working edit remains available for export. This implementation does not merge or
roll back concurrent changes. A publication started earlier cannot replace active
working geometry; a confirmed deletion still being authorized blocks edit start.
Routine cloud upload acknowledgements do not change this boundary.

## Validation and scope

`npm run test:cancel` exercises the complete emitted editor with real Chromium,
Leaflet, localStorage and desktop/mobile controls. Fixtures intercept all network
requests. Tests cover exact restoration, confirmation refusal/repetition, earlier
dirty state/history, new/name-modal lifecycle, no-op and undo, successful/failed
Save, staged and standalone operations, concurrent updates, map navigation, range
selection and blocked note typing.

Six additional authenticated regressions in `request-volume-browser.test.cjs`
exercise real IndexedDB queues with synthetic held Save/rename uploads, blocked
note publication, delayed Shared publication, an upload acknowledgement while the
discard dialog is open, and pending deletion authorization.
They prove Cancel does not cause compensating PUT/DELETE/Shared publication and
cannot erase earlier durable saves. Existing responsive-toolbar tests now include
the new control and keyboard Cancel behavior. The selection-only Node adapter
loads the real session-leave guard in its inactive state.

Run source, packaged-server, browser, waypoint, map-performance, Cancel and
Development-release guard suites before publishing. The feature qualification
workflow runs those checks against the exact pushed commit and uploads a narrow
Development artifact. Its permissions are read-only and it cannot deploy.

No D1 schema, production data, authentication, Access policy, account ownership,
recovery design or production deployment configuration changes are included.
The delete module adds only a read-only pending-authorization query for the editor.
There is no new polling. These tests do not establish physical-device or live
Google-provider acceptance.

## Development handoff

Use `scripts/build-waypoint-development.cjs` to prepare the exact committed
runtime; `release.json` records source SHA and manifest SHA-256. The existing
Development Worker/database placeholders remain unresolved in the artifact.

Coordinate dispatch with the parent. The existing release controller and manual
workflow pins refer to older candidates and must not be run unchanged. Candidate
preparation must pin this reviewed commit and its manifest while retaining all
existing Worker/D1 identity, authentication, single-version, immutable-byte,
preflight, version-receipt and uncertain-outcome gates. The deployed HTML check
must verify the Cancel session code, and bounded acceptance must include Cancel
regressions. No live user-track write, storage clearing, migration, main merge or
Production deployment is part of this handoff.
