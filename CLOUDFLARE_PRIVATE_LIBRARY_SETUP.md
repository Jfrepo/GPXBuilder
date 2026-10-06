# ManCardo private My Library — Cloudflare activation

This is the activation procedure for the private, local-first My Library sync implemented in PR #42. It does not change Shared Library.

## 1. Create the dedicated D1 database

Cloudflare Dashboard → D1 SQL Database → Create Database.

- Database name: `mancardo-private-library`
- Use a normal regional location hint appropriate to the main users; no special jurisdiction is required unless you have a compliance reason.

After creation, copy the **Database ID**.

## 2. Apply the additive schema

Open the new database → Console and run the contents of:

`migrations/0001_private_library.sql`

This migration is additive only. It creates:

- `private_library_tracks`
- `private_library_revisions`
- owner/update indexes
- immutable revision-history insert/update triggers

The Worker health check will refuse to report private storage ready if any required table/trigger is missing.

## 3. Bind D1 to the Worker build

The repository `wrangler.toml` must contain:

```toml
[[d1_databases]]
binding = "PRIVATE_LIBRARY_DB"
database_name = "mancardo-private-library"
database_id = "<DATABASE_ID>"
```

The database ID is an identifier, not an API credential.

## 4. Create Cloudflare Access authentication

Cloudflare Zero Trust → Access controls → Applications → Create new application → Self-hosted and private.

Create an application named `ManCardo Private Library` and protect only the private API path, not the whole ManCardo site.

For preview testing add:

`chatgpt-private-library-sync-foundation-mancardo.jayfenno.workers.dev/api/private-library/*`

For production add:

`mancardo.jayfenno.workers.dev/api/private-library/*`

Use the same Access application for both destinations so the Worker can use one AUD value.

Authentication:

- One-Time PIN email is sufficient for the initial release.
- The Allow policy must list the specific approved email address(es).
- Do not use an unrestricted `Everyone` Allow rule.

Copy:

- the Access **team domain** (for example `your-team.cloudflareaccess.com`)
- the application's **AUD / Application Audience tag**

These are identifiers/configuration values, not passwords.

## 5. Configure Worker variables

The Worker requires:

```text
CF_ACCESS_TEAM_DOMAIN=<team-domain>
CF_ACCESS_AUD=<application-aud-tag>
```

The Worker validates the Access JWT issuer, audience, expiry and RSA signature before reading or writing private track data.

## 6. Preview acceptance test

On the PR #42 preview:

1. Run **Device Check**. Private local workspace and D1 schema should pass. Authentication may show sign-in required until the next step.
2. Open the cloud sync control (`☁`) and choose **Sign in**.
3. Complete the Cloudflare Access email OTP.
4. Return to ManCardo and choose **Sync now**.
5. Import or create a small test track on Device A and confirm `☁ Synced`.
6. Open the same preview on Device B, sign in to the same Access account and Sync. Confirm the track appears.
7. Edit on Device B, sync, then return to Device A and confirm the newer revision arrives.
8. Run the offline queue and conflict tests in `PRIVATE_LIBRARY_SYNC_ROLLOUT.md` before merging to production.

## Integrity limits

Cloudflare D1 currently limits a table row/string/BLOB to 2,000,000 bytes. ManCardo therefore enforces a lower private-sync track JSON ceiling of **1,750,000 bytes** to leave safety headroom for row metadata and future schema fields. Oversized tracks remain safe locally and can still be exported as GPX; they are rejected from cloud upload with a clear error rather than risking a partial/failed D1 write.

## Production release

Only merge PR #42 after:

- D1 binding is present in `wrangler.toml`;
- migration health passes;
- Access JWT authentication passes;
- Device Check passes the critical private-sync checks;
- a two-device import/edit/offline/conflict test succeeds.
