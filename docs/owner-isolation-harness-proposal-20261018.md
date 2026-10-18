# Development owner-isolation harness: local review candidate

## Status and scope

This is local-only preparation. Nothing in this change selects the new entrypoint, publishes it, deploys it, changes authentication or permissions, or writes live records. The existing Development runtime, Wrangler configuration and manual deployment pin are unchanged. Production is out of scope.

The proposed page tests **bounded live server write isolation** with two already-authenticated, separate browser profiles. It does not test an identity transition inside the same editor workspace. Separate profiles must not be described as same-workspace account-switch coverage.

## Implementation boundary

`worker-owner-qualification.js` is a separate, currently unreferenced entrypoint importing the unchanged current runtime. It recognizes one exact page path, `/api/private-library/qualification/owner-isolation`, only on the existing Development origin. It returns that response before any editor HTML transformation. An ordinary static HTML asset is deliberately not used because the existing Worker stack injects application scripts into arbitrary HTML.

The entrypoint remains dormant until all three future configuration values are present and valid:

- `MANCARDO_QUALIFICATION_RUN`: the exact reviewed run identifier in the source.
- `MANCARDO_QUALIFICATION_ACCOUNT_A` and `_B`: two distinct, expected, lower-case 24-hex account keys. These are consistency identifiers, not credentials. No real values are included in this patch.

The signed health response, not a browser role selector, maps the caller to its fixed role. Missing, malformed, duplicate or unapproved identities fail closed. Existing Access policy coverage of the exact route must be verified before any later deployment; do not broaden a policy to make the test work without separate approval. An expired session or login prompt stops the test rather than authorizing a new sign-in.

The page never boots the editor, enumerates tracks, touches app storage, polls, reads credentials, imports third-party assets, or redirects to login or the editor. Its only targets are two fixed, newly proposed synthetic IDs with invented three-point geometry and notes. It performs no automatic requests or writes. Each mutation requires a deliberate, specifically labelled button action and a warning confirmation.

Marked requests use the existing exact `/api/private-library/tracks/{id}` endpoint. The additional outer checks reject partial or malformed marker headers, wrong origins, queries, paths, methods, caller bindings, revisions, extra payload fields and arbitrary IDs. Mutations require the exact same-origin Origin header. The original request, authentication, method, body and headers are then forwarded unchanged into the current runtime's same-request account guard and actual owner/revision SQL. There is no new mutation endpoint or authentication bypass.

Unmarked ordinary API/editor calls retain their existing behavior. This is a restricted diagnostic request path, **not** a two-ID sandbox for every client of Development.

Before foreign attempts, server-side exact reads require the caller's own expected live revision-1 record and absence of the foreign ID in the caller's own scope. No list query or database maintenance is introduced. The other owner's positive control must still be independently verified in that owner's profile; an absent foreign fixture could otherwise produce a meaningless rejection.

## Later bounded protocol, not authorized by this preparation

1. Review the local implementation/tests and public-content audit. Obtain approval before public upload, guarded deployment preparation and a new user-started Development run. Any deployment guard must attest the new entrypoint and configuration as well as the unchanged runtime/helper. The current workflow does not enable this page.
2. Preserve unsaved work and close extra Development tabs as appropriate. Open only the reviewed page in the two existing separate profiles. No logout, account switch, storage clearing, new credentials or extra permissions.
3. The page identifies each signed-in role. Create one new disposable record in each profile. Verify each exact owner record is live revision 1, matches the fixed payload/hash, and is not readable in the other profile. Stop on a pre-existing collision or unexpected result.
4. Obtain specific approval naming both exact disposable records and all four attempted mutations: B-to-A and A-to-B PUT plus DELETE. Warn that a protection defect could alter or permanently delete those records; treat deletion as irreversible. Existing private tracks and cleanup are excluded.
5. Perform each action once. Foreign PUT/DELETE use the caller's correct account header and base revision 1, so they exercise the owner predicate rather than merely fail an account-header mismatch. Expect exactly HTTP 409, `revision_conflict`, `current:null`. A generic 409, authentication failure or absent fixture is not a pass. Do not issue a foreign base-revision-zero PUT, which may legitimately create a separate same-ID row for the caller.
6. Re-read both rightful-owner records: revision 1, live, exact full payload/hash unchanged. Recheck the corresponding foreign reads remain 404. Preserve the two synthetic records and receipts. No automatic or implied cleanup.

