# Mancardo development instructions

This repository uses a conversational development workflow.

- Treat `main` as production and `dev` as the integration/preview branch.
- Start functional changes from `dev`.
- Inspect existing behaviour before changing code.
- Implement complete user-facing behaviour, not isolated snippets.
- Preserve existing behaviour unless the request explicitly changes it.
- Keep desktop and mobile behaviour in mind.
- Document any Cloudflare or D1 impact.
- Never perform destructive D1 changes without explicit approval.
- Prefer small, reviewable changes and a pull request back to `dev`.
- When asked to put an approved change live, promote `dev` to `main`.
