# Workflow boundary hardening proposal

Status: **local-only proposal**, based on published candidate
`e2684562f2385cdf43649087d2093cf8b2a3efd1`. No publication, workflow dispatch,
deployment, migration, credential/settings change, merge or live operation has
been performed or authorized by this document.

## Narrow changes

1. Add a main-ref condition to the Production deployment job and a fixed,
   case-sensitive GITHUB_REF validation as its first step, before checkout.
   Existing main push/manual triggers are unchanged. Canonical feature,
   Development, release and tag refs skip the job. A case-variant Main ref can
   pass GitHub's case-insensitive job expression, but then fails closed before
   checkout/deploy. The shell logs only a fixed error, never the supplied ref.
2. Normalize case for the Production D1 UUID comparisons in the ordinary
   Development credential check and final config check. Previously an uppercase
   case variant passed both checks even though the injector accepted it.

Exactly six files change: the two deployment workflows, the existing
release-safety assertion, a new offline workflow-boundary test file, one added
source-suite path in the no-deploy qualification workflow, and this document.

Production/Development target identities, permissions, environments, credential
references, deployment commands, trigger scopes, runtime code, configuration
files and Production artifact composition are unchanged. The entire immutable
manual Development job remains byte-for-byte unchanged and still checks out
`fe10024e79143d47fbaf86a3864f69db60fa7200`; this proposal cannot deploy the D1
acknowledgement correction.

## Local evidence

- The baseline was materialized from 120 files whose Git blob hashes all match
  the published e2684562 tree, not the obsolete local Git HEAD/index.
- New tests against unchanged workflows: 25 nodes, 10 passed and 15 failed
  (including failing parent nodes), reproducing missing Production guards,
  uppercase/mixed-case UUID acceptance and absent new wiring. The missing
  preflight stops its parent test before eight child cases can run.
- Same suite against the proposal: **33/33 pass**, including all eight exact
  Production shell cases (main, case variants, tag, feature, absent, newline).
- Complete no-deploy source command: **277/277 pass**, zero failures,
  cancellations or skips, under local Node v24.19.0. Existing CI uses Node 22;
  published exact-head CI is not claimed.
- Tests execute the exact extracted credential shell and Node config snippets
  using synthetic environment values and in-memory files. The deployment
  command is never run. Event/ref tests inspect the actual job expression and
  trigger shape; unchanged workflow portions are pinned by SHA-256 assertions.
- No browser or live qualification was run. No real credentials or owner IDs
  were read or added to fixtures.

## Important limits

This is **partial hardening, not release readiness**. The ordinary Development
route still lacks the manual route's API verification of exact database
UUID/name and existing Worker binding, immutable qualified checkout and full
source gate. Production still requires independently verified environment
protections, exact artifact qualification, target identity checks, backup/
restore evidence, rollback planning and explicit release authorization.

GitHub's ordinary string equality is case-insensitive, so the first-step shell
check is essential exact-case defense, not redundant validation. Environment
restrictions remain uninspected, not absent; GitHub may evaluate those before
running a job step. Production target-wide concurrency is a separate future
hardening recommendation and is not silently changed here.

The candidate's D1 acknowledgement pin/handler attestation and live ownership
qualification remain separate work. Do not rerun an old deployment expecting
this proposal or the acknowledgement fix. No release descriptions or PR state
outside this new scope document are changed.