The normal DELETE body flags mirror the existing client contract. They are not credentials or additional authorization enforced by the existing API. The current runtime's effective safeguards are verified identity, same-request account binding, owner-scoped SQL and revision comparison.

## Failure and evidence rules

Each mutation control is single-use **for that page load**, not a durable server-wide attempt counter. Reload is not permission to repeat a write. A failed, unexpected or uncertain response locks further writes; only exact reads remain available. There are no retries or revision upgrades. A never-settling fetch keeps the operation busy with all controls disabled; preserve the state and verify exact records from the other profile instead of reissuing it. No timeout/retry recovery is claimed.

Once a record has been observed or created in that page, disappearance or content/revision changes stop the read sequence. A first pre-creation 404 is only a receipt, not a successful ownership result. The page never declares overall PASS; both owners' receipts and positive controls require review. Receipt rendering omits arbitrary response/error fields and unexpected foreign payloads; only known codes, fixed-target metadata and an exactly matching own synthetic payload can be retained. A malformed server response must not become an export of unrelated content.

If the already-authorized primary cloud session is still valid, that side can be handled there; the user need only operate the existing separate test profile. Anticipate about eight guided stages: a NEW manual deployment run, open the test page, create its one record, read the exact controls, give the named mutation-risk approval, perform its two separate probe actions, re-read the controls, and return the receipt. Confirmation dialogs add clicks. The primary side would perform the corresponding approved actions separately. If both sides are user-operated, double the profile-specific steps. No new OTP or sign-in is assumed; an expired session stops the test. This is not a time guarantee.

Exact record comparisons establish only the bounded targets and observations, not unchanged history for every row or general security. Isolated SQL tests can inspect all synthetic rows/history; the live page does not inspect the entire database. The existing signed-JWT/SQLite and actual emitted-editor Chromium suites already exercise broader ownership, header, queue and account-race behavior in isolation, not live Access/D1 behavior.

## Remaining same-workspace gate

The live same-workspace account-switch gate remains unverified. Normal primary login may download a populated library; switching that workspace is not an acceptable disposable test. Cloudflare documents that its application-domain and team-domain logout endpoints revoke sessions across applications, not just one app. A new Access application alone does not establish logout isolation.

A combined live switching test would need a genuinely disposable data environment and a verified, explicitly approved identity-transition route that preserves the same editor workspace without affecting ordinary sessions. Those resources, sign-ins, permission changes and logout effects are not approved or implemented here. Retain the existing isolated browser/handler evidence and hold this live gate rather than substituting a separate-profile result.

Official session documentation: https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/

## Local checks

Server suite: `node --test tests/owner-qualification-server.test.cjs`.

Local aggregate: **213/213 passed**, zero failures, cancellations or skips (159 unchanged regression checks, 15 new actual-handler checks and 39 exact-client VM checks). These counts include the parent test nodes. The new Chromium fixture contains 19 behavioral scenarios plus its parent; all remain unexecuted locally because Chromium could not start inside the execution sandbox. The ordinary attempt failed on a denied local socket; one reviewed per-command attempt also failed during sandbox setup, before any page ran. No further attempt or security-setting change was made. Existing Chromium regression bodies also did not run in this local attempt; their earlier independently verified CI result remains historical.

The local no-deploy workflow delta appends only the new test paths to its two existing commands. After an explicitly approved public upload, CI is expected to execute 213 source checks and 62 Chromium test nodes (42 existing plus 20 new); none of that prospective browser result is claimed here. Missing browser prerequisites fail rather than skip. All workflow triggers, permissions, jobs, deployment files and pins remain unchanged. No test here is a live-service test. Public upload and deployment remain separate approval gates.
