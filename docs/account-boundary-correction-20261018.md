# Proposed private note/account-boundary correction

## Status

This is a separate runtime correction discovered while strengthening qualification,
not a change to the deployed version. Development still runs immutable
`3d7a43b23b6ddc12a96074425c0e87c2c4c76685`. The manual deployment workflow,
its runtime/config hashes, Production configuration, permissions and migrations
are unchanged. Do not rerun that workflow expecting this proposed correction.
A new runtime deployment requires separate approval and pin review.

## Reproduction

The tests-only [CI 39082034702](https://github.com/Jfrepo/GPXBuilder/actions/runs/39082034702)
at head `47ccfa6895d73508bcf6e799acaa52ab879b9859` passed 79 source checks and
21 of 22 Chromium cases. Offline deletion against an intervening revision-2
edit passed. The full-editor same-profile account-switch case failed because
an independently injected note bridge still made two private-list reads while
the principal sync client was correctly paused.

The exact emitted `mancardo-stable-note-ui` script reproduced both impacts with
synthetic data: another account's same-ID note overwrote the old local workspace,
and editing a local note caused a GET/PUT using the newly authenticated account.
A missing remote ID could receive the old workspace's full synthetic track;
a colliding ID could receive its name/note. These are client-workspace binding
failures, not an escape from the server's owner-scoped SQL. No live exploit or
existing-user-data mutation was performed.

The actual-handler SQLite tests additionally reproduced the stale-health window:
missing/wrong/pre-switch PUT binding did not stop creating or overwriting a record
owned by the currently authenticated account. Supplying a stale expected-owner
header on reads was also ignored. The prior server ownership predicates remained
correct, and paired live exact-record read checks remain valid within their scope.

## Narrow correction

Only the final Development wrapper changes runtime behavior:

- Retain local/shared note rendering, but disable the legacy bridge's parallel
  private reads/writes. Actual textarea edits continue through
  `saveTrackNote -> persistLibrary ->` the existing revision-aware cloud queue.
- Keep the verified workspace owner when a different account's health check is
  rejected; pause readiness instead of relabeling in-flight queued work.
- Attach the stored workspace identity to private track reads/uploads. Queued
  PUTs and conflict GETs carry the operation's original owner explicitly.
- Validate that identity on the same authenticated server request. PUT requires
  `x-mancardo-private-account`; supplied headers on GET/list are validated.
  Deliberate authenticated no-header reads remain supported. Existing explicit
  DELETE account/revision checks are unchanged.
- Abort an awaited tombstone reconciliation when the workspace becomes paused,
  even if its original owner key remains intact. Preserve local/editor/outbox data.

Old clients lacking the new PUT header will fail closed after any future approved
rollout. Every Development client must refresh without clearing storage or losing
unsaved work. A header is a consistency guard, not an authentication credential:
the actual verified JWT remains authoritative for server ownership.

## Qualification

The local source command passed **93/93**, zero skips. It includes 17 actual
server/SQLite results, four exact emitted-note script cases, and the new
paused-during-await preservation regression. The immutable manual deployment
check explicitly rejects the new, unapproved runtime before any API access.

The immutable deployed wrapper was rerun against the new ownership/note cases:
8 passed and 13 failed (12 substantive failures plus the failed suite parent),
including all four note cases and eight account-header cases. Only its import
locator was adapted to the existing local dependency; business source stayed
identical to the stored deployed fixture. These failures are retained evidence.

```sh
node --test tests/release-safety.test.cjs tests/generated-html.test.cjs tests/delete-client.test.cjs tests/deployment-guard.test.cjs tests/delete-cross-client-node.test.cjs tests/remote-tombstone-review.test.cjs tests/server-owner-isolation.test.cjs tests/note-account-boundary.test.cjs
node --test tests/delete-behavior.test.cjs tests/delete-cross-client.test.cjs
```

The browser suite now has 25 cases. Added cases cover actual note editing and
receiver reload, an authenticated-session change without reload, and an account
rejection while a real queue hash is held. They retain exact owner headers,
server content, queued edits and eventual original-owner recovery assertions.
Browser execution of this correction remains pending exact-commit CI; local
Chromium restrictions were not bypassed. Map/auth/API fixtures remain substitutes
for live Cloudflare/D1. No general release or live account-switch approval is
claimed, even if this isolated suite passes.
