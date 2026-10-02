# Mancardo Conversational Development Workflow

## Purpose
This repository is maintained through plain-English functional requests from ChatGPT.

## Branch model
- `main` = production source.
- `dev` = integration / preview source.
- Feature work starts from `dev` on a short-lived branch named `chatgpt/<short-description>`.
- Completed work is proposed back to `dev` with a pull request.
- Production promotion is a pull request from `dev` to `main`.

## How to handle a functional request
When Justin asks for a product change such as "add a new track colour":
1. Inspect the existing implementation and related code before editing.
2. Translate the request into the smallest complete functional change.
3. Preserve existing behaviour unless the request explicitly changes it.
4. Make all required UI, state, persistence and backend changes together.
5. Do not require Justin to identify files, functions or implementation details.
6. Prefer a feature branch from `dev`.
7. Validate the change for obvious regressions, including desktop and mobile behaviour where relevant.
8. Open a pull request to `dev` summarising:
   - what changed;
   - any data/schema impact;
   - how it was validated;
   - any deployment or migration step still required.
9. Do not merge a D1-destructive change without explicit approval.
10. When Justin says "put it live", promote tested `dev` to `main`.

## Cloudflare
Cloudflare is the runtime and deployment target.
The intended deployment mapping is:
- `dev` -> Cloudflare preview/development deployment
- `main` -> Cloudflare production deployment

Cloudflare D1 is production data infrastructure. Schema migrations must be explicit, reviewable and non-destructive by default.

## Safety rules for D1
Treat these as requiring explicit approval before production execution:
- DROP TABLE / DROP COLUMN
- destructive data rewrites
- bulk DELETE or UPDATE without a rollback strategy
- migration steps that cannot be reversed

Additive schema changes should still be documented in the pull request.

## User experience
Justin should be able to request changes conversationally, for example:
- "Add burnt orange as a track colour."
- "Make the selected track thicker."
- "Add a duplicate-track command."
- "Remember the user's km/miles preference."

The implementation details belong to the development workflow, not the request.
